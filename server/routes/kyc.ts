import express from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '@db';
import { kycSessions } from '@db/schema';
import { eq } from 'drizzle-orm';

const router = express.Router();

// Validate session creation request
const createSessionSchema = z.object({
  userId: z.number(),
  platform: z.string(),
  userAgent: z.string()
});

// Create a new KYC verification session
router.post('/start', async (req, res) => {
  try {
    const { userId, platform, userAgent } = createSessionSchema.parse(req.body);
    
    if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET) {
      console.error('[KYC] Missing Didit API credentials');
      return res.status(500).json({ error: 'Service configuration error' });
    }

    // Create session with Didit API
    const response = await fetch('https://api.didit.me/api/verification/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`).toString('base64')}`
      },
      body: JSON.stringify({
        reference_id: `user_${userId}_${Date.now()}`,
        callback_url: `${req.protocol}://${req.get('host')}/api/kyc/webhook`,
        platform,
        redirect_url: platform === 'mobile' ? 'didit://verify' : undefined,
        metadata: {
          userId,
          platform,
          userAgent
        }
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('[KYC] Failed to create Didit session:', error);
      return res.status(response.status).json(error);
    }

    const session = await response.json();

    // Store session in database
    await db.insert(kycSessions).values({
      userId,
      sessionId: session.id,
      status: 'CREATED',
      platform,
      userAgent,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Return mobile-specific or web response
    res.json({
      sessionId: session.id,
      redirectUrl: platform === 'mobile' ? 
        `didit://verify?session=${session.id}` : 
        session.verification_url
    });

  } catch (error) {
    console.error('[KYC] Session creation error:', error);
    res.status(500).json({ error: 'Failed to create verification session' });
  }
});

// Get current KYC status
router.get('/status', async (req, res) => {
  try {
    const userId = parseInt(req.query.userId as string);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    // Get latest session
    const session = await db.query.kycSessions.findFirst({
      where: eq(kycSessions.userId, userId),
      orderBy: (sessions, { desc }) => [desc(sessions.createdAt)]
    });

    if (!session) {
      return res.json({ status: 'not_started' });
    }

    // If session exists but is old, check status with Didit API
    if (session.status !== 'COMPLETED' && session.sessionId) {
      const response = await fetch(`https://api.didit.me/api/verification/sessions/${session.sessionId}`, {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`).toString('base64')}`
        }
      });

      if (response.ok) {
        const diditSession = await response.json();
        if (diditSession.status !== session.status) {
          await db.update(kycSessions)
            .set({ 
              status: diditSession.status,
              updatedAt: new Date()
            })
            .where(eq(kycSessions.sessionId, session.sessionId));
          
          return res.json({ status: diditSession.status });
        }
      }
    }

    res.json({ status: session.status });

  } catch (error) {
    console.error('[KYC] Status check error:', error);
    res.status(500).json({ error: 'Failed to check verification status' });
  }
});

// Webhook handler for session updates
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-didit-signature'];
    if (!signature || !process.env.SHARED_SECRET_KEY) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Verify webhook signature
    const hmac = crypto.createHmac('sha256', process.env.SHARED_SECRET_KEY);
    hmac.update(JSON.stringify(req.body));
    const calculatedSignature = hmac.digest('hex');

    if (calculatedSignature !== signature) {
      console.error('[KYC] Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { session_id, status, reference_id } = req.body;
    
    // Update session status
    await db.update(kycSessions)
      .set({ 
        status,
        updatedAt: new Date()
      })
      .where(eq(kycSessions.sessionId, session_id));

    res.json({ success: true });

  } catch (error) {
    console.error('[KYC] Webhook processing error:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

export default router;
