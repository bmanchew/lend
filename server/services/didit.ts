import { users } from "@db/schema";
import { db } from "@db";
import { eq } from "drizzle-orm";
import axios from "axios";
import crypto from 'crypto';

interface DiditConfig {
  clientId: string;
  clientSecret: string;
  webhookUrl: string;
  webhookSecret: string;
}

interface DiditAuthResponse {
  access_token: string;
  expires_in: number;
}

class DiditService {
  private config: DiditConfig;
  private accessToken: string | null = null;
  private tokenExpiry: number | null = null;

  constructor() {
    const { DIDIT_CLIENT_ID, DIDIT_CLIENT_SECRET, DIDIT_WEBHOOK_URL, DIDIT_WEBHOOK_SECRET } = process.env;

    if (!DIDIT_CLIENT_ID || !DIDIT_CLIENT_SECRET || !DIDIT_WEBHOOK_URL || !DIDIT_WEBHOOK_SECRET) {
      throw new Error("Missing required Didit API credentials or webhook configuration");
    }

    this.config = {
      clientId: DIDIT_CLIENT_ID,
      clientSecret: DIDIT_CLIENT_SECRET,
      webhookUrl: DIDIT_WEBHOOK_URL,
      webhookSecret: DIDIT_WEBHOOK_SECRET
    };
  }

  private async getAccessToken(): Promise<string> {
    // Check if we have a valid token
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const credentials = Buffer.from(
        `${this.config.clientId}:${this.config.clientSecret}`
      ).toString('base64');

      const response = await axios.post('https://apx.didit.me/auth/v2/token/', 
        'grant_type=client_credentials',
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      console.log('Auth response:', response.data);

      const { access_token, expires_in } = response.data;

      this.accessToken = access_token;
      this.tokenExpiry = Date.now() + (expires_in * 1000);

      return access_token;
    } catch (error: any) {
      console.error('Error getting access token:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with Didit API');
    }
  }

  verifyWebhookSignature(requestBody: string, signatureHeader: string, timestampHeader: string): boolean {
    try {
      const timestamp = parseInt(timestampHeader);
      const currentTime = Math.floor(Date.now() / 1000);
      if (Math.abs(currentTime - timestamp) > 300) {
        console.error('Webhook timestamp is stale');
        return false;
      }

      const expectedSignature = crypto
        .createHmac('sha256', this.config.webhookSecret)
        .update(requestBody)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signatureHeader),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      console.error('Error verifying webhook signature:', error);
      return false;
    }
  }

  async initializeKycSession(userId: number): Promise<string> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new Error("User not found");
      }

      const accessToken = await this.getAccessToken();
      console.log('Got access token for KYC session');

      // Create session according to documentation
      const callbackUrl = new URL(`${process.env.APP_URL || 'http://localhost:5000'}/api/kyc/callback`);

      // Session ID will be appended by Didit automatically
      const sessionData = {
        callback: callbackUrl.toString(),
        features: 'OCR + FACE',
        vendor_data: user.id.toString()
      };

      console.log('Creating KYC session with data:', sessionData);

      const response = await axios.post(
        'https://verification.didit.me/v1/session/', 
        sessionData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('KYC session response:', response.data);

      if (!response.data || !response.data.url) {
        console.error('Invalid session response:', response.data);
        throw new Error("Invalid response format from Didit API");
      }

      await this.updateUserKycStatus(userId, 'pending');
      return response.data.url;

    } catch (error: any) {
      console.error("Error initializing KYC session:", error.response?.data || error.message);
      throw new Error(error.response?.data?.message || "Failed to start verification process");
    }
  }

  async checkVerificationStatus(userId: number): Promise<string> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new Error("User not found");
      }

      const accessToken = await this.getAccessToken();

      const response = await axios.get(
        `https://verification.didit.me/v1/session/${user.id}/status`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data && response.data.status) {
        await this.updateUserKycStatus(userId, response.data.status);
        return response.data.status;
      }

      return user.kycStatus || 'pending';
    } catch (error: any) {
      console.error("Error checking verification status:", error.response?.data || error.message);
      throw error;
    }
  }

  async updateUserKycStatus(userId: number, status: string): Promise<void> {
    try {
      await db
        .update(users)
        .set({ kycStatus: status as "pending" | "verified" | "failed" })
        .where(eq(users.id, userId));
    } catch (error) {
      console.error("Error updating user KYC status:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const diditService = new DiditService();