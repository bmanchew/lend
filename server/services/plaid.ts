import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode, TransferType, TransferNetwork, ACHClass } from 'plaid';

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
    const configs = {
      user: { client_user_id: userId },
      client_name: 'LoanCraft',
      products: ['auth', 'transfer'] as Products[],
      country_codes: ['US'] as CountryCode[],
      language: 'en',
    };

    const response = await plaidClient.linkTokenCreate(configs);
    return response.data;
  }

  static async exchangePublicToken(publicToken: string) {
    const response = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });
    return response.data;
  }

  static async getAuthData(accessToken: string) {
    const response = await plaidClient.authGet({
      access_token: accessToken,
    });
    return response.data;
  }

  static async getLedgerBalance() {
    const response = await plaidClient.transferBalanceGet();
    return response.data;
  }

  static async initiatePayment(accessToken: string, amount: number, accountId: string) {
    try {
      // First check Ledger balance for credit transfers
      const ledgerBalance = await this.getLedgerBalance();

      if (ledgerBalance.available && parseFloat(amount.toString()) > parseFloat(ledgerBalance.available.toString())) {
        throw new Error('Insufficient funds in Plaid Ledger');
      }

      // Create a transfer authorization
      const authorizationResponse = await plaidClient.transferAuthorizationCreate({
        access_token: accessToken,
        account_id: accountId,
        type: TransferType.Debit,
        network: TransferNetwork.Ach,
        amount: amount.toString(),
        ach_class: ACHClass.Ppd,
        user: {
          legal_name: 'John Doe', // This should come from the user's profile
        },
      });

      // Create the transfer using the authorization
      const transferResponse = await plaidClient.transferCreate({
        access_token: accessToken,
        account_id: accountId,
        authorization_id: authorizationResponse.data.authorization.id,
        description: 'Loan Down Payment',
        type: TransferType.Debit,
        network: TransferNetwork.Ach,
        amount: amount.toString(),
        ach_class: ACHClass.Ppd,
      });

      return {
        transferId: transferResponse.data.transfer.id,
        status: transferResponse.data.transfer.status,
      };
    } catch (error) {
      console.error('Error initiating Plaid payment:', error);
      throw error;
    }
  }

  static async getTransferStatus(transferId: string) {
    const response = await plaidClient.transferGet({
      transfer_id: transferId,
    });
    return response.data.transfer;
  }

  // Handle Plaid Ledger sweeps and events
  static async syncTransferEvents(afterId?: number) {
    const response = await plaidClient.transferEventSync({
      after_id: afterId ? afterId : 0,
    });

    const events = response.data.transfer_events;

    // Process new Ledger events
    for (const event of events) {
      // Handle sweep events
      if (event.event_type.startsWith('sweep.')) {
        console.log('Processing sweep event:', {
          eventType: event.event_type,
          timestamp: new Date().toISOString(),
          eventId: event.event_id,
          accountId: event.account_id,
        });

        // Update your database or trigger notifications based on sweep status
        switch (event.event_type) {
          case 'sweep.pending':
            // Sweep initiated
            break;
          case 'sweep.posted':
            // Funds have been debited/credited
            break;
          case 'sweep.settled':
            // Sweep completed successfully
            break;
          case 'sweep.returned':
            // Sweep was returned
            break;
          case 'sweep.failed':
            // Sweep failed
            break;
        }
      }
    }

    return response.data;
  }

  // New methods for Ledger management
  static async withdrawFromLedger(amount: string, idempotencyKey: string) {
    const response = await plaidClient.transferLedgerWithdraw({
      amount,
      idempotency_key: idempotencyKey,
      network: TransferNetwork.Ach,
    });
    return response.data;
  }

  static async depositToLedger(amount: string, idempotencyKey: string) {
    const response = await plaidClient.transferLedgerDeposit({
      amount,
      idempotency_key: idempotencyKey,
      network: TransferNetwork.Ach,
    });
    return response.data;
  }
}