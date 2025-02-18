import { db } from '@db';
import { rewardsBalances, rewardsTransactions, rewardsRedemptions } from '@db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '../lib/logger';

export interface RewardTransaction {
  userId: number;
  contractId?: number;
  amount: number;
  type: string;
  description: string;
  metadata?: Record<string, any>;
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

  async getTransactionHistory(userId: number): Promise<any[]> {
    try {
      return await db
        .select()
        .from(rewardsTransactions)
        .where(eq(rewardsTransactions.userId, userId))
        .orderBy(rewardsTransactions.createdAt);
    } catch (error) {
      logger.error('Error getting transaction history:', error);
      throw error;
    }
  }
};
