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

class DiditService {
  private config: DiditConfig;
  private axios: any;

  constructor() {
    const { DIDIT_API_KEY, DIDIT_CLIENT_ID, DIDIT_CLIENT_SECRET, DIDIT_WEBHOOK_URL, DIDIT_WEBHOOK_SECRET } = process.env;

    if (!DIDIT_API_KEY || !DIDIT_CLIENT_ID || !DIDIT_CLIENT_SECRET || !DIDIT_WEBHOOK_URL || !DIDIT_WEBHOOK_SECRET) {
      throw new Error("Missing required Didit API credentials or webhook configuration");
    }

    this.config = {
      apiKey: DIDIT_API_KEY,
      clientId: DIDIT_CLIENT_ID,
      clientSecret: DIDIT_CLIENT_SECRET,
      baseUrl: 'https://verify.staging.didit.me',
      webhookUrl: DIDIT_WEBHOOK_URL,
      webhookSecret: DIDIT_WEBHOOK_SECRET
    };

    this.axios = axios.create({
      baseURL: this.config.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
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

      // Create session with required parameters based on documentation
      const response = await this.axios.post('/api/sessions', {
        vendor_data: user.id.toString(), // Used to identify the session in webhooks
        callback_url: `${process.env.APP_URL || 'http://localhost:5000'}/api/kyc/callback`,
        webhook_url: this.config.webhookUrl,
        features: 'OCR + FACE', // Enable document verification and face matching
        scope: ['IDENTITY'], // Request identity verification
        email: user.email,
        full_name: user.name,
      });

      console.log('KYC session response:', response.data);

      if (response.data && response.data.session_url) {
        await this.updateUserKycStatus(userId, 'pending');
        return response.data.session_url;
      }

      throw new Error("Failed to create KYC session - Invalid response format");
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

      const response = await this.axios.get(`/api/sessions/${user.id}/status`);

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