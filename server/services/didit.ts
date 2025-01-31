import { users } from "@db/schema";
import { db } from "@db";
import { eq } from "drizzle-orm";
import axios from "axios";

interface DiditConfig {
  apiKey: string;
  clientId: string;
  clientSecret: string;
  baseUrl: string;
}

type KycStatus = "pending" | "verified" | "failed";

class DiditService {
  private config: DiditConfig;
  private axios: any;

  constructor() {
    const { DIDIT_API_KEY, DIDIT_CLIENT_ID, DIDIT_CLIENT_SECRET, NODE_ENV } = process.env;

    if (!DIDIT_API_KEY || !DIDIT_CLIENT_ID || !DIDIT_CLIENT_SECRET) {
      throw new Error("Missing required Didit API credentials");
    }

    // Use sandbox URL for development and testing
    const baseUrl = NODE_ENV === 'production' 
      ? 'https://api.didit.com/v1'
      : 'https://sandbox-api.didit.com/v1';

    this.config = {
      apiKey: DIDIT_API_KEY,
      clientId: DIDIT_CLIENT_ID,
      clientSecret: DIDIT_CLIENT_SECRET,
      baseUrl,
    };

    this.axios = axios.create({
      baseURL: this.config.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'X-Client-ID': this.config.clientId,
        'Content-Type': 'application/json',
      },
      timeout: 10000, // 10 second timeout
    });
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
        name: user.name,
        environment: process.env.NODE_ENV || 'development'
      });

      const payload = {
        userId: user.id.toString(),
        email: user.email,
        name: user.name,
        callbackUrl: `${process.env.APP_URL || 'http://localhost:5000'}/api/kyc/callback`,
        metadata: {
          userRole: user.role,
          environment: process.env.NODE_ENV || 'development'
        }
      };

      const response = await this.axios.post('/kyc/sessions', payload);
      console.log('KYC session created successfully:', {
        sessionId: response.data?.sessionId,
        status: response.status,
      });

      if (response.data && response.data.sessionId) {
        // Update user's KYC status to pending
        await this.updateUserKycStatus(userId, 'pending');
        return response.data.sessionId;
      }

      throw new Error("Failed to create KYC session - No session ID returned");
    } catch (error: any) {
      console.error("Error initializing KYC session:", {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
        config: {
          url: this.config.baseUrl + '/kyc/sessions',
          method: 'POST',
        }
      });
      throw new Error(error.response?.data?.message || "Failed to initialize KYC session");
    }
  }

  // Check KYC verification status
  async checkVerificationStatus(userId: number): Promise<KycStatus> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new Error("User not found");
      }

      console.log('Checking KYC status for user:', {
        userId: user.id,
        currentStatus: user.kycStatus,
        environment: process.env.NODE_ENV || 'development'
      });

      const response = await this.axios.get(`/kyc/status/${user.id}`);
      console.log('KYC status response:', {
        status: response.data?.status,
        httpStatus: response.status,
      });

      if (response.data && response.data.status) {
        const status = response.data.status as KycStatus;
        await this.updateUserKycStatus(userId, status);
        return status;
      }

      return user.kycStatus as KycStatus || 'pending';
    } catch (error: any) {
      console.error("Error checking verification status:", {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      // Don't throw error on status check, return current status from DB
      return 'pending';
    }
  }

  // Update user's KYC status in our database
  private async updateUserKycStatus(userId: number, status: KycStatus): Promise<void> {
    try {
      await db
        .update(users)
        .set({ kycStatus: status })
        .where(eq(users.id, userId));

      console.log('Updated user KYC status:', {
        userId,
        newStatus: status,
      });
    } catch (error) {
      console.error("Error updating user KYC status:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const diditService = new DiditService();