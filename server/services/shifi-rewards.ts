import { db } from '@db';
import { rewardsBalances, rewardsTransactions, rewardsRedemptions } from '@db/schema';
import { eq, and, desc, count } from 'drizzle-orm';
import { logger } from '../lib/logger';

export interface RewardTransaction {
  userId: number;
  contractId?: number;
  amount: number;
  type: string;
  description: string;
  metadata?: Record<string, any>;
}

interface RewardMultiplier {
  type: string;
  value: number;
  reason: string;
}

interface MultiplierResponse {
  multipliers: RewardMultiplier[];
  nextTierProgress: {
    current: number;
    required: number;
    percentage: number;
  };
}

export const shifiRewardsService = {
  async getBalance(userId: number): Promise<number> {
    try {
      const [balance] = await db
        .select()
        .from(rewardsBalances)
        .where(eq(rewardsBalances.userId, userId))
        .limit(1);

      return balance?.balance || 0;
    } catch (error) {
      logger.error('Error getting rewards balance:', error);
      throw error;
    }
  },

  async addTransaction(transaction: RewardTransaction): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        // Insert transaction
        await tx.insert(rewardsTransactions).values({
          userId: transaction.userId,
          contractId: transaction.contractId,
          amount: transaction.amount,
          type: transaction.type,
          description: transaction.description,
          metadata: transaction.metadata
        });

        // Update balance
        const [existingBalance] = await tx
          .select()
          .from(rewardsBalances)
          .where(eq(rewardsBalances.userId, transaction.userId))
          .limit(1);

        if (existingBalance) {
          await tx
            .update(rewardsBalances)
            .set({
              balance: existingBalance.balance + transaction.amount,
              lifetimeEarned: transaction.amount > 0 ? 
                existingBalance.lifetimeEarned + transaction.amount : 
                existingBalance.lifetimeEarned,
              lastUpdated: new Date()
            })
            .where(eq(rewardsBalances.userId, transaction.userId));
        } else {
          await tx.insert(rewardsBalances).values({
            userId: transaction.userId,
            balance: transaction.amount,
            lifetimeEarned: Math.max(0, transaction.amount),
            lastUpdated: new Date()
          });
        }
      });

      logger.info('Reward transaction processed:', transaction);
    } catch (error) {
      logger.error('Error processing reward transaction:', error);
      throw error;
    }
  },

  async createRedemption(
    userId: number,
    productName: string,
    coinsRequired: number,
    metadata?: Record<string, any>
  ): Promise<boolean> {
    try {
      const balance = await this.getBalance(userId);

      if (balance < coinsRequired) {
        return false;
      }

      await db.transaction(async (tx) => {
        // Create negative transaction for the redemption
        const [rewardTx] = await tx
          .insert(rewardsTransactions)
          .values({
            userId,
            amount: -coinsRequired,
            type: 'REDEMPTION',
            description: `Redeemed ${coinsRequired} coins for ${productName}`,
            metadata
          })
          .returning();

        // Create redemption record
        await tx.insert(rewardsRedemptions).values({
          userId,
          transactionId: rewardTx.id,
          productName,
          coinsSpent: coinsRequired,
          status: 'pending',
          metadata
        });

        // Update balance
        await tx
          .update(rewardsBalances)
          .set({
            balance: balance - coinsRequired,
            lastUpdated: new Date()
          })
          .where(eq(rewardsBalances.userId, userId));
      });

      return true;
    } catch (error) {
      logger.error('Error processing redemption:', error);
      throw error;
    }
  },

  async getTransactionHistory(userId: number, pagination?: { limit: number; offset: number }): Promise<any[]> {
    try {
      const query = db
        .select()
        .from(rewardsTransactions)
        .where(eq(rewardsTransactions.userId, userId))
        .orderBy(desc(rewardsTransactions.createdAt));

      if (pagination) {
        query.limit(pagination.limit).offset(pagination.offset);
      }

      return await query;
    } catch (error) {
      logger.error('Error getting transaction history:', error);
      throw error;
    }
  },

  async getTransactionCount(userId: number): Promise<number> {
    try {
      const [result] = await db
        .select({ count: count() })
        .from(rewardsTransactions)
        .where(eq(rewardsTransactions.userId, userId));

      return result?.count || 0;
    } catch (error) {
      logger.error('Error getting transaction count:', error);
      throw error;
    }
  },

  async getCurrentMultipliers(userId: number): Promise<MultiplierResponse> {
    try {
      const [balanceData] = await db
        .select()
        .from(rewardsBalances)
        .where(eq(rewardsBalances.userId, userId))
        .limit(1);

      const lifetimePoints = balanceData?.lifetimeEarned || 0;
      const multipliers: RewardMultiplier[] = [];

      // Base multiplier
      multipliers.push({
        type: 'base',
        value: 1,
        reason: 'Base multiplier'
      });

      // Lifetime points multiplier
      if (lifetimePoints >= 10000) {
        multipliers.push({
          type: 'lifetime',
          value: 1.5,
          reason: 'Gold tier member'
        });
      } else if (lifetimePoints >= 5000) {
        multipliers.push({
          type: 'lifetime',
          value: 1.25,
          reason: 'Silver tier member'
        });
      }

      // Calculate next tier progress
      let nextTierThreshold = lifetimePoints >= 5000 ? 10000 : 5000;
      const nextTierProgress = {
        current: lifetimePoints,
        required: nextTierThreshold,
        percentage: Math.min(100, (lifetimePoints / nextTierThreshold) * 100)
      };

      return {
        multipliers,
        nextTierProgress
      };
    } catch (error) {
      logger.error('Error getting multipliers:', error);
      throw error;
    }
  },

  async recordTransaction(
    userId: number,
    points: number,
    metadata: Record<string, any>
  ): Promise<{ newBalance: number; transaction: any }> {
    try {
      const multiplierResponse = await this.getCurrentMultipliers(userId);
      const totalMultiplier = multiplierResponse.multipliers.reduce((acc, m) => acc * m.value, 1);
      const adjustedPoints = Math.floor(points * totalMultiplier);

      const transaction = {
        userId,
        amount: adjustedPoints,
        type: metadata.type,
        description: `Earned ${adjustedPoints} points (${points} base × ${totalMultiplier} multiplier)`,
        metadata: {
          ...metadata,
          basePoints: points,
          multiplier: totalMultiplier,
          multiplierDetails: multiplierResponse.multipliers
        }
      };

      await this.addTransaction(transaction);
      const newBalance = await this.getBalance(userId);

      return {
        newBalance,
        transaction
      };
    } catch (error) {
      logger.error('Error recording transaction:', error);
      throw error;
    }
  }
};