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

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const credentials = Buffer.from(
        `${this.config.clientId}:${this.config.clientSecret}`
      ).toString('base64');

      console.log('Getting new access token...');

      const response = await axios.post('https://apx.didit.me/auth/v2/token',
        'grant_type=client_credentials',
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      console.log('Token response:', {
        status: response.status,
        hasToken: !!response.data.access_token,
        expiresIn: response.data.expires_in
      });

      const { access_token, expires_in } = response.data;

      this.accessToken = access_token;
      this.tokenExpiry = Date.now() + (expires_in * 1000);

      return access_token;
    } catch (error: any) {
      console.error('Error getting access token:', {
        error: error.response?.data || error.message,
        status: error.response?.status
      });
      throw new Error('Failed to authenticate with Didit API');
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
      console.log('Creating Didit session...');

      const sessionData = {
        callback: `${process.env.APP_URL || 'http://localhost:5000'}/api/kyc/callback`,
        features: 'OCR + FACE',
        vendor_data: userId.toString()
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

      console.log('Session creation response:', {
        status: response.status,
        sessionId: response.data?.session_id,
        hasUrl: !!response.data?.url
      });

      if (!response.data?.url || !response.data?.session_id) {
        throw new Error('Invalid response format from Didit API');
      }

      // Create verification session record
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour expiration

      await db.insert(verificationSessions).values({
        userId,
        sessionId: response.data.session_id,
        status: 'initialized',
        features: 'OCR + FACE',
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt,
      });

      await this.updateUserKycStatus(userId, 'pending');

      return response.data.url;
    } catch (error: any) {
      console.error("Error initializing KYC session:", {
        error: error.response?.data || error.message,
        status: error.response?.status
      });
      throw new Error(error.response?.data?.message || "Failed to start verification process");
    }
  }

  async getSessionStatus(sessionId: string): Promise<string> {
    try {
      console.log('Getting session status for:', sessionId);
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

      console.log('Status response:', {
        status: response.status,
        data: response.data
      });

      // If we get a valid status response
      if (response.data?.status) {
        // Map Didit statuses to our internal statuses
        switch (response.data.status.toLowerCase()) {
          case 'pending':
          case 'in_progress':
            return 'retrieved';
          case 'completed':
            return 'confirmed';
          case 'rejected':
            return 'declined';
          default:
            return response.data.status;
        }
      }

      // If session exists but no status, consider it pending
      return 'initialized';

    } catch (error: any) {
      console.error('Status check error:', {
        sessionId,
        error: error.response?.data || error.message,
        status: error.response?.status
      });

      // Handle specific error cases
      if (error.response?.status === 404) {
        // Session not found - could be not started yet
        return 'initialized';
      }

      if (error.response?.status === 401) {
        // Auth error - try refreshing token once
        try {
          this.accessToken = null;
          const newToken = await this.getAccessToken();

          const retryResponse = await axios.get(
            `https://verification.didit.me/v1/session/${sessionId}/status`,
            {
              headers: {
                'Authorization': `Bearer ${newToken}`,
                'Content-Type': 'application/json'
              }
            }
          );

          if (retryResponse.data?.status) {
            return retryResponse.data.status;
          }
        } catch (retryError) {
          console.error('Retry failed:', retryError);
        }
      }

      // For any other errors, keep the current status
      const [session] = await db
        .select()
        .from(verificationSessions)
        .where(eq(verificationSessions.sessionId, sessionId))
        .limit(1);

      return session?.status || 'initialized';
    }
  }

  private calculateRetryDelay(attempt: number): number {
    return Math.min(RETRY_DELAY_BASE * Math.pow(2, attempt), 60000);
  }

  verifyWebhookSignature(requestBody: string, signatureHeader: string, timestampHeader: string): boolean {
    try {
      const timestamp = parseInt(timestampHeader);
      const currentTime = Math.floor(Date.now() / 1000);

      // Verify timestamp is within 5 minutes
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
      console.error('Signature verification error:', error);
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

      // Update verification session and user status
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

        // Update user KYC status if final decision received
        if (status === 'Approved' || status === 'Declined') {
          const userId = parseInt(vendor_data);
          await tx
            .update(users)
            .set({
              kycStatus: status === 'Approved' ? 'verified' : 'failed'
            })
            .where(eq(users.id, userId));
        }

        // Mark webhook as processed
        await tx
          .update(webhookEvents)
          .set({
            status: 'processed',
            processedAt: new Date()
          })
          .where(eq(webhookEvents.sessionId, session_id));
      });
    } catch (error) {
      console.error('Webhook processing error:', error);
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
}

export const diditService = new DiditService();