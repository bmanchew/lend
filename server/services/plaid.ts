import { 
  Configuration, 
  PlaidApi, 
  PlaidEnvironments,
  Products,
  CountryCode,
  TransferType,
  TransferNetwork,
  ACHClass,
  DepositoryAccountSubtype,
  SandboxItemSetVerificationStatusRequestVerificationStatusEnum,
  AssetReportCreateRequest,
  AssetReportGetRequest
} from 'plaid';
import { logger } from '../lib/logger';

interface PlaidError {
  error_type: string;
  error_code: string;
  error_message: string;
  display_message?: string;
}

interface Transaction {
  amount: number;
  date: string;
  merchant_name?: string;
  name?: string;
  category?: string[];
}

class PlaidErrorHandler extends Error {
  type: string;
  code: string;
  displayMessage?: string;

  constructor(error: PlaidError) {
    super(error.error_message);
    this.name = 'PlaidError';
    this.type = error.error_type;
    this.code = error.error_code;
    this.displayMessage = error.display_message;
  }
}

export class PlaidService {
  private static isSandbox = process.env.PLAID_ENV?.toLowerCase() === 'sandbox';
  private static plaidClient = new PlaidApi(new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
      },
    },
  }));

  private static validateAccessToken(accessToken: string) {
    logger.info('Validating access token:', { 
      tokenType: accessToken.trim().toLowerCase() === 'test_token' ? 'test_token' : 'plaid_token',
      environment: this.isSandbox ? 'sandbox' : 'development',
      envVar: process.env.PLAID_ENV,
      isSandbox: this.isSandbox,
      tokenPattern: accessToken.startsWith('access-') ? 'valid' : 'invalid'
    });

    // Allow any token format in sandbox mode
    if (this.isSandbox || accessToken.trim().toLowerCase() === 'test_token') {
      logger.info('Sandbox mode or test token detected, bypassing validation');
      return true;
    }

    // Only validate token format in non-sandbox environments
    if (!accessToken.startsWith('access-')) {
      logger.warn('Invalid token format detected:', {
        tokenStart: accessToken.substring(0, 7),
        environment: process.env.PLAID_ENV
      });

      throw new PlaidErrorHandler({
        error_type: 'INVALID_ACCESS_TOKEN',
        error_code: 'INVALID_FORMAT',
        error_message: 'Invalid access token format',
        display_message: 'Please provide a valid access token'
      });
    }

    return true;
  }

  static async getTransactions(accessToken: string): Promise<Transaction[]> {
    try {
      logger.info('Processing transaction request:', { 
        tokenType: accessToken.trim().toLowerCase() === 'test_token' ? 'test_token' : 'plaid_token',
        environment: this.isSandbox ? 'sandbox' : 'development'
      });

      this.validateAccessToken(accessToken);

      if (accessToken.trim().toLowerCase() === 'test_token') {
        return this.getMockTransactions();
      }

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 60); // Get 60 days of transactions

      const request = {
        access_token: accessToken,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        options: {
          include_personal_finance_category: true
        }
      };

      const response = await this.plaidClient.transactionsGet(request);
      return response.data.transactions;
    } catch (error: any) {
      if (error instanceof PlaidErrorHandler) {
        throw error;
      }

      const plaidError = error?.response?.data;
      if (plaidError?.error_type) {
        logger.error('Plaid error:', plaidError);
        throw new PlaidErrorHandler(plaidError);
      }

      logger.error('Error in Plaid request:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  static async createAssetReport(accessToken: string) {
    try {
      logger.info('Creating asset report:', {
        tokenType: accessToken.trim().toLowerCase() === 'test_token' ? 'test_token' : 'plaid_token',
        environment: this.isSandbox ? 'sandbox' : 'development'
      });

      this.validateAccessToken(accessToken);

      if (accessToken.trim().toLowerCase() === 'test_token') {
        return this.getMockAssetReport();
      }

      const request: AssetReportCreateRequest = {
        access_tokens: [accessToken],
        days_requested: 90,
        options: {
          client_report_id: `report-${Date.now()}`,
          webhook: process.env.PLAID_WEBHOOK_URL,
          include_insights: true
        }
      };

      const response = await this.plaidClient.assetReportCreate(request);

      logger.info('Asset report created:', {
        reportToken: response.data.asset_report_token,
        requestId: response.data.request_id
      });

      return response.data;
    } catch (error: any) {
      if (error instanceof PlaidErrorHandler) {
        throw error;
      }

      const plaidError = error?.response?.data;
      if (plaidError?.error_type) {
        logger.error('Plaid error:', plaidError);
        throw new PlaidErrorHandler(plaidError);
      }

      logger.error('Error in Plaid request:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  static async getAssetReport(reportToken: string) {
    try {
      logger.info('Retrieving asset report:', { reportToken });

      if (reportToken === 'mock_report_token') {
        return this.getMockAssetReport().report;
      }

      const request: AssetReportGetRequest = {
        asset_report_token: reportToken,
        include_insights: true
      };

      const response = await this.plaidClient.assetReportGet(request);

      logger.info('Retrieved asset report:', {
        accounts: response.data.report.items.map(item => ({
          institution: item.institution_name,
          accounts: item.accounts.length
        }))
      });

      return response.data.report;
    } catch (error: any) {
      if (error instanceof PlaidErrorHandler) {
        throw error;
      }

      const plaidError = error?.response?.data;
      if (plaidError?.error_type) {
        logger.error('Plaid error:', plaidError);
        throw new PlaidErrorHandler(plaidError);
      }

      logger.error('Error in Plaid request:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  private static getMockAssetReport() {
    const currentDate = new Date().toISOString().split('T')[0];

    return {
      asset_report_token: 'mock_report_token',
      request_id: 'mock_request_id',
      report: {
        items: [{
          institution_name: 'Mock Bank',
          accounts: [{
            balances: {
              available: 25000,
              current: 25000,
              limit: null
            },
            days_available: 90,
            name: 'Checking Account',
            type: 'depository',
            subtype: 'checking',
            historical_balances: Array.from({ length: 90 }, (_, i) => ({
              date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              current: 25000 + (Math.random() * 2000 - 1000)
            }))
          }]
        }]
      }
    };
  }

  private static getMockTransactions(): Transaction[] {
    const today = new Date();
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(today.getMonth() - 2);

    // Generate dates between two months ago and today
    const getDaysBetween = (start: Date, end: Date): string[] => {
      const dates: string[] = [];
      const current = new Date(start);
      while (current <= end) {
        dates.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
      }
      return dates;
    };

    const dates = getDaysBetween(twoMonthsAgo, today);

    // Mock income transactions (bi-weekly payroll deposits)
    const incomeTransactions: Transaction[] = [];
    let currentDate = new Date(twoMonthsAgo);
    while (currentDate <= today) {
      incomeTransactions.push({
        amount: 5000, // Bi-weekly salary ($10,000/month)
        date: currentDate.toISOString().split('T')[0],
        merchant_name: 'COMPANY PAYROLL',
        category: ['INCOME', 'PAYROLL']
      });
      currentDate.setDate(currentDate.getDate() + 14); // Bi-weekly
    }

    // Mock expense transactions
    const expenseTransactions: Transaction[] = [
      // Monthly mortgage/rent
      ...dates.filter(d => d.endsWith('01')).map(date => ({
        amount: -2500,
        date,
        merchant_name: 'MORTGAGE CO',
        category: ['MORTGAGE', 'RENT']
      })),
      // Car loan
      ...dates.filter(d => d.endsWith('15')).map(date => ({
        amount: -450,
        date,
        merchant_name: 'AUTO LOAN',
        category: ['LOAN_PAYMENTS', 'AUTO']
      })),
      // Credit card payments
      ...dates.filter(d => d.endsWith('20')).map(date => ({
        amount: -1000,
        date,
        merchant_name: 'CREDIT CARD PAYMENT',
        category: ['CREDIT_CARD', 'PAYMENT']
      })),
      // Student loan
      ...dates.filter(d => d.endsWith('10')).map(date => ({
        amount: -350,
        date,
        merchant_name: 'STUDENT LOAN',
        category: ['LOAN_PAYMENTS', 'STUDENT']
      })),
      // Utilities
      ...dates.filter(d => d.endsWith('05')).map(date => ({
        amount: -200,
        date,
        merchant_name: 'UTILITY CO',
        category: ['UTILITIES']
      })),
      // Groceries (weekly)
      ...dates.filter(d => new Date(d).getDay() === 0).map(date => ({
        amount: -250,
        date,
        merchant_name: 'GROCERY STORE',
        category: ['FOOD_AND_DRINK', 'GROCERIES']
      })),
      // Entertainment (weekly)
      ...dates.filter(d => new Date(d).getDay() === 6).map(date => ({
        amount: -100,
        date,
        merchant_name: 'ENTERTAINMENT',
        category: ['ENTERTAINMENT']
      }))
    ];

    const transactions = [...incomeTransactions, ...expenseTransactions].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    logger.info('Generated mock transactions:', {
      count: transactions.length,
      totalIncome: incomeTransactions.reduce((sum, t) => sum + t.amount, 0),
      totalExpenses: expenseTransactions.reduce((sum, t) => sum + t.amount, 0),
      dateRange: {
        start: transactions[transactions.length - 1].date,
        end: transactions[0].date
      }
    });

    return transactions;
  }
  private static sweepAccountId: string | null = null;

  private static async validateSandboxSetup() {
    if (!process.env.PLAID_SWEEP_ACCESS_TOKEN) {
      throw new Error('PLAID_SWEEP_ACCESS_TOKEN not configured');
    }

    if (this.isSandbox && !this.sweepAccountId) {
      logger.info('Initializing sandbox sweep account');

      try {
        const authData = await this.getAuthData(process.env.PLAID_SWEEP_ACCESS_TOKEN);
        if (!authData?.accounts?.length) {
          throw new Error('No accounts found in auth data');
        }

        logger.info('Available sandbox accounts:', {
          accounts: authData.accounts.map(acc => ({
            id: acc.account_id,
            type: acc.type,
            subtype: acc.subtype,
            balances: acc.balances
          }))
        });

        const fundingAccount = authData.accounts.find(acc =>
          acc.type === 'depository' && acc.subtype === 'checking'
        );

        if (!fundingAccount) {
          throw new Error('No eligible funding account found in sandbox');
        }

        this.sweepAccountId = fundingAccount.account_id;
        logger.info('Selected sandbox sweep account:', {
          accountId: this.sweepAccountId,
          type: fundingAccount.type,
          subtype: fundingAccount.subtype,
          balances: fundingAccount.balances
        });
      } catch (error: any) {
        logger.error('Failed to initialize sandbox account:', {
          error: error?.message,
          stack: error?.stack
        });
        throw error;
      }
    }
  }

  static async createLinkToken(userId: string) {
    try {
      const configs: LinkTokenCreateRequest = {
        user: { client_user_id: userId },
        client_name: 'ShiFi',
        products: [Products.Auth, Products.Transfer],
        country_codes: [CountryCode.Us],
        language: 'en',
        account_filters: {
          depository: {
            account_subtypes: [DepositoryAccountSubtype.Checking]
          }
        }
      };

      logger.info('Creating link token with config:', {
        userId,
        products: configs.products,
        filters: configs.account_filters
      });

      const response = await this.plaidClient.linkTokenCreate(configs);
      logger.info('Created Plaid link token successfully');
      return response.data;
    } catch (error: any) {
      logger.error('Error creating link token:', {
        error: error?.response?.data || error.message,
        plaidError: error?.response?.data?.error_code,
        stack: error.stack
      });
      throw error;
    }
  }

  static async exchangePublicToken(publicToken: string) {
    if (!publicToken) {
      throw new Error('Public token is required');
    }

    try {
      const response = await this.plaidClient.itemPublicTokenExchange({
        public_token: publicToken,
      });

      if (!response?.data?.access_token) {
        throw new Error('Invalid response from Plaid token exchange');
      }

      return response.data;
    } catch (error: any) {
      logger.error('Error exchanging public token:', {
        error: error?.response?.data || error.message,
        plaidError: error?.response?.data?.error_code,
        stack: error.stack
      });
      throw error;
    }
  }

  static async getAuthData(accessToken: string) {
    try {
      const response = await this.plaidClient.authGet({
        access_token: accessToken,
      });

      // Log account information for debugging
      logger.info('Retrieved auth data:', {
        numAccounts: response.data.accounts.length,
        accountTypes: response.data.accounts.map(a => ({
          id: a.account_id,
          type: a.type,
          subtype: a.subtype
        }))
      });

      return response.data;
    } catch (error: any) {
      logger.error('Error getting auth data:', {
        error: error?.response?.data || error.message,
        plaidError: error?.response?.data?.error_code,
        stack: error.stack
      });
      throw error;
    }
  }

  static async getLedgerBalance(): Promise<LedgerBalance> {
    try {
      logger.info('Getting Plaid ledger balance');
      await this.validateSandboxSetup();

      const response = await this.plaidClient.transferBalanceGet({});
      logger.info('Plaid balance response:', {
        raw: JSON.stringify(response.data),
        balance: response.data.balance,
        environment: this.isSandbox ? 'sandbox' : 'production'
      });

      return {
        available: parseFloat(response.data.balance.current || '0'),
        pending: 0 // Balance API doesn't return pending amount
      };
    } catch (error: any) {
      const plaidError = error?.response?.data;
      logger.error('Error fetching Plaid ledger balance:', {
        error: plaidError || error.message,
        plaidErrorCode: plaidError?.error_code,
        plaidErrorType: plaidError?.error_type,
        plaidErrorMessage: plaidError?.error_message,
        raw: JSON.stringify(error?.response?.data),
        stack: error.stack
      });
      throw error;
    }
  }

  static async createTransferAuthorization(
    type: TransferType,
    amount: string,
    description: string
  ) {
    try {
      if (!process.env.PLAID_SWEEP_ACCESS_TOKEN) {
        throw new Error('PLAID_SWEEP_ACCESS_TOKEN not configured');
      }

      await this.validateSandboxSetup();

      const authRequest: TransferAuthorizationCreateRequest = {
        access_token: process.env.PLAID_SWEEP_ACCESS_TOKEN,
        account_id: this.sweepAccountId!,
        type,
        network: TransferNetwork.Ach,
        amount,
        ach_class: ACHClass.Ppd,
        user: {
          legal_name: 'ShiFi Inc'
        }
      };

      logger.info('Creating transfer authorization:', {
        type,
        amount,
        accountId: this.sweepAccountId,
        environment: this.isSandbox ? 'sandbox' : 'production',
        requestBody: JSON.stringify(authRequest)
      });

      const authResponse = await this.plaidClient.transferAuthorizationCreate(authRequest);

      logger.info('Transfer authorization response:', {
        id: authResponse.data.authorization.id,
        decision: authResponse.data.authorization.decision,
        code: authResponse.data.authorization.decision_rationale?.code,
        description: authResponse.data.authorization.decision_rationale?.description,
        raw: JSON.stringify(authResponse.data)
      });

      if (authResponse.data.authorization.decision !== 'approved') {
        throw new Error(`Transfer authorization failed: ${authResponse.data.authorization.decision_rationale?.description}`);
      }

      return authResponse.data.authorization;
    } catch (error: any) {
      const plaidError = error?.response?.data;
      logger.error('Error creating transfer authorization:', {
        error: plaidError || error.message,
        plaidErrorCode: plaidError?.error_code,
        plaidErrorType: plaidError?.error_type,
        plaidErrorMessage: plaidError?.error_message,
        raw: JSON.stringify(error?.response?.data),
        stack: error.stack
      });
      throw error;
    }
  }

  static async initiatePayment(accessToken: string, amount: number, accountId: string) {
    if (!accessToken || !accountId || amount <= 0) {
      throw new Error('Invalid payment parameters');
    }

    try {
      await this.validateSandboxSetup();

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

      const authorizationResponse = await this.plaidClient.transferAuthorizationCreate(authRequest);

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

      const transferResponse = await this.plaidClient.transferCreate(transferRequest);

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

  static async withdrawFromLedger(amount: string) {
    try {
      logger.info('Initiating ledger withdrawal:', { amount });

      // First create authorization
      const authorization = await this.createTransferAuthorization(
        TransferType.Credit,
        amount,
        'Automated ledger withdrawal'
      );

      const transferRequest: TransferCreateRequest = {
        authorization_id: authorization.id,
        description: 'Automated ledger withdrawal',
        access_token: process.env.PLAID_SWEEP_ACCESS_TOKEN!,
        account_id: this.sweepAccountId!,
        type: TransferType.Credit,
        network: TransferNetwork.Ach,
        amount,
        ach_class: ACHClass.Ppd,
        user: {
          legal_name: 'ShiFi Inc'
        }
      };

      logger.info('Creating withdrawal transfer:', {
        requestBody: JSON.stringify(transferRequest),
        environment: this.isSandbox ? 'sandbox' : 'production'
      });

      const response = await this.plaidClient.transferCreate(transferRequest);

      logger.info('Successfully created withdrawal transfer:', {
        id: response.data.transfer.id,
        status: response.data.transfer.status,
        raw: JSON.stringify(response.data)
      });

      return response.data;
    } catch (error: any) {
      const plaidError = error?.response?.data;
      logger.error('Error withdrawing from ledger:', {
        error: plaidError || error.message,
        plaidErrorCode: plaidError?.error_code,
        plaidErrorType: plaidError?.error_type,
        plaidErrorMessage: plaidError?.error_message,
        raw: JSON.stringify(error?.response?.data),
        stack: error.stack
      });
      throw error;
    }
  }

  static async depositToLedger(amount: string) {
    try {
      logger.info('Initiating ledger deposit:', { amount });

      // First create authorization
      const authorization = await this.createTransferAuthorization(
        TransferType.Debit,
        amount,
        'Automated ledger deposit'
      );

      const transferRequest: TransferCreateRequest = {
        authorization_id: authorization.id,
        description: 'Automated ledger deposit',
        access_token: process.env.PLAID_SWEEP_ACCESS_TOKEN!,
        account_id: this.sweepAccountId!,
        type: TransferType.Debit,
        network: TransferNetwork.Ach,
        amount,
        ach_class: ACHClass.Ppd,
        user: {
          legal_name: 'ShiFi Inc'
        }
      };

      logger.info('Creating deposit transfer:', {
        requestBody: JSON.stringify(transferRequest),
        environment: this.isSandbox ? 'sandbox' : 'production'
      });

      const response = await this.plaidClient.transferCreate(transferRequest);

      logger.info('Successfully created deposit transfer:', {
        id: response.data.transfer.id,
        status: response.data.transfer.status,
        raw: JSON.stringify(response.data)
      });

      return response.data;
    } catch (error: any) {
      const plaidError = error?.response?.data;
      logger.error('Error depositing to ledger:', {
        error: plaidError || error.message,
        plaidErrorCode: plaidError?.error_code,
        plaidErrorType: plaidError?.error_type,
        plaidErrorMessage: plaidError?.error_message,
        raw: JSON.stringify(error?.response?.data),
        stack: error.stack
      });
      throw error;
    }
  }

  static async getTransferStatus(transferId: string) {
    try {
      const response = await this.plaidClient.transferGet({
        transfer_id: transferId
      });
      return response.data.transfer;
    } catch (error: any) {
      const plaidError = error?.response?.data;
      logger.error('Error getting transfer status:', {
        error: plaidError || error.message,
        plaidErrorCode: plaidError?.error_code,
        plaidErrorType: plaidError?.error_type,
        plaidErrorMessage: plaidError?.error_message,
        raw: JSON.stringify(error?.response?.data),
        stack: error.stack
      });
      throw error;
    }
  }

  static async syncTransferEvents(afterId?: number) {
    try {
      const response = await this.plaidClient.transferEventSync({
        after_id: afterId ?? 0
      });

      logger.info('Transfer events sync response:', {
        eventCount: response.data.transfer_events.length,
        hasMore: response.data.has_more,
        environment: this.isSandbox ? 'sandbox' : 'production'
      });

      return response.data;
    } catch (error: any) {
      const plaidError = error?.response?.data;
      logger.error('Error syncing transfer events:', {
        error: plaidError || error.message,
        plaidErrorCode: plaidError?.error_code,
        plaidErrorType: plaidError?.error_type,
        plaidErrorMessage: plaidError?.error_message,
        raw: JSON.stringify(error?.response?.data),
        stack: error.stack
      });
      throw error;
    }
  }
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
    } catch (error: any) {
      logger.error('Error in ledger balance management:', {
        error: error?.response?.data || error.message,
        plaidError: error?.response?.data?.error_code,
        stack: error.stack
      });
      throw error;
    }
  }

  static async initiateAchVerification(accessToken: string, accountId: string) {
    try {
      logger.info('Initiating ACH verification:', {
        accountId,
        environment: this.isSandbox ? 'sandbox' : 'production'
      });

      const request: SandboxItemSetVerificationStatusRequest = {
        access_token: accessToken,
        account_id: accountId,
        verification_status: SandboxItemSetVerificationStatusRequestVerificationStatusEnum.VerificationExpired
      };

      const response = await this.plaidClient.sandboxItemSetVerificationStatus(request);

      logger.info('ACH verification initiated:', {
        accountId,
        response: response.data
      });

      return response.data;
    } catch (error: any) {
      logger.error('Error initiating ACH verification:', {
        error: error?.response?.data || error.message,
        plaidError: error?.response?.data?.error_code,
        stack: error.stack
      });
      throw error;
    }
  }

  static async verifyMicroDeposits(accessToken: string, accountId: string, amounts: number[]) {
    try {
      logger.info('Verifying micro-deposits:', {
        accountId,
        environment: this.isSandbox ? 'sandbox' : 'production'
      });

      if (this.isSandbox) {
        const request: SandboxItemSetVerificationStatusRequest = {
          access_token: accessToken,
          account_id: accountId,
          verification_status: SandboxItemSetVerificationStatusRequestVerificationStatusEnum.AutomaticallyVerified
        };
        await this.plaidClient.sandboxItemSetVerificationStatus(request);
        return { verified: true };
      }

      // For production, use verify endpoint
      const response = await this.plaidClient.itemVerify({
        access_token: accessToken,
        account_id: accountId,
        amounts: amounts.map(amount => amount.toFixed(2))
      });

      logger.info('Micro-deposits verified:', {
        accountId,
        response: response.data
      });

      return response.data;
    } catch (error: any) {
      logger.error('Error verifying micro-deposits:', {
        error: error?.response?.data || error.message,
        plaidError: error?.response?.data?.error_code,
        stack: error.stack
      });
      throw error;
    }
  }

  static async createTransfer(params: {
    accessToken: string;
    accountId: string;
    amount: string;
    description: string;
    achClass: string;
  }) {
    try {
      logger.info('Creating transfer:', {
        accountId: params.accountId,
        amount: params.amount,
        description: params.description,
        environment: this.isSandbox ? 'sandbox' : 'production'
      });

      // First create authorization
      const authorization = await this.createTransferAuthorization(
        TransferType.Debit,
        params.amount,
        params.description
      );

      const transferRequest: TransferCreateRequest = {
        authorization_id: authorization.id,
        access_token: params.accessToken,
        account_id: params.accountId,
        description: params.description,
        network: TransferNetwork.Ach,
        amount: params.amount,
        ach_class: params.achClass as ACHClass,
        user: {
          legal_name: 'John Doe' // Should come from user profile
        }
      };

      const response = await this.plaidClient.transferCreate(transferRequest);

      logger.info('Transfer created:', {
        transferId: response.data.transfer.id,
        status: response.data.transfer.status
      });

      return response.data.transfer;
    } catch (error: any) {
      logger.error('Error creating transfer:', {
        error: error?.response?.data || error.message,
        plaidError: error?.response?.data?.error_code,
        stack: error.stack
      });
      throw error;
    }
  }

  static async getTransfer(transferId: string) {
    try {
      logger.info('Getting transfer status:', { transferId });

      const response = await this.plaidClient.transferGet({
        transfer_id: transferId
      });

      logger.info('Retrieved transfer status:', {
        transferId,
        status: response.data.transfer.status
      });

      return response.data.transfer;
    } catch (error: any) {
      logger.error('Error getting transfer:', {
        error: error?.response?.data || error.message,
        plaidError: error?.response?.data?.error_code,
        stack: error.stack
      });
      throw error;
    }
  }
}

interface LedgerBalance {
  available: number;
  pending: number;
}

interface LinkTokenCreateRequest {
  user: { client_user_id: string; };
  client_name: string;
  products: Products[];
  country_codes: CountryCode[];
  language: string;
  account_filters?: { depository?: { account_subtypes?: DepositoryAccountSubtype[]; }; };
}
interface TransferAuthorizationCreateRequest {
  access_token: string;
  account_id: string;
  type: TransferType;
  network: TransferNetwork;
  amount: string;
  ach_class: ACHClass;
  user: { legal_name: string; };
}
interface TransferCreateRequest {
  authorization_id: string;
  access_token: string;
  account_id: string;
  description: string;
  network: TransferNetwork;
  amount: string;
  ach_class: ACHClass;
  user: { legal_name: string; };
}
interface SandboxItemSetVerificationStatusRequest {
  access_token: string;account_id: string;
  verification_status: SandboxItemSetVerificationStatusRequestVerificationStatusEnum;
}
enum SandboxItemSetVerificationStatusRequestVerificationStatusEnum {
  VerificationExpired,
  AutomaticallyVerified
}