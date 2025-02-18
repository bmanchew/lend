import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode, TransferType, TransferNetwork, ACHClass, LinkTokenCreateRequest, TransferAuthorizationCreateRequest, TransferCreateRequest } from 'plaid';
import { logger } from '../lib/logger';

const configuration = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

const plaidClient = new PlaidApi(configuration);

export class PlaidService {
  static async createLinkToken(userId: string) {
    try {
      const configs: LinkTokenCreateRequest = {
        user: { client_user_id: userId },
        client_name: 'ShiFi',
        products: ['auth', 'transfer'],
        country_codes: ['US'],
        language: 'en',
        transfer: {
          intent: 'PAYMENT',
          payment_profile: null
        }
      };

      const response = await plaidClient.linkTokenCreate(configs);
      return response.data;
    } catch (error) {
      logger.error('Error creating link token:', error);
      throw error;
    }
  }

  static async exchangePublicToken(publicToken: string) {
    try {
      const response = await plaidClient.itemPublicTokenExchange({
        public_token: publicToken,
      });
      return response.data;
    } catch (error) {
      logger.error('Error exchanging public token:', error);
      throw error;
    }
  }

  static async getAuthData(accessToken: string) {
    try {
      const response = await plaidClient.authGet({
        access_token: accessToken,
      });
      return response.data;
    } catch (error) {
      logger.error('Error getting auth data:', error);
      throw error;
    }
  }

  static async getLedgerBalance() {
    try {
      const response = await plaidClient.transferBalanceGet({});
      return {
        available: parseFloat(response.data.balance?.current || '0'),
        pending: parseFloat(response.data.balance?.pending || '0')
      };
    } catch (error) {
      logger.error('Error fetching Plaid ledger balance:', error);
      throw error;
    }
  }

  static async initiatePayment(accessToken: string, amount: number, accountId: string) {
    try {
      // Create transfer authorization first
      const authRequest: TransferAuthorizationCreateRequest = {
        access_token: accessToken,
        account_id: accountId,
        type: TransferType.Debit,
        network: TransferNetwork.Ach,
        amount: amount.toString(),
        ach_class: ACHClass.Ppd,
        user: {
          legal_name: 'John Doe' // Should come from user profile
        }
      };

      const authorizationResponse = await plaidClient.transferAuthorizationCreate(authRequest);

      if (authorizationResponse.data.authorization.decision !== 'approved') {
        const error = new Error(`Transfer authorization failed: ${authorizationResponse.data.authorization.decision_rationale?.description}`);
        logger.error('Transfer authorization failed:', {
          decision: authorizationResponse.data.authorization.decision,
          rationale: authorizationResponse.data.authorization.decision_rationale
        });
        throw error;
      }

      // Create the transfer after authorization
      const transferRequest: TransferCreateRequest = {
        access_token: accessToken,
        account_id: accountId,
        authorization_id: authorizationResponse.data.authorization.id,
        description: 'ShiFi Loan Payment',
        network: TransferNetwork.Ach,
        amount: amount.toString(),
        ach_class: ACHClass.Ppd,
        user: {
          legal_name: 'John Doe' // Should come from user profile
        }
      };

      const transferResponse = await plaidClient.transferCreate(transferRequest);

      return {
        transferId: transferResponse.data.transfer.id,
        status: transferResponse.data.transfer.status,
      };
    } catch (error: any) {
      if (error?.response?.data?.error_code) {
        const plaidError = {
          error_type: error.response.data.error_type,
          error_code: error.response.data.error_code,
          error_message: error.response.data.error_message,
          display_message: error.response.data.display_message
        };
        logger.error('Plaid error during payment initiation:', plaidError);
        throw new Error(plaidError.display_message || plaidError.error_message);
      }
      logger.error('Error initiating Plaid payment:', error);
      throw error;
    }
  }

  static async getTransferStatus(transferId: string) {
    try {
      const response = await plaidClient.transferGet({
        transfer_id: transferId
      });
      return response.data.transfer;
    } catch (error) {
      logger.error('Error getting transfer status:', error);
      throw error;
    }
  }

  // Automatic ledger balance management
  static async monitorAndAdjustLedgerBalance(minBalance: number, maxBalance: number) {
    try {
      const balance = await this.getLedgerBalance();

      if (!balance.available) {
        logger.warn('Unable to determine available balance');
        return;
      }

      if (balance.available > maxBalance) {
        // Withdraw excess funds to funding account
        const excessAmount = (balance.available - maxBalance).toFixed(2);
        await this.withdrawFromLedger(excessAmount);
        logger.info('Automated sweep completed:', { amount: excessAmount });
      }

      if ((balance.available + balance.pending) < minBalance) {
        // Deposit funds from funding account
        const depositAmount = (minBalance - (balance.available + balance.pending)).toFixed(2);
        await this.depositToLedger(depositAmount);
        logger.info('Automated deposit completed:', { amount: depositAmount });
      }
    } catch (error) {
      logger.error('Error in ledger balance management:', error);
      throw error;
    }
  }

  static async withdrawFromLedger(amount: string) {
    try {
      const transferRequest: TransferCreateRequest = {
        authorization_id: 'sweep', // Special authorization for sweep transfers
        account_id: 'sweep',
        access_token: process.env.PLAID_SWEEP_ACCESS_TOKEN as string,
        type: TransferType.Credit,
        network: TransferNetwork.Ach,
        amount,
        description: 'Automated ledger withdrawal',
        ach_class: ACHClass.Ppd,
        user: {
          legal_name: 'ShiFi Inc'
        }
      };

      const response = await plaidClient.transferCreate(transferRequest);
      return response.data;
    } catch (error) {
      logger.error('Error withdrawing from ledger:', error);
      throw error;
    }
  }

  static async depositToLedger(amount: string) {
    try {
      const transferRequest: TransferCreateRequest = {
        authorization_id: 'sweep', // Special authorization for sweep transfers
        account_id: 'sweep',
        access_token: process.env.PLAID_SWEEP_ACCESS_TOKEN as string,
        type: TransferType.Debit,
        network: TransferNetwork.Ach,
        amount,
        description: 'Automated ledger deposit',
        ach_class: ACHClass.Ppd,
        user: {
          legal_name: 'ShiFi Inc'
        }
      };

      const response = await plaidClient.transferCreate(transferRequest);
      return response.data;
    } catch (error) {
      logger.error('Error depositing to ledger:', error);
      throw error;
    }
  }

  static async syncTransferEvents(afterId?: number) {
    try {
      const response = await plaidClient.transferEventSync({
        after_id: afterId ?? 0
      });

      for (const event of response.data.transfer_events) {
        if (event.event_type.startsWith('sweep.')) {
          await this.handleSweepEvent(event);
        }
      }

      return response.data;
    } catch (error) {
      logger.error('Error syncing transfer events:', error);
      throw error;
    }
  }

  private static async handleSweepEvent(event: any) {
    const logContext = {
      eventType: event.event_type,
      eventId: event.event_id,
      accountId: event.account_id,
      timestamp: new Date().toISOString()
    };

    logger.info('Processing sweep event:', logContext);

    switch (event.event_type) {
      case 'sweep.settled':
        logger.info('Sweep completed successfully', logContext);
        break;
      case 'sweep.returned':
        logger.warn('Sweep was returned', logContext);
        break;
      case 'sweep.failed':
        logger.error('Sweep failed', logContext);
        break;
    }
  }
}