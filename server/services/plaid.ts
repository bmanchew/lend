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

  static async initiatePayment(accessToken: string, amount: number, accountId: string) {
    try {
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
        type: TransferType.Debit,
        network: TransferNetwork.Ach,
        amount: amount.toString(),
        description: 'Loan Down Payment',
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

  // New method to handle Plaid Ledger events
  static async syncTransferEvents(afterId?: number) {
    const response = await plaidClient.transferEventSync({
      after_id: afterId,
    });

    const events = response.data.transfer_events;

    // Process new Ledger events
    for (const event of events) {
      if (event.event_type.startsWith('sweep.')) {
        // Handle new sweep events (pending, posted, settled, returned, failed)
        console.log('Processing sweep event:', event);
        // TODO: Update your database with sweep status
      }
    }

    return response.data;
  }
}