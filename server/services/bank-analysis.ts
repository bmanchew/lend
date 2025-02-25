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
  annualIncome: number;
  incomeScore: number;
}

interface ExpenseAnalysis {
  averageMonthlyExpenses: number;
  largestExpenseCategory: string;
  recurringExpenses: number;
  debtObligations: number;
  dtiScore: number;
}

interface AssetMetrics {
  totalAssets: number;
  averageBalance: number;
  lowestBalance: number;
  balanceStability: number;
  housingStatus: string;
  housingScore: number;
}

interface UnderwritingMetrics {
  debtToIncomeRatio: number;
  disposableIncome: number;
  hasStableIncome: boolean;
  riskFactors: string[];
  recommendedMaxPayment: number;
  assetMetrics?: AssetMetrics;
  employmentScore: number;
  annualIncome: number;
  dtiScore: number;
  totalScore: number;
  tier: string;
  isQualified: boolean;
}

class BankAnalysisService {
  static async analyzeIncome(accessToken: string): Promise<IncomeAnalysis> {
    try {
      const transactions = await PlaidService.getTransactions(accessToken);
      const income = transactions.filter((t: Transaction) => t.amount > 0);

      const incomeBySource = income.reduce((acc: {[key: string]: number[]}, t: Transaction) => {
        const source = t.merchant_name || t.name || 'Unknown';
        acc[source] = acc[source] || [];
        acc[source].push(t.amount);
        return acc;
      }, {});

      const monthlyIncome = this.calculateAverageMonthly(income);
      const annualIncome = monthlyIncome * 12;

      // Score income based on documented thresholds
      let incomeScore = 1;
      if (annualIncome >= 100000) incomeScore = 5;
      else if (annualIncome >= 75000) incomeScore = 4;
      else if (annualIncome >= 50000) incomeScore = 3;
      else if (annualIncome >= 35000) incomeScore = 2;
      else incomeScore = 1;

      return {
        averageMonthlyIncome: monthlyIncome,
        annualIncome,
        incomeScore,
        incomeStability: this.calculateStability(income.map(t => t.amount)),
        lastPaymentDate: new Date(income[0]?.date || Date.now()),
        incomeSources: Object.keys(incomeBySource)
      };
    } catch (error) {
      logger.error("Error analyzing income:", { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  static async analyzeExpenses(accessToken: string): Promise<ExpenseAnalysis> {
    try {
      const transactions = await PlaidService.getTransactions(accessToken);
      const expenses = transactions.filter((t: Transaction) => t.amount < 0);

      const debtPayments = expenses.filter((t: Transaction) => 
        t.category?.some(c => 
          ['LOAN_PAYMENTS', 'CREDIT_CARD', 'MORTGAGE', 'RENT'].includes(c.toUpperCase())
        )
      );

      const monthlyExpenses = this.calculateAverageMonthly(expenses);
      const monthlyDebtObligations = this.calculateAverageMonthly(debtPayments);

      // Calculate DTI score based on documented thresholds
      const dti = (monthlyDebtObligations / monthlyExpenses) * 100;
      let dtiScore = 1;
      if (dti < 15) dtiScore = 5;
      else if (dti <= 20) dtiScore = 4;
      else if (dti <= 35) dtiScore = 3;
      else if (dti <= 45) dtiScore = 2;
      else dtiScore = 1;

      return {
        averageMonthlyExpenses: monthlyExpenses,
        largestExpenseCategory: this.findLargestCategory(expenses),
        recurringExpenses: this.identifyRecurring(expenses),
        debtObligations: Math.abs(monthlyDebtObligations),
        dtiScore
      };
    } catch (error) {
      logger.error("Error analyzing expenses:", { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  static async analyzeAssets(accessToken: string): Promise<AssetMetrics> {
    try {
      const reportData = await PlaidService.createAssetReport(accessToken);
      const report = await PlaidService.getAssetReport(reportData.asset_report_token);

      let totalAssets = 0;
      let balances: number[] = [];
      let housingStatus = 'Renting'; // Default assumption

      report.items.forEach(item => {
        item.accounts.forEach(account => {
          if (account.type === 'depository') {
            totalAssets += account.balances.current || 0;
            account.historical_balances?.forEach(balance => {
              balances.push(balance.current);
            });
          }
          // Detect housing status from account types
          if (account.type === 'loan' && account.subtype === 'mortgage') {
            housingStatus = 'Owns Home (With Mortgage)';
          }
        });
      });

      const averageBalance = balances.reduce((sum, bal) => sum + bal, 0) / balances.length;
      const lowestBalance = Math.min(...balances);
      const balanceStability = this.calculateStability(balances);

      // Score housing status based on documented criteria
      let housingScore = 3; // Default for renting
      if (housingStatus === 'Owns Home (No Mortgage)') housingScore = 5;
      else if (housingStatus === 'Owns Home (With Mortgage)') housingScore = 4;
      else if (housingStatus === 'Living with friends or family') housingScore = 2;
      else if (housingStatus === 'Other') housingScore = 1;

      return {
        totalAssets,
        averageBalance,
        lowestBalance,
        balanceStability,
        housingStatus,
        housingScore
      };
    } catch (error) {
      logger.error("Error analyzing assets:", { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  static async calculateUnderwritingMetrics(accessToken: string, proposedPayment: number): Promise<UnderwritingMetrics> {
    try {
      const [income, expenses, assets] = await Promise.all([
        this.analyzeIncome(accessToken),
        this.analyzeExpenses(accessToken),
        this.analyzeAssets(accessToken)
      ]);

      const monthlyIncome = income.averageMonthlyIncome;
      const totalDebtObligations = expenses.debtObligations + proposedPayment;
      const dti = (totalDebtObligations / monthlyIncome) * 100;
      const disposableIncome = monthlyIncome - expenses.averageMonthlyExpenses;

      // Calculate employment score based on income stability
      let employmentScore = 1;
      if (income.incomeStability > 90) employmentScore = 5;
      else if (income.incomeStability > 80) employmentScore = 4;
      else if (income.incomeStability > 70) employmentScore = 3;
      else if (income.incomeStability > 60) employmentScore = 2;

      // Risk factors based on documented criteria
      const riskFactors = [];
      if (income.annualIncome < 35000) riskFactors.push('Annual income below minimum threshold');
      if (dti > 45) riskFactors.push('DTI ratio too high');
      if (disposableIncome < proposedPayment * 1.5) riskFactors.push('Insufficient disposable income');
      if (assets.totalAssets < proposedPayment * 3) riskFactors.push('Insufficient asset reserves');
      if (assets.balanceStability < 60) riskFactors.push('Unstable account balances');
      if (assets.lowestBalance < proposedPayment) riskFactors.push('Low balance history');

      // Calculate total score
      const scores = [
        income.incomeScore,
        employmentScore,
        5, // Credit score placeholder (should be integrated with credit reporting service)
        expenses.dtiScore,
        assets.housingScore,
        5  // Delinquency history placeholder (should be integrated with credit reporting service)
      ];
      const totalScore = scores.reduce((sum, score) => sum + score, 0);

      // Determine tier based on total score
      let tier = 'Tier 4';
      if (totalScore >= 25) tier = 'Tier 1';
      else if (totalScore >= 18) tier = 'Tier 2';
      else if (totalScore >= 12) tier = 'Tier 3';

      // Calculate recommended max payment based on both income and assets
      const recommendedMaxPayment = Math.min(
        (monthlyIncome * 0.28) - expenses.debtObligations,
        assets.totalAssets * 0.1
      );

      return {
        debtToIncomeRatio: parseFloat(dti.toFixed(2)),
        disposableIncome: parseFloat(disposableIncome.toFixed(2)),
        hasStableIncome: income.incomeStability > 75,
        riskFactors,
        recommendedMaxPayment: Math.max(0, parseFloat(recommendedMaxPayment.toFixed(2))),
        assetMetrics: assets,
        employmentScore,
        annualIncome: income.annualIncome,
        dtiScore: expenses.dtiScore,
        totalScore,
        tier,
        isQualified: income.annualIncome >= 35000 && totalScore >= 12
      };
    } catch (error) {
      logger.error("Error calculating underwriting metrics:", { error: error instanceof Error ? error.message : String(error) });
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

  private static calculateStability(amounts: number[]): number {
    if (!amounts.length) return 0;
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