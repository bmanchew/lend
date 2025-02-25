import {
  users,
  verificationSessions,
  webhookEvents,
  KycStatus,
} from "@db/schema";
import { db } from "@db";
import { eq, and, lt, desc } from "drizzle-orm";
import axios from "axios";
import crypto from "crypto";
import { VerificationStatus, DiditWebhookPayload } from "../routes";

interface DiditConfig {
  clientId: string;
  clientSecret: string;
  webhookUrl: string;
  webhookSecret: string;
}

export interface DiditSessionConfig {
  userId: string | number;
  platform: "mobile" | "web";
  redirectUrl?: string;
  userAgent?: string;
}

interface VerificationSessionData {
  sessionId: string;
  userId: number;
  status: VerificationStatus;
  features: string;
  returnUrl?: string;
  documentData?: Record<string, any> | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
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
    const {
      DIDIT_CLIENT_ID,
      DIDIT_CLIENT_SECRET,
      DIDIT_WEBHOOK_URL,
      DIDIT_WEBHOOK_SECRET,
    } = process.env;

    if (
      !DIDIT_CLIENT_ID ||
      !DIDIT_CLIENT_SECRET ||
      !DIDIT_WEBHOOK_URL ||
      !DIDIT_WEBHOOK_SECRET
    ) {
      throw new Error(
        "Missing required Didit API credentials or webhook configuration",
      );
    }

