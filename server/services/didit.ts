import { users, verificationSessions, webhookEvents } from "@db/schema";
import { db } from "@db";
import { eq, and, lt, desc } from "drizzle-orm";
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

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_BASE = 5000; // 5 seconds base delay

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

  private calculateRetryDelay(attempt: number): number {
    return Math.min(RETRY_DELAY_BASE * Math.pow(2, attempt), 60000); // Max 1 minute delay
  }

  public async getAccessToken(): Promise<string> {
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

      const { access_token, expires_in } = response.data;

      this.accessToken = access_token;
      this.tokenExpiry = Date.now() + (expires_in * 1000);

      return access_token;
    } catch (error: any) {
      console.error('Error getting access token:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with Didit API');
    }
  }

  async initializeKycSession(userId: number, returnUrl?: string): Promise<string> {
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

      // Construct the Replit-specific callback URL
      const replitDomain = process.env.REPL_SLUG && process.env.REPL_OWNER
        ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
        : 'http://localhost:3000';

      // Construct callback URL with session tracking
      const callbackUrl = new URL('/api/kyc/callback', replitDomain);

      // Construct the complete return URL
      const completeReturnUrl = new URL(returnUrl || '/dashboard', replitDomain).toString();

      console.log('Initializing KYC session with:', {
        callback: callbackUrl.toString(),
        baseUrl: replitDomain,
        returnUrl: completeReturnUrl
      });

      const sessionData = {
        callback: callbackUrl.toString(),
        features: 'OCR + FACE',
        vendor_data: user.id.toString(),
        redirect_url: completeReturnUrl // Set the redirect_url to the full URL
      };

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

      if (!response.data || !response.data.url) {
        throw new Error("Invalid response format from Didit API");
      }

      // Create verification session record with returnUrl
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour expiration

      await db.insert(verificationSessions).values({
        userId,
        sessionId: response.data.session_id,
        status: 'initialized',
        features: sessionData.features,
        returnUrl: completeReturnUrl,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt,
      });

      await this.updateUserKycStatus(userId, 'pending');
      return response.data.url;

    } catch (error: any) {
      console.error("Error initializing KYC session:", error.response?.data || error.message);
      throw new Error(error.response?.data?.message || "Failed to start verification process");
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

  async processWebhook(payload: any): Promise<void> {
    const { session_id, status, vendor_data, decision } = payload;

    try {
      // Log webhook event
      await db.insert(webhookEvents).values({
        sessionId: session_id,
        eventType: status,
        status: 'pending',
        payload,
        createdAt: new Date(),
      });

      // Update verification session
      await db.transaction(async (tx) => {
        // Update session status
        await tx
          .update(verificationSessions)
          .set({
            status,
            documentData: decision?.kyc?.document_data || null,
            updatedAt: new Date(),
          })
          .where(eq(verificationSessions.sessionId, session_id));

        // Update user KYC status if final status received
        if (status === 'Approved' || status === 'Declined') {
          const userId = parseInt(vendor_data);
          await tx
            .update(users)
            .set({
              kycStatus: status === 'Approved' ? 'verified' : 'failed'
            })
            .where(eq(users.id, userId));
        }

        // Mark webhook event as processed
        await tx
          .update(webhookEvents)
          .set({
            status: 'processed',
            processedAt: new Date()
          })
          .where(eq(webhookEvents.sessionId, session_id));
      });
    } catch (error) {
      console.error('Error processing webhook:', error);
      await this.scheduleWebhookRetry(session_id);
      throw error;
    }
  }

  private async scheduleWebhookRetry(sessionId: string): Promise<void> {
    try {
      const [event] = await db
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.sessionId, sessionId))
        .orderBy(desc(webhookEvents.createdAt))
        .limit(1);

      if (!event) {
        console.error(`No webhook event found for session ${sessionId}`);
        return;
      }

      const currentRetryCount = event.retryCount || 0;
      if (currentRetryCount >= MAX_RETRY_ATTEMPTS) {
        console.error(`Max retry attempts reached for session ${sessionId}`);
        return;
      }

      const nextRetryAt = new Date(Date.now() + this.calculateRetryDelay(currentRetryCount));

      await db
        .update(webhookEvents)
        .set({
          status: 'retrying',
          retryCount: currentRetryCount + 1,
          nextRetryAt
        })
        .where(eq(webhookEvents.id, event.id));

    } catch (error) {
      console.error('Error scheduling webhook retry:', error);
    }
  }

  async retryFailedWebhooks(): Promise<void> {
    try {
      const failedEvents = await db
        .select()
        .from(webhookEvents)
        .where(
          and(
            eq(webhookEvents.status, 'retrying'),
            lt(webhookEvents.retryCount, MAX_RETRY_ATTEMPTS),
            lt(webhookEvents.nextRetryAt, new Date())
          )
        );

      for (const event of failedEvents) {
        try {
          await this.processWebhook(event.payload);
        } catch (error) {
          console.error(`Retry failed for webhook event ${event.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error processing retry queue:', error);
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

  // Add method to check session status by session ID
  async getSessionStatus(sessionId: string): Promise<string> {
    try {
      const accessToken = await this.getAccessToken();
      const response = await axios.get(
        `https://verification.didit.me/v1/session/${sessionId}/status`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.status;
    } catch (error: any) {
      console.error("Error getting session status:", error.response?.data || error.message);
      throw error;
    }
  }
}

// Export singleton instance
export const diditService = new DiditService();