
import axios from 'axios';
import crypto from 'crypto';
import { db } from '../../db';
import { verificationSessions } from '../../db/schema';
import { eq } from 'drizzle-orm';

class DiditService {
  private clientId: string;
  private clientSecret: string;
  private sharedSecretKey: string;

  constructor() {
    this.clientId = process.env.DIDIT_CLIENT_ID || '';
    this.clientSecret = process.env.DIDIT_CLIENT_SECRET || '';
    this.sharedSecretKey = process.env.DIDIT_SHARED_SECRET_KEY || '';
  }

  async initializeKycSession(userId: number): Promise<string> {
    try {
      const response = await axios.post('https://api.didit.me/v1/verification/initialize', {
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        userId: userId.toString()
      });

      if (response.data?.sessionUrl) {
        // Store session info
        await db.insert(verificationSessions).values({
          userId,
          sessionId: response.data.sessionId,
          status: 'initialized'
        });

        return response.data.sessionUrl;
      }
      throw new Error('Failed to get session URL');
    } catch (err) {
      console.error('Error initializing KYC session:', err);
      throw err;
    }
  }

  async getSessionStatus(sessionId: string): Promise<string> {
    try {
      const response = await axios.get(`https://api.didit.me/v1/verification/status/${sessionId}`, {
        headers: {
          'X-Client-ID': this.clientId,
          'X-Client-Secret': this.clientSecret
        }
      });
      return response.data?.status || 'unknown';
    } catch (err) {
      console.error('Error getting session status:', err);
      throw err;
    }
  }

  verifyWebhookSignature(payload: string, signature: string, timestamp: string): boolean {
    const message = timestamp + '.' + payload;
    const expectedSignature = crypto
      .createHmac('sha256', this.sharedSecretKey)
      .update(message)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  async processWebhook(payload: any): Promise<void> {
    const { session_id, status } = payload;
    
    if (!session_id) {
      throw new Error('Missing session ID in webhook payload');
    }

    await db
      .update(verificationSessions)
      .set({ 
        status: status,
        updatedAt: new Date()
      })
      .where(eq(verificationSessions.sessionId, session_id));
  }

  async retryFailedWebhooks(): Promise<void> {
    // Implementation for retrying failed webhooks
    console.log('Retrying failed webhooks...');
  }
}

export const diditService = new DiditService();
