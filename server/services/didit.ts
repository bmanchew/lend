import { users } from "@db/schema";
import { db } from "@db";
import { eq } from "drizzle-orm";
import axios from "axios";
import crypto from 'crypto';

interface DiditConfig {
  apiKey: string;
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  webhookUrl: string;
  webhookSecret: string;
}

interface DiditAuthResponse {
  access_token: string;
  expires_in: number;
}

class DiditService {
  private config: DiditConfig;
  private axios: any;
  private accessToken: string | null = null;
  private tokenExpiry: number | null = null;

  constructor() {
    const { DIDIT_API_KEY, DIDIT_CLIENT_ID, DIDIT_CLIENT_SECRET, DIDIT_WEBHOOK_URL, DIDIT_WEBHOOK_SECRET } = process.env;

    if (!DIDIT_CLIENT_ID || !DIDIT_CLIENT_SECRET || !DIDIT_WEBHOOK_URL || !DIDIT_WEBHOOK_SECRET) {
      throw new Error("Missing required Didit API credentials or webhook configuration");
    }

    this.config = {
      apiKey: DIDIT_API_KEY || '',
      clientId: DIDIT_CLIENT_ID,
      clientSecret: DIDIT_CLIENT_SECRET,
      baseUrl: 'https://verify.staging.didit.me',
      webhookUrl: DIDIT_WEBHOOK_URL,
      webhookSecret: DIDIT_WEBHOOK_SECRET
    };

    this.axios = axios.create({
      baseURL: this.config.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
  }

  private async getAccessToken(): Promise<string> {
    // Check if we have a valid token
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      // Create base64 encoded credentials
      const credentials = Buffer.from(
        `${this.config.clientId}:${this.config.clientSecret}`
      ).toString('base64');

      // Get new access token
      const response = await axios.post('https://apx.didit.me/auth/v2/token/', 
        'grant_type=client_credentials',
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      const { access_token, expires_in } = response.data;

      // Store token and expiry
      this.accessToken = access_token;
      this.tokenExpiry = Date.now() + (expires_in * 1000);

      return access_token;
    } catch (error: any) {
      console.error('Error getting access token:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with Didit API');
    }
  }

  // Verify webhook signature using the provided secret
  verifyWebhookSignature(requestBody: string, signatureHeader: string, timestampHeader: string): boolean {
    try {
      // Check if timestamp is recent (within 5 minutes)
      const timestamp = parseInt(timestampHeader);
      const currentTime = Math.floor(Date.now() / 1000);
      if (Math.abs(currentTime - timestamp) > 300) {
        console.error('Webhook timestamp is stale');
        return false;
      }

      // Calculate expected signature
      const expectedSignature = crypto
        .createHmac('sha256', this.config.webhookSecret)
        .update(requestBody)
        .digest('hex');

      // Compare signatures using constant-time comparison
      return crypto.timingSafeEqual(
        Buffer.from(signatureHeader),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      console.error('Error verifying webhook signature:', error);
      return false;
    }
  }

  // Initialize KYC verification session
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

      console.log('Initializing KYC session for user:', {
        userId: user.id,
        email: user.email,
        name: user.name
      });

      // Get fresh access token
      const accessToken = await this.getAccessToken();

      // Create session with required parameters
      const response = await this.axios.post('/api/sessions', {
        vendor_data: user.id.toString(),
        callback_url: this.config.webhookUrl,
        webhook_url: this.config.webhookUrl,
        features: 'OCR + FACE',
        scope: ['IDENTITY'],
        email: user.email,
        full_name: user.name
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      console.log('KYC session response:', response.data);

      if (!response.data || !response.data.session_url) {
        console.error('Invalid session response:', response.data);
        throw new Error("Invalid response format from Didit API");
      }

      await this.updateUserKycStatus(userId, 'pending');
      return response.data.session_url;

    } catch (error: any) {
      console.error("Error initializing KYC session:", error.response?.data || error.message);
      throw new Error(error.response?.data?.message || "Failed to start verification process");
    }
  }

  // Check KYC verification status
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
      const response = await this.axios.get(`/api/sessions/${user.id}/status`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

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

  // Update user's KYC status in our database
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