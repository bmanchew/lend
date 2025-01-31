import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { diditService } from '../didit';
import { db } from '@db';
import { users } from '@db/schema';
import crypto from 'crypto';
import type { PgSelect, PgUpdate } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';

// Mock environment variables
process.env.DIDIT_CLIENT_ID = 'test-client-id';
process.env.DIDIT_CLIENT_SECRET = 'test-client-secret';
process.env.DIDIT_WEBHOOK_URL = 'http://test.com/webhook';
process.env.DIDIT_WEBHOOK_SECRET = 'test-webhook-secret';

// Mock axios
jest.mock('axios');
const mockAxios = {
  post: jest.fn(),
  get: jest.fn()
};
jest.mock('axios', () => mockAxios);

// Create a properly typed mock database
type MockDb = {
  select: jest.MockedFunction<() => { from: jest.MockedFunction<() => { where: jest.MockedFunction<() => { limit: jest.MockedFunction<() => Promise<any[]>> }> }> }>;
  update: jest.MockedFunction<() => { set: jest.MockedFunction<() => { where: jest.MockedFunction<() => Promise<any>> }> }>;
};

const mockDb: MockDb = {
  select: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
} as any;

mockDb.select.mockReturnValue({
  from: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnValue({
      limit: jest.fn()
    })
  })
});

mockDb.update.mockReturnValue({
  set: jest.fn().mockReturnValue({
    where: jest.fn()
  })
});

jest.mock('@db', () => ({
  db: mockDb
}));

describe('DiditService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initializeKycSession', () => {
    it('should create a KYC session successfully', async () => {
      // Mock user query response
      const mockUser = { id: 1, name: 'Test User', kycStatus: 'pending' as const };
      const limit = mockDb.select().from().where().limit;
      limit.mockResolvedValueOnce([mockUser]);

      // Mock Didit API responses
      const mockAuthResponse = {
        data: { access_token: 'test-token', expires_in: 3600 }
      };
      const mockSessionResponse = {
        data: {
          session_id: 'test-session',
          session_token: 'test-session-token',
          url: 'https://verify.didit.me/session/test'
        }
      };

      mockAxios.post
        .mockResolvedValueOnce(mockAuthResponse)
        .mockResolvedValueOnce(mockSessionResponse);

      const result = await diditService.initializeKycSession(1);

      expect(result).toBe(mockSessionResponse.data.url);
      expect(mockAxios.post).toHaveBeenCalledTimes(2);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should throw error when user not found', async () => {
      const limit = mockDb.select().from().where().limit;
      limit.mockResolvedValueOnce([]);

      await expect(diditService.initializeKycSession(1))
        .rejects
        .toThrow('User not found');
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should verify valid webhook signature', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = JSON.stringify({ test: 'data' });

      const hmac = crypto
        .createHmac('sha256', process.env.DIDIT_WEBHOOK_SECRET!)
        .update(body)
        .digest('hex');

      const result = diditService.verifyWebhookSignature(
        body,
        hmac,
        timestamp
      );

      expect(result).toBe(true);
    });

    it('should reject invalid signature', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = JSON.stringify({ test: 'data' });
      const invalidSignature = 'invalid-signature';

      const result = diditService.verifyWebhookSignature(
        body,
        invalidSignature,
        timestamp
      );

      expect(result).toBe(false);
    });

    it('should reject stale timestamp', () => {
      const staleTimestamp = (Math.floor(Date.now() / 1000) - 301).toString();
      const body = JSON.stringify({ test: 'data' });
      const hmac = crypto
        .createHmac('sha256', process.env.DIDIT_WEBHOOK_SECRET!)
        .update(body)
        .digest('hex');

      const result = diditService.verifyWebhookSignature(
        body,
        hmac,
        staleTimestamp
      );

      expect(result).toBe(false);
    });
  });

  describe('updateUserKycStatus', () => {
    it('should update user KYC status successfully', async () => {
      const userId = 1;
      const status = 'verified' as const;

      const where = mockDb.update().set().where;
      where.mockResolvedValueOnce({ affected: 1 });

      await diditService.updateUserKycStatus(userId, status);

      expect(mockDb.update).toHaveBeenCalled();
    });
  });
});