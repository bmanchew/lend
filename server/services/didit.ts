import { users } from "@db/schema";
import { db } from "@db";
import { eq } from "drizzle-orm";

interface DiditConfig {
  apiKey: string;
  clientId: string;
  clientSecret: string;
}

class DiditService {
  private config: DiditConfig;

  constructor() {
    const { DIDIT_API_KEY, DIDIT_CLIENT_ID, DIDIT_CLIENT_SECRET } = process.env;
    
    if (!DIDIT_API_KEY || !DIDIT_CLIENT_ID || !DIDIT_CLIENT_SECRET) {
      throw new Error("Missing required Didit API credentials");
    }

    this.config = {
      apiKey: DIDIT_API_KEY,
      clientId: DIDIT_CLIENT_ID,
      clientSecret: DIDIT_CLIENT_SECRET,
    };
  }

  // Initialize KYC verification session
  async initializeKycSession(userId: number): Promise<string> {
    try {
      // TODO: Implement actual Didit API call when credentials are available
      console.log("Initializing KYC session for user:", userId);
      return "mock-session-id";
    } catch (error) {
      console.error("Error initializing KYC session:", error);
      throw error;
    }
  }

  // Check KYC verification status
  async checkVerificationStatus(userId: number): Promise<string> {
    try {
      // TODO: Implement actual Didit API call when credentials are available
      console.log("Checking verification status for user:", userId);
      return "pending";
    } catch (error) {
      console.error("Error checking verification status:", error);
      throw error;
    }
  }

  // Update user's KYC status in our database
  async updateUserKycStatus(userId: number, status: string): Promise<void> {
    try {
      await db
        .update(users)
        .set({ kycStatus: status as any })
        .where(eq(users.id, userId));
    } catch (error) {
      console.error("Error updating user KYC status:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const diditService = new DiditService();
