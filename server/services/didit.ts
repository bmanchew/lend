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

interface DiditSessionConfig {
  userId: number;
  platform: 'mobile' | 'web';
  userAgent?: string;
  returnUrl?: string;
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

    console.log("[DiditService] Initialized with configuration", {
      webhookUrl: 'https://shi-fi-lend-brandon263.replit.app/api/kyc/webhook',
      clientId: this.config.clientId.substring(0, 4) + '***'
    });
  }

  private calculateRetryDelay(attempt: number): number {
    return Math.min(RETRY_DELAY_BASE * Math.pow(2, attempt), 60000);
  }

  private logAPICall(method: string, endpoint: string, startTime: number) {
    const duration = Date.now() - startTime;
    console.log(`[DiditService] ${method} ${endpoint} completed in ${duration}ms`);
  }

  public async getAccessToken(): Promise<string> {
    const startTime = Date.now();
    console.log("[DiditService] Attempting to get access token");

    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      console.log("[DiditService] Using cached token, expires in",
        Math.round((this.tokenExpiry - Date.now()) / 1000), "seconds");
      return this.accessToken;
    }

    try {
      const credentials = Buffer.from(
        `${this.config.clientId}:${this.config.clientSecret}`
      ).toString('base64');

      console.log("[DiditService] Requesting new access token");
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

      this.logAPICall('POST', '/auth/v2/token', startTime);
      console.log("[DiditService] New token obtained, expires in", expires_in, "seconds");

      return access_token;
    } catch (error: any) {
      console.error('[DiditService] Error getting access token:', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      throw new Error('Failed to authenticate with Didit API');
    }
  }

  async initializeKycSession({ userId, platform, userAgent, returnUrl }: DiditSessionConfig): Promise<string> {
    const startTime = Date.now();
    console.log("[DiditService] Initializing KYC session for user", userId);

    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        console.error("[DiditService] User not found", userId);
        throw new Error("User not found");
      }

      const accessToken = await this.getAccessToken();
      const replitDomain = process.env.DEPLOYMENT_URL || 'https://shi-fi-lend-brandon263.replit.app';
      const callbackUrl = new URL('/api/kyc/webhook', replitDomain);

      console.log("[DiditService] Using webhook URL:", callbackUrl.toString());

      // Ensure return URL is absolute and includes domain
      const completeReturnUrl = returnUrl?.startsWith('http')
        ? returnUrl
        : new URL(returnUrl || '/', replitDomain).toString();

      const isMobile = platform === 'mobile' || (userAgent && /Mobile|Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent));

      console.log("[DiditService] Session configuration:", {
        userId,
        isMobile,
        platform,
        userAgent: userAgent?.substring(0, 50),
        returnUrl: completeReturnUrl
      });

      const sessionData = {
        callback: callbackUrl.toString(),
        features: 'OCR + FACE',
        vendor_data: JSON.stringify({
          userId: user.id,
          username: user.username,
          platform,
          userAgent,
          sessionType: 'verification'
        }),
        redirect_url: completeReturnUrl,
        app_scheme: 'didit',
        mobile_flow: isMobile,
        mobile_settings: {
          allow_app: true,
          fallback_to_web: true,
          app_timeout: 10000,
          force_mobile_flow: isMobile,
          universal_link_enabled: true
        }
      };

      const response = await axios.post(
        'https://verification.didit.me/v1/session/',
        sessionData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000,
          validateStatus: (status) => status === 201
        }
      ).catch(error => {
        console.error("[DiditService] Session creation failed:", error.response?.data || error.message);
        throw new Error(error.response?.data?.message || "Failed to create verification session");
      });

      if (!response.data || !response.data.url) {
        console.error("[DiditService] Invalid API response format", response.data);
        throw new Error("Invalid response format from Didit API");
      }

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await db.insert(verificationSessions).values({
        sessionId: response.data.session_id,
        userId,
        status: 'initialized',
        features: sessionData.features,
        returnUrl: completeReturnUrl,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt,
      });

      await this.updateUserKycStatus(userId, 'pending');

      this.logAPICall('POST', '/v1/session', startTime);
      return response.data.url;

    } catch (error: any) {
      console.error("[DiditService] Error initializing KYC session:", {
        userId,
        error: error.message,
        response: error.response?.data,
        duration: Date.now() - startTime
      });
      throw new Error(error.response?.data?.message || "Failed to start verification process");
    }
  }

  verifyWebhookSignature(requestBody: string, signatureHeader: string, timestampHeader: string): boolean {
    console.log("[DiditService] Verifying webhook signature");
    try {
      if (!signatureHeader || !timestampHeader) {
        console.error('[DiditService] Missing webhook headers');
        return false;
      }

      const timestamp = parseInt(timestampHeader);
      const currentTime = Math.floor(Date.now() / 1000);

      if (Math.abs(currentTime - timestamp) > 300) {
        console.error('[DiditService] Webhook timestamp is stale', {
          webhookTime: timestamp,
          currentTime,
          difference: Math.abs(currentTime - timestamp)
        });
        return false;
      }

      const expectedSignature = crypto
        .createHmac('sha256', this.config.webhookSecret)
        .update(requestBody)
        .digest('hex');

      const isValid = crypto.timingSafeEqual(
        Buffer.from(signatureHeader),
        Buffer.from(expectedSignature)
      );

      console.log("[DiditService] Webhook signature verification", {
        isValid,
        timestamp,
        timeDiff: Math.abs(currentTime - timestamp)
      });

      return isValid;
    } catch (error) {
      console.error('[DiditService] Error verifying webhook signature:', error);
      return false;
    }
  }

  async processWebhook(payload: any): Promise<void> {
    const startTime = Date.now();
    const { session_id, status, vendor_data, decision } = payload;

    if (!session_id || !status) {
      console.error("[DiditService] Invalid webhook payload:", { payload });
      throw new Error("Invalid webhook payload");
    }

    console.log("[DiditService] Processing webhook", {
      sessionId: session_id,
      status,
      vendorData: vendor_data,
      hasDecision: !!decision
    });

    // Validate status is one of the expected final states
    const isFinalStatus = ['Approved', 'Declined', 'In Review', 'Abandoned'].includes(status);
    if (isFinalStatus && !decision) {
      console.warn("[DiditService] Final status received without decision field", { status });
    }

    try {
      console.log("[DiditService] Logging webhook event");
      await db.insert(webhookEvents).values({
        sessionId: session_id,
        eventType: status,
        status: 'pending',
        payload,
        createdAt: new Date(),
      });

      console.log("[DiditService] Starting transaction for webhook processing");
      await db.transaction(async (tx) => {
        console.log("[DiditService] Updating session status");
        await tx
          .update(verificationSessions)
          .set({
            status,
            updatedAt: new Date(),
          })
          .where(eq(verificationSessions.sessionId, session_id));

        const normStatus = status.toLowerCase();
        if (normStatus === 'approved' || normStatus === 'declined') {
          const vendorData = JSON.parse(vendor_data);
          const userId = vendorData.userId;
          console.log("[DiditService] Updating user KYC status", {
            userId,
            username: vendorData.username,
            status: normStatus === 'approved' ? 'verified' : 'failed',
            originalStatus: status
          });

          await tx
            .update(users)
            .set({
              kycStatus: normStatus === 'approved' ? 'verified' : 'failed'
            })
            .where(eq(users.id, userId));
        }

        console.log("[DiditService] Marking webhook event as processed");
        await tx
          .update(webhookEvents)
          .set({
            status: 'processed',
            processedAt: new Date()
          })
          .where(eq(webhookEvents.sessionId, session_id));
      });

      console.log("[DiditService] Webhook processing completed", {
        sessionId: session_id,
        duration: Date.now() - startTime
      });
    } catch (error) {
      console.error('[DiditService] Error processing webhook:', {
        error,
        sessionId: session_id,
        duration: Date.now() - startTime
      });
      await this.scheduleWebhookRetry(session_id);
      throw error;
    }
  }

  private async scheduleWebhookRetry(sessionId: string): Promise<void> {
    console.log("[DiditService] Scheduling webhook retry for session", sessionId);
    try {
      const [event] = await db
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.sessionId, sessionId))
        .orderBy(desc(webhookEvents.createdAt))
        .limit(1);

      if (!event) {
        console.error(`[DiditService] No webhook event found for session ${sessionId}`);
        return;
      }

      const currentRetryCount = event.retryCount || 0;
      if (currentRetryCount >= MAX_RETRY_ATTEMPTS) {
        console.error(`[DiditService] Max retry attempts reached for session ${sessionId}`, {
          attempts: currentRetryCount
        });
        return;
      }

      const nextRetryAt = new Date(Date.now() + this.calculateRetryDelay(currentRetryCount));

      console.log("[DiditService] Scheduling next retry", {
        sessionId,
        attempt: currentRetryCount + 1,
        nextRetryAt
      });

      await db
        .update(webhookEvents)
        .set({
          status: 'retrying',
          retryCount: currentRetryCount + 1,
          nextRetryAt
        })
        .where(eq(webhookEvents.id, event.id));

    } catch (error) {
      console.error('[DiditService] Error scheduling webhook retry:', error);
    }
  }

  async retryFailedWebhooks(): Promise<void> {
    const startTime = Date.now();
    console.log("[DiditService] Starting retry of failed webhooks");

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

      console.log("[DiditService] Found failed webhooks to retry", {
        count: failedEvents.length
      });

      for (const event of failedEvents) {
        try {
          console.log("[DiditService] Retrying webhook", {
            eventId: event.id,
            sessionId: event.sessionId,
            attempt: event.retryCount
          });

          await this.processWebhook(event.payload);
        } catch (error) {
          console.error(`[DiditService] Retry failed for webhook event ${event.id}:`, error);
        }
      }

      console.log("[DiditService] Completed webhook retries", {
        processed: failedEvents.length,
        duration: Date.now() - startTime
      });
    } catch (error) {
      console.error('[DiditService] Error processing retry queue:', error);
    }
  }

  async checkVerificationStatus(userId: number): Promise<string> {
    const startTime = Date.now();
    console.log("[DiditService] Checking verification status for user", userId);

    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        console.error("[DiditService] User not found", userId);
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

      this.logAPICall('GET', `/v1/session/${user.id}/status`, startTime);

      if (response.data && response.data.status) {
        console.log("[DiditService] Retrieved verification status", {
          userId,
          status: response.data.status
        });

        await this.updateUserKycStatus(userId, response.data.status);
        return response.data.status;
      }

      console.log("[DiditService] Using fallback status", {
        userId,
        status: user.kycStatus || 'pending'
      });

      return user.kycStatus || 'pending';
    } catch (error: any) {
      console.error("[DiditService] Error checking verification status:", {
        userId,
        error: error.message,
        response: error.response?.data,
        duration: Date.now() - startTime
      });
      throw error;
    }
  }

  async updateUserKycStatus(userId: number, status: string): Promise<void> {
    console.log("[DiditService] Updating user KYC status", {
      userId,
      status
    });

    try {
      await db
        .update(users)
        .set({ kycStatus: status as "pending" | "verified" | "failed" })
        .where(eq(users.id, userId));

      console.log("[DiditService] User KYC status updated successfully", {
        userId,
        status
      });
    } catch (error) {
      console.error("[DiditService] Error updating user KYC status:", {
        userId,
        status,
        error
      });
      throw error;
    }
  }

  async getSessionStatus(sessionId: string): Promise<string> {
    const startTime = Date.now();
    console.log("[DiditService] Getting session status", sessionId);

    try {
      const accessToken = await this.getAccessToken();
      const response = await axios.get(
        `https://verification.didit.me/v1/session/${sessionId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      this.logAPICall('GET', `/v1/session/${sessionId}`, startTime);
      console.log("[DiditService] Retrieved session status", {
        sessionId,
        status: response.data.status
      });

      return response.data.status;
    } catch (error: any) {
      console.error("[DiditService] Error getting session status:", {
        sessionId,
        error: error.message,
        response: error.response?.data,
        duration: Date.now() - startTime
      });
      throw error;
    }
  }
}

const DEPLOYMENT_URL = process.env.DEPLOYMENT_URL || 'http://localhost:3001';

export const diditService = new DiditService();