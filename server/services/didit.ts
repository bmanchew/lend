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
      baseUrl: 'https://api.didit.com/v1',
      webhookUrl: DIDIT_WEBHOOK_URL,
      webhookSecret: DIDIT_WEBHOOK_SECRET
    };

    this.axios = axios.create({
      baseURL: this.config.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'X-Client-ID': this.config.clientId,
        'Content-Type': 'application/json',
      }
    });
  }

  // Verify webhook signature using the provided secret
  verifyWebhookSignature(payload: string, signature: string): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
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

      const response = await this.axios.post('/kyc/sessions', {
        userId: user.id.toString(),
        email: user.email,
        name: user.name,
        callbackUrl: `${process.env.APP_URL || 'http://localhost:5000'}/api/kyc/callback`,
        webhookUrl: this.config.webhookUrl,
      });

      if (response.data && response.data.sessionId) {
        await this.updateUserKycStatus(userId, 'pending');
        return response.data.sessionId;
      }

      throw new Error("Failed to create KYC session");
    } catch (error: any) {
      console.error("Error initializing KYC session:", error.response?.data || error.message);
      throw error;
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

      const response = await this.axios.get(`/kyc/status/${user.id}`);

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