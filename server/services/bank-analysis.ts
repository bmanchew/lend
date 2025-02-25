import { PlaidService } from "./plaid";
import { logger } from "../lib/logger";

interface Transaction {
  amount: number;
  date: string;
  merchant_name?: string;
  name?: string;
  category?: string[];
}

interface IncomeAnalysis {
  averageMonthlyIncome: number;
  incomeStability: number;
  lastPaymentDate: Date;
  incomeSources: string[];
}

interface ExpenseAnalysis {
  averageMonthlyExpenses: number;
  largestExpenseCategory: string;
  recurringExpenses: number;
  debtObligations: number;
}

interface AssetMetrics {
  totalAssets: number;
  averageBalance: number;
  lowestBalance: number;
  balanceStability: number;
}

interface UnderwritingMetrics {
  debtToIncomeRatio: number;
  disposableIncome: number;
  hasStableIncome: boolean;
  riskFactors: string[];
  recommendedMaxPayment: number;
  assetMetrics?: AssetMetrics;
}

class BankAnalysisService {
  static async analyzeIncome(accessToken: string): Promise<IncomeAnalysis> {
    try {
      logger.info("Starting income analysis for token:", { 
        tokenType: accessToken.trim().toLowerCase() === 'test_token' ? 'test_token' : 'plaid_token'
      });

      const transactions = await PlaidService.getTransactions(accessToken);
      const income = transactions.filter((t: Transaction) => t.amount > 0);

      // Group by source for income stability analysis
      const incomeBySource = income.reduce((acc: {[key: string]: number[]}, t: Transaction) => {
        const source = t.merchant_name || t.name || 'Unknown';
        acc[source] = acc[source] || [];
        acc[source].push(t.amount);
        return acc;
      }, {});

      const stableIncomeSources = Object.entries(incomeBySource)
        .filter(([_, amounts]) => amounts.length >= 2) // At least 2 payments
        .map(([source]) => source);

      const result = {
        averageMonthlyIncome: this.calculateAverageMonthly(income),
        incomeStability: this.calculateStability(income),
        lastPaymentDate: new Date(income[0]?.date || Date.now()),
        incomeSources: stableIncomeSources
      };

      logger.info("Completed income analysis:", {
        averageMonthly: result.averageMonthlyIncome,
        stability: result.incomeStability,
        sourceCount: result.incomeSources.length
      });

      return result;
    } catch (error) {
      logger.error("Error analyzing income:", { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  static async analyzeExpenses(accessToken: string): Promise<ExpenseAnalysis> {
    try {
      logger.info("Starting expense analysis for token:", {
        tokenType: accessToken.trim().toLowerCase() === 'test_token' ? 'test_token' : 'plaid_token'
      });

      const transactions = await PlaidService.getTransactions(accessToken);
      const expenses = transactions.filter((t: Transaction) => t.amount < 0);

      const debtPayments = expenses.filter((t: Transaction) => 
        t.category?.some(c => 
          ['LOAN_PAYMENTS', 'CREDIT_CARD', 'MORTGAGE', 'RENT'].includes(c.toUpperCase())
        )
      );

      const result = {
        averageMonthlyExpenses: this.calculateAverageMonthly(expenses),
        largestExpenseCategory: this.findLargestCategory(expenses),
        recurringExpenses: this.identifyRecurring(expenses),
        debtObligations: Math.abs(this.calculateAverageMonthly(debtPayments))
      };

      logger.info("Completed expense analysis:", {
        averageMonthly: result.averageMonthlyExpenses,
        debtObligations: result.debtObligations,
        largestCategory: result.largestExpenseCategory
      });

      return result;
    } catch (error) {
      logger.error("Error analyzing expenses:", { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  static async analyzeAssets(accessToken: string): Promise<AssetMetrics> {
    try {
      logger.info("Starting asset analysis for token");

      const reportData = await PlaidService.createAssetReport(accessToken);
      const report = await PlaidService.getAssetReport(reportData.asset_report_token);

      let totalAssets = 0;
      let balances: number[] = [];

      report.items.forEach(item => {
        item.accounts.forEach(account => {
          if (account.type === 'depository') {
            totalAssets += account.balances.current || 0;
            account.historical_balances?.forEach(balance => {
              balances.push(balance.current);
            });
          }
        });
      });

      const averageBalance = balances.reduce((sum, bal) => sum + bal, 0) / balances.length;
      const lowestBalance = Math.min(...balances);
      const balanceStability = this.calculateStability(balances);

      const metrics = {
        totalAssets,
        averageBalance,
        lowestBalance,
        balanceStability
      };

      logger.info("Completed asset analysis:", {
        totalAssets,
        averageBalance,
        stability: balanceStability
      });

      return metrics;
    } catch (error) {
      logger.error("Error analyzing assets:", { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  static async calculateUnderwritingMetrics(accessToken: string, proposedPayment: number): Promise<UnderwritingMetrics> {
    try {
      logger.info("Starting underwriting calculation:", {
        tokenType: accessToken.trim().toLowerCase() === 'test_token' ? 'test_token' : 'plaid_token',
        proposedPayment
      });

      const [income, expenses, assets] = await Promise.all([
        this.analyzeIncome(accessToken),
        this.analyzeExpenses(accessToken),
        this.analyzeAssets(accessToken)
      ]);

      const monthlyIncome = income.averageMonthlyIncome;
      const totalDebtObligations = expenses.debtObligations + proposedPayment;
      const dti = (totalDebtObligations / monthlyIncome) * 100;

      const disposableIncome = monthlyIncome - expenses.averageMonthlyExpenses;
      const hasStableIncome = income.incomeStability > 75 && income.incomeSources.length > 0;

      const riskFactors = [];
      if (dti > 43) riskFactors.push('DTI ratio too high');
      if (!hasStableIncome) riskFactors.push('Unstable income');
      if (disposableIncome < proposedPayment * 1.5) riskFactors.push('Insufficient disposable income');

      if (assets.totalAssets < proposedPayment * 3) {
        riskFactors.push('Insufficient asset reserves');
      }
      if (assets.balanceStability < 60) {
        riskFactors.push('Unstable account balances');
      }
      if (assets.lowestBalance < proposedPayment) {
        riskFactors.push('Low balance history');
      }

      const recommendedMaxPayment = Math.min(
        (monthlyIncome * 0.28) - expenses.debtObligations,
        assets.totalAssets * 0.1 
      );

      const result = {
        debtToIncomeRatio: parseFloat(dti.toFixed(2)),
        disposableIncome: parseFloat(disposableIncome.toFixed(2)),
        hasStableIncome,
        riskFactors,
        recommendedMaxPayment: Math.max(0, parseFloat(recommendedMaxPayment.toFixed(2))),
        assetMetrics: assets
      };

      logger.info("Completed underwriting calculation:", {
        dti: result.debtToIncomeRatio,
        hasStableIncome: result.hasStableIncome,
        riskFactorCount: result.riskFactors.length,
        totalAssets: assets.totalAssets
      });

      return result;
    } catch (error) {
      logger.error("Error calculating underwriting metrics:", { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  private static calculateAverageMonthly(transactions: Transaction[]): number {
    if (!transactions.length) return 0;
    const sum = transactions.reduce((acc, t) => acc + Math.abs(t.amount), 0);
    const days = (new Date(transactions[0].date).getTime() - 
                 new Date(transactions[transactions.length - 1].date).getTime()) / 
                 (1000 * 60 * 60 * 24);
    return (sum / Math.max(days, 1)) * 30;
  }

  private static calculateStability(transactions: number[]): number {
    if (!transactions.length) return 0;
    const amounts = transactions;
    const std = this.standardDeviation(amounts);
    const mean = amounts.reduce((a, b) => a + b) / amounts.length;
    return Math.min(100, Math.max(0, (1 - (std / Math.abs(mean))) * 100));
  }

  private static standardDeviation(values: number[]): number {
    if (!values.length) return 0;
    const avg = values.reduce((a, b) => a + b) / values.length;
    const squareDiffs = values.map(value => Math.pow(value - avg, 2));
    return Math.sqrt(squareDiffs.reduce((a, b) => a + b) / values.length);
  }

  private static findLargestCategory(transactions: Transaction[]): string {
    const categories: {[key: string]: number} = {};
    transactions.forEach(t => {
      const cat = t.category?.[0] || 'Uncategorized';
      categories[cat] = (categories[cat] || 0) + Math.abs(t.amount);
    });
    return Object.entries(categories)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'Uncategorized';
  }

  private static identifyRecurring(transactions: Transaction[]): number {
    const monthlyRecurring = transactions.filter(t => {
      const similar = transactions.filter(other => 
        Math.abs(other.amount - t.amount) < 1 &&
        other.merchant_name === t.merchant_name &&
        new Date(other.date).getTime() !== new Date(t.date).getTime()
      );
      return similar.length >= 2;
    });
    return monthlyRecurring.reduce((acc, t) => acc + Math.abs(t.amount), 0);
  }
}

export const bankAnalysisService = BankAnalysisService;