    this.config = {
      clientId: DIDIT_CLIENT_ID,
      clientSecret: DIDIT_CLIENT_SECRET,
      webhookUrl: DIDIT_WEBHOOK_URL,
      webhookSecret: DIDIT_WEBHOOK_SECRET,
    };
  }

  private calculateRetryDelay(attempt: number): number {
    return Math.min(RETRY_DELAY_BASE * Math.pow(2, attempt), 60000);
  }

  private logAPICall(
    method: string,
    endpoint: string,
    startTime: number,
  ): void {
    const duration = Date.now() - startTime;
    console.log(
      `[DiditService] ${method} ${endpoint} completed in ${duration}ms`,
    );
  }

  public async getAccessToken(): Promise<string> {
    const startTime = Date.now();
    console.log("[DiditService] Attempting to get access token");

    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      console.log(
        "[DiditService] Using cached token, expires in",
        Math.round((this.tokenExpiry - Date.now()) / 1000),
        "seconds",
      );
      return this.accessToken;
    }

    try {
      const credentials = Buffer.from(
        `${this.config.clientId}:${this.config.clientSecret}`,
      ).toString("base64");

      console.log("[DiditService] Requesting new access token");
      const response = await axios.post<DiditAuthResponse>(
        "https://apx.didit.me/auth/v2/token/",
        "grant_type=client_credentials",
        {
          headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      );

      const { access_token, expires_in } = response.data;

      this.accessToken = access_token;
      this.tokenExpiry = Date.now() + expires_in * 1000;

      this.logAPICall("POST", "/auth/v2/token", startTime);
      console.log(
        "[DiditService] New token obtained, expires in",
        expires_in,
        "seconds",
      );

      return access_token;
    } catch (error: any) {
      console.error("[DiditService] Error getting access token:", {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      throw new Error("Failed to authenticate with Didit API");
    }
  }

  async initializeKycSession(config: DiditSessionConfig): Promise<string> {
    const startTime = Date.now();
    const userId =
      typeof config.userId === "string"
        ? parseInt(config.userId)
        : config.userId;
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
      // const replitDomain = process.env.DEPLOYMENT_URL || process.env.REPLIT_DOMAIN;
      const replitDomain =
        "https://79368548-ffca-4dba-b3d2-66878c9daa1e-00-g9bbf0qgfdru.riker.replit.dev";

      if (!replitDomain) {
        throw new Error("Missing deployment URL configuration");
      }

      const callbackUrl = new URL("/customer/dashboard", replitDomain);
      console.log("[DiditService] Using webhook URL:", callbackUrl.toString());

      // Ensure return URL is absolute and includes domain
      const completeReturnUrl = config.redirectUrl?.startsWith("http")
        ? config.redirectUrl
        : new URL(config.redirectUrl || "/", replitDomain).toString();

      const isMobile =
        config.platform === "mobile" ||
        (config.userAgent &&
          /Mobile|Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
            config.userAgent,
          ));

      console.log("[DiditService] Session configuration:", {
        userId,
        isMobile,
        platform: config.platform,
        userAgent: config.userAgent?.substring(0, 50),
        returnUrl: completeReturnUrl,
      });

      const sessionResponse = await axios
        .post(
          "https://verification.didit.me/v1/session/",
          {
            callback: callbackUrl.toString(),
            features: "OCR + FACE",
            vendor_data: JSON.stringify({
              userId: user.id,
              username: user.username,
              platform: config.platform,
              userAgent: config.userAgent,
              sessionType: "verification",
            }),
            redirect_url: completeReturnUrl,
            app_scheme: "didit",
            mobile_flow: isMobile,
            mobile_settings: {
              allow_app: true,
              fallback_to_web: true,
              app_timeout: 10000,
              force_mobile_flow: isMobile,
              universal_link_enabled: true,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            timeout: 10000,
            validateStatus: (status) => status === 201,
          },
        )
        .catch((error) => {
          console.error(
            "[DiditService] Session creation failed:",
            error.response?.data || error.message,
          );
          throw new Error(
            error.response?.data?.message ||
              "Failed to create verification session",
          );
        });

      if (!sessionResponse.data?.url) {
        console.error(
          "[DiditService] Invalid API response format",
          sessionResponse.data,
        );
        throw new Error("Invalid response format from Didit API");
      }

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await db.insert(verificationSessions).values({
        sessionId: sessionResponse.data.session_id,
        userId,
        status: "initialized",
        features: "OCR + FACE",
        returnUrl: completeReturnUrl,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt,
      });

      await this.updateUserKycStatus(userId, "pending");
      this.logAPICall("POST", "/v1/session", startTime);

      return sessionResponse.data.url;
    } catch (error: any) {
      console.error("[DiditService] Error initializing KYC session:", {
        userId,
        error: error.message,
        response: error.response?.data,
        duration: Date.now() - startTime,
      });
      throw new Error(
        error.response?.data?.message || "Failed to start verification process",
      );
    }
  }
  // verifyWebhookSignature(
  //   requestBody: string,
  //   signatureHeader: string,
  //   timestampHeader: string,
  // ): boolean {
  //   console.log("[DiditService] Verifying webhook signature");
  //   try {
  //     if (!signatureHeader || !timestampHeader) {
  //       console.error("[DiditService] Missing webhook headers");
  //       return false;
  //     }

  //     const timestamp = parseInt(timestampHeader);
  //     const currentTime = Math.floor(Date.now() / 1000);

  //     if (Math.abs(currentTime - timestamp) > 300) {
  //       console.error("[DiditService] Webhook timestamp is stale", {
  //         webhookTime: timestamp,
  //         currentTime,
  //         difference: Math.abs(currentTime - timestamp),
  //       });
  //       return false;
  //     }

  //     const expectedSignature = crypto
  //       .createHmac("sha256", this.config.webhookSecret)
  //       .update(requestBody)
  //       .digest("hex");

  //     const isValid = crypto.timingSafeEqual(
  //       Buffer.from(signatureHeader),
  //       Buffer.from(expectedSignature),
  //     );

  //     console.log("[DiditService] Webhook signature verification", {
  //       isValid,
  //       timestamp,
  //       timeDiff: Math.abs(currentTime - timestamp),
  //     });

  //     return isValid;
  //   } catch (error) {
  //     console.error("[DiditService] Error verifying webhook signature:", error);
  //     return false;
  //   }
  // }

  // In diditService.ts - Update processWebhook function

  async processWebhook(payload: DiditWebhookPayload): Promise<void> {
    const { session_id, status, vendor_data } = payload;

    console.log("[DiditService] Processing webhook", {
      sessionId: session_id,
      status,
      hasVendorData: !!vendor_data,
    });

    try {
      // Store the webhook event
      await db.insert(webhookEvents).values({
        eventType: status,
        sessionId: session_id,
        status: "pending",
        payload: JSON.stringify(payload),
        createdAt: new Date(),
      });

      // Parse vendor data to get userId
      let userId = null;
      try {
        const vendorDataParsed = JSON.parse(vendor_data || "{}");
        userId = parseInt(vendorDataParsed.userId);

        console.log("[DiditService] Parsed vendor data", {
          userId,
          isValidUserId: !isNaN(userId) && userId > 0,
        });
      } catch (parseError) {
        console.error("[DiditService] Failed to parse vendor data", {
          vendorData: vendor_data,
          error: parseError,
        });
      }

      // Update verification session
      await db
        .update(verificationSessions)
        .set({
          status,
          updatedAt: new Date(),
        })
        .where(eq(verificationSessions.sessionId, session_id));

      console.log("[DiditService] Verification session updated", {
        sessionId: session_id,
        status,
      });

      // Update user KYC status if final status received
      if (status === "Approved" || status === "Declined") {
        if (userId && !isNaN(userId)) {
          // Map Didit status to our internal status
          const newKycStatus =
            status === "Approved" ? KycStatus.VERIFIED : KycStatus.FAILED;

          console.log("[DiditService] Updating user KYC status", {
            userId,
            newStatus: newKycStatus,
          });

          await db
            .update(users)
            .set({ kycStatus: newKycStatus })
            .where(eq(users.id, userId));

          console.log("[DiditService] User KYC status updated successfully", {
            userId,
            newStatus: newKycStatus,
          });
          
          // If KYC is verified, automatically create a default contract offer
          if (newKycStatus === KycStatus.VERIFIED) {
            try {
              // Get user details
              const [user] = await db
                .select()
                .from(users)
                .where(eq(users.id, userId))
                .limit(1);
                
              if (user) {
                // Find an active merchant to associate the contract with
                const [merchant] = await db
                  .select()
                  .from(merchants)
                  .where(eq(merchants.active, true))
                  .limit(1);
                  
                if (merchant) {
                  const amount = 5000.00; // Default loan amount
                  const term = 36; // 36 months
                  const interestRate = 24.99; // 24.99% APR
                  const downPayment = amount * 0.05; // 5% down payment
                  
                  // Calculate monthly payment and total interest
                  const monthlyPayment = parseFloat(
                    ((amount * (interestRate / 100 / 12) * Math.pow(1 + (interestRate / 100 / 12), term)) / 
                    (Math.pow(1 + (interestRate / 100 / 12), term) - 1)).toFixed(2)
                  );
                  
                  const totalInterest = parseFloat(
                    ((monthlyPayment * term) - amount).toFixed(2)
                  );
                  
                  const contractNumber = `LN${Date.now()}`;
                  
                  // Create the contract
                  await db.insert(contracts).values({
                    merchantId: merchant.id,
                    customerId: userId,
                    contractNumber: contractNumber,
                    amount: amount.toString(),
                    term: term,
                    interestRate: interestRate.toString(),
                    downPayment: downPayment.toString(),
                    monthlyPayment: monthlyPayment.toString(),
                    totalInterest: totalInterest.toString(),
                    status: "pending",
                    underwritingStatus: "approved", // Auto-approve for demo
                    borrowerEmail: user.email,
                    borrowerPhone: user.phoneNumber || "",
                    active: true,
                  });
                  
                  console.log("[DiditService] Created default contract offer for verified user", {
                    userId,
                    merchantId: merchant.id,
                    amount,
                    term,
                  });
                } else {
                  console.error("[DiditService] No active merchant found to create contract offer");
                }
              }
            } catch (error) {
              console.error("[DiditService] Error creating default contract offer:", error);
              // Don't throw the error to avoid blocking the KYC status update
            }
          }
        }
      }

      // Mark webhook as processed
      await db
        .update(webhookEvents)
        .set({
          status: "processed",
          processedAt: new Date(),
        })
        .where(eq(webhookEvents.sessionId, session_id));

      console.log("[DiditService] Webhook processing completed", {
        sessionId: session_id,
      });
    } catch (error) {
      console.error("[DiditService] Error processing webhook:", error);
      throw error;
    }
  }

  private async scheduleWebhookRetry(sessionId: string): Promise<void> {
    console.log(
      "[DiditService] Scheduling webhook retry for session",
      sessionId,
    );
    try {
      const [event] = await db
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.sessionId, sessionId))
        .orderBy(desc(webhookEvents.createdAt))
        .limit(1);

      if (!event) {
        console.error(
          `[DiditService] No webhook event found for session ${sessionId}`,
        );
        return;
      }

      const currentRetryCount = event.retryCount || 0;
      if (currentRetryCount >= MAX_RETRY_ATTEMPTS) {
        console.error(
          `[DiditService] Max retry attempts reached for session ${sessionId}`,
          {
            attempts: currentRetryCount,
          },
        );
        return;
      }

      const nextRetryAt = new Date(
        Date.now() + this.calculateRetryDelay(currentRetryCount),
      );

      console.log("[DiditService] Scheduling next retry", {
        sessionId,
        attempt: currentRetryCount + 1,
        nextRetryAt,
      });

      await db
        .update(webhookEvents)
        .set({
          status: "retrying",
          retryCount: currentRetryCount + 1,
          nextRetryAt,
        })
        .where(eq(webhookEvents.id, event.id));
    } catch (error) {
      console.error("[DiditService] Error scheduling webhook retry:", error);
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
            eq(webhookEvents.status, "retrying"),
            lt(webhookEvents.retryCount, MAX_RETRY_ATTEMPTS),
            lt(webhookEvents.nextRetryAt, new Date()),
          ),
        );

      console.log("[DiditService] Found failed webhooks to retry", {
        count: failedEvents.length,
      });

      for (const event of failedEvents) {
        try {
          console.log("[DiditService] Retrying webhook", {
            eventId: event.id,
            sessionId: event.sessionId,
            attempt: event.retryCount,
          });

          await this.processWebhook(JSON.parse(event.payload));
        } catch (error) {
          console.error(
            `[DiditService] Retry failed for webhook event ${event.id}:`,
            error,
          );
        }
      }

      console.log("[DiditService] Completed webhook retries", {
        processed: failedEvents.length,
        duration: Date.now() - startTime,
      });
    } catch (error) {
      console.error("[DiditService] Error processing retry queue:", error);
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

      // Find the most recent verification session for this user
      const [session] = await db
        .select()
        .from(verificationSessions)
        .where(eq(verificationSessions.userId, userId))
        .orderBy(desc(verificationSessions.createdAt))
        .limit(1);

      if (!session) {
        console.log(
          "[DiditService] No verification session found for user",
          userId,
        );
        return user.kycStatus || "pending";
      }

      console.log("[DiditService] Found verification session", {
        userId,
        sessionId: session.sessionId,
        status: session.status,
      });

      const accessToken = await this.getAccessToken();

      // Use the session ID to get the status from Didit API
      const response = await axios.get(
        `https://verification.didit.me/v1/session/${session.sessionId}/decision/`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      this.logAPICall(
        "GET",
        `/v1/session/${session.sessionId}/decision/`,
        startTime,
      );

      if (response.data && response.data.status) {
        console.log("[DiditService] Retrieved verification status", {
          userId,
          sessionId: session.sessionId,
          status: response.data.status,
        });

        // Convert Didit status to our internal status format
        const internalStatus = this.mapDiditStatusToInternal(
          response.data.status,
        );
        await this.updateUserKycStatus(userId, internalStatus);
        return internalStatus;
      }

      console.log("[DiditService] Using fallback status", {
        userId,
        status: user.kycStatus || "pending",
      });

      return user.kycStatus || "pending";
    } catch (error: any) {
      console.error("[DiditService] Error checking verification status:", {
        userId,
        error: error.message,
        response: error.response?.data,
        duration: Date.now() - startTime,
      });

      // Fallback to the local status instead of throwing
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      return user?.kycStatus || "pending";
    }
  }

  // Helper function to map Didit status values to our internal format
  private mapDiditStatusToInternal(diditStatus: string): VerificationStatus {
    const status = diditStatus.toLowerCase();

    if (status === "approved") {
      return "verified";
    } else if (status === "declined") {
      return "failed";
    } else if (status === "not started" || status === "initialized") {
      return "pending";
    } else if (status === "in review" || status === "pending") {
      return "pending";
    } else {
      // Any other status maps to pending
      return "pending";
    }
  }

  async updateUserKycStatus(
    userId: number,
    status: VerificationStatus,
  ): Promise<void> {
    console.log("[DiditService] Updating user KYC status", {
      userId,
      status,
    });

    try {
      await db
        .update(users)
        .set({
          kycStatus: status.toLowerCase() as "pending" | "verified" | "failed",
        })
        .where(eq(users.id, userId));
    } catch (error) {
      console.error("[DiditService] Error updating user KYC status:", {
        userId,
        status,
        error,
      });
      throw error;
    }
  }

  verifyWebhookSignature(
    requestBody: string,
    signatureHeader: string,
    timestampHeader: string,
  ): boolean {
    console.log("[DiditService] Verifying webhook signature");
    try {
      if (!signatureHeader || !timestampHeader) {
        console.error("[DiditService] Missing webhook headers");
        return false;
      }

      const timestamp = parseInt(timestampHeader);
      const currentTime = Math.floor(Date.now() / 1000);

      if (Math.abs(currentTime - timestamp) > 300) {
        console.error("[DiditService] Webhook timestamp is stale", {
          webhookTime: timestamp,
          currentTime,
          difference: Math.abs(currentTime - timestamp),
        });
        return false;
      }

      const expectedSignature = crypto
        .createHmac("sha256", this.config.webhookSecret)
        .update(requestBody)
        .digest("hex");

      // Use regular string comparison if Buffer comparison fails
      try {
        const isValid = crypto.timingSafeEqual(
          Buffer.from(signatureHeader),
          Buffer.from(expectedSignature),
        );

        console.log("[DiditService] Webhook signature verification", {
          isValid,
          timestamp,
          timeDiff: Math.abs(currentTime - timestamp),
        });

        return isValid;
      } catch (err) {
        // Fallback to regular comparison if Buffer comparison fails
        const isValid = signatureHeader === expectedSignature;

        console.log(
          "[DiditService] Webhook signature verification (fallback)",
          {
            isValid,
            timestamp,
            timeDiff: Math.abs(currentTime - timestamp),
          },
        );

        return isValid;
      }
    } catch (error) {
      console.error("[DiditService] Error verifying webhook signature:", error);
      return false;
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
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      this.logAPICall("GET", `/v1/session/${sessionId}`, startTime);
      console.log("[DiditService] Retrieved session status", {
        sessionId,
        status: response.data.status,
      });

      return response.data.status;
    } catch (error: any) {
      console.error("[DiditService] Error getting session status:", {
        sessionId,
        error: error.message,
        response: error.response?.data,
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }
}

// Export singleton instance
export const diditService = new DiditService();
