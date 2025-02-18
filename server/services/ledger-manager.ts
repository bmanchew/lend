import { PlaidService } from './plaid';
import { logger } from '../lib/logger';

interface LedgerConfig {
  minBalance: number;
  maxBalance: number;
  sweepThreshold: number;
  sweepSchedule: string; // cron expression
}

export class LedgerManager {
  private static instance: LedgerManager;
  private config: LedgerConfig;
  private sweepInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;
  private isPlaidEnabled = false;

  private constructor(config: LedgerConfig) {
    this.config = config;
    // Check if Plaid credentials are available
    this.isPlaidEnabled = !!(
      process.env.PLAID_CLIENT_ID &&
      process.env.PLAID_SECRET &&
      process.env.PLAID_ENV
    );
  }

  static getInstance(config?: LedgerConfig): LedgerManager {
    if (!LedgerManager.instance && config) {
      LedgerManager.instance = new LedgerManager(config);
    }
    return LedgerManager.instance;
  }

  async initializeSweeps() {
    try {
      if (this.isInitialized) {
        logger.warn('Ledger sweep monitoring already initialized');
        return;
      }

      if (!this.isPlaidEnabled) {
        logger.warn('Plaid integration is not configured - ledger sweeps will be disabled');
        this.isInitialized = true;
        return;
      }

      // Initial balance check - make this non-blocking
      this.checkAndAdjustBalance().catch(error => {
        logger.warn('Initial balance check failed:', error);
      });

      // Set up periodic balance checks
      this.sweepInterval = setInterval(
        () => this.checkAndAdjustBalance().catch(error => {
          logger.error('Error in periodic balance check:', error);
        }),
        1000 * 60 * 15 // Check every 15 minutes
      );

      this.isInitialized = true;

      logger.info('Ledger sweep monitoring initialized', {
        config: {
          minBalance: this.config.minBalance,
          maxBalance: this.config.maxBalance,
          sweepThreshold: this.config.sweepThreshold,
          sweepSchedule: this.config.sweepSchedule
        },
        plaidEnabled: this.isPlaidEnabled,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error('Failed to initialize ledger sweeps:', {
        error: error?.message,
        stack: error?.stack
      });
      // Don't throw error, just log it and continue
      this.isInitialized = true;
    }
  }

  async checkAndAdjustBalance() {
    if (!this.isPlaidEnabled) {
      return;
    }

    try {
      const balance = await PlaidService.getLedgerBalance();

      logger.info('Current ledger balance:', {
        available: balance.available,
        pending: balance.pending,
        timestamp: new Date().toISOString()
      });

      // Handle excess balance
      if (balance.available > this.config.maxBalance) {
        const excessAmount = (balance.available - this.config.maxBalance).toFixed(2);
        if (parseFloat(excessAmount) >= this.config.sweepThreshold) {
          await this.executeSweep('withdraw', excessAmount);
        }
      }

      // Handle low balance
      const projectedBalance = balance.available + balance.pending;
      if (projectedBalance < this.config.minBalance) {
        const requiredAmount = (this.config.minBalance - projectedBalance).toFixed(2);
        if (parseFloat(requiredAmount) >= this.config.sweepThreshold) {
          await this.executeSweep('deposit', requiredAmount);
        }
      }
    } catch (error: any) {
      logger.error('Error in ledger balance check:', {
        error: error?.message,
        stack: error?.stack
      });
      // Don't throw error, just log it
    }
  }

  private async executeSweep(type: 'withdraw' | 'deposit', amount: string) {
    if (!this.isPlaidEnabled) {
      return;
    }

    try {
      const operation = type === 'withdraw' ?
        PlaidService.withdrawFromLedger :
        PlaidService.depositToLedger;

      logger.info(`Initiating ${type} sweep`, {
        amount,
        timestamp: new Date().toISOString()
      });

      const result = await operation(amount);

      logger.info(`Successfully completed ${type} sweep`, {
        amount,
        transferId: result.transfer?.id,
        timestamp: new Date().toISOString()
      });

      return result;
    } catch (error: any) {
      logger.error(`Failed to execute ${type} sweep:`, {
        error: error?.message,
        stack: error?.stack
      });
      // Don't throw error, just log it
    }
  }

  async manualSweep(type: 'withdraw' | 'deposit', amount: string) {
    if (!this.isPlaidEnabled) {
      return {
        success: false,
        message: 'Plaid integration is not configured'
      };
    }

    try {
      if (!this.isInitialized) {
        await this.initializeSweeps();
      }

      const result = await this.executeSweep(type, amount);
      return {
        success: true,
        message: `Manual ${type} sweep completed`,
        transferId: result?.transfer?.id
      };
    } catch (error: any) {
      logger.error('Manual sweep failed:', {
        error: error?.message,
        stack: error?.stack
      });
      return {
        success: false,
        message: error?.message || 'Manual sweep failed'
      };
    }
  }

  stopSweeps() {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
      this.isInitialized = false;
      logger.info('Ledger sweep monitoring stopped');
    }
  }
}