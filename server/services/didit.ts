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

    this.config = {
      apiKey: DIDIT_API_KEY,
      clientId: DIDIT_CLIENT_ID,
      clientSecret: DIDIT_CLIENT_SECRET,
      baseUrl: NODE_ENV === 'production' 
        ? 'https://api.didit.com/v1'
        : 'http://localhost:5000/mock-didit',
    };

    this.axios = axios.create({
      baseURL: this.config.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'X-Client-ID': this.config.clientId,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
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

      console.log('Initializing KYC session for user:', {
        userId: user.id,
        email: user.email,
        name: user.name,
        environment: process.env.NODE_ENV || 'development'
      });

      // For development, simulate a successful response
      if (process.env.NODE_ENV !== 'production') {
        await this.updateUserKycStatus(userId, 'pending');
        const mockSessionId = `mock-session-${Date.now()}-${userId}`;
        return mockSessionId;
      }

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

      if (!response.data?.sessionId) {
        throw new Error("Failed to create KYC session - No session ID returned");
      }

      await this.updateUserKycStatus(userId, 'pending');
      return response.data.sessionId;
    } catch (error: any) {
      console.error("Error initializing KYC session:", {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      throw error;
    }
  }

  async checkVerificationStatus(userId: number): Promise<KycStatus> {
    try {
      if (!userId || isNaN(userId)) {
        console.error('Invalid user ID provided:', userId);
        return 'pending';
      }

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

      // For development, return current status from database
      if (process.env.NODE_ENV !== 'production') {
        return user.kycStatus as KycStatus || 'pending';
      }

      const response = await this.axios.get(`/kyc/status/${user.id}`);

      if (response.data?.status) {
        const status = response.data.status as KycStatus;
        if (status !== user.kycStatus) {
          await this.updateUserKycStatus(userId, status);
        }
        return status;
      }

      return user.kycStatus as KycStatus || 'pending';
    } catch (error: any) {
      console.error("Error checking verification status:", {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      return user?.kycStatus as KycStatus || 'pending';
    }
  }

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

export const diditService = new DiditService();