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

interface UnderwritingMetrics {
  debtToIncomeRatio: number;
  disposableIncome: number;
  hasStableIncome: boolean;
  riskFactors: string[];
  recommendedMaxPayment: number;
}

class BankAnalysisService {
  static async analyzeIncome(accessToken: string): Promise<IncomeAnalysis> {
    try {
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

      return {
        averageMonthlyIncome: this.calculateAverageMonthly(income),
        incomeStability: this.calculateStability(income),
        lastPaymentDate: new Date(income[0]?.date || Date.now()),
        incomeSources: stableIncomeSources
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

      return {
        averageMonthlyExpenses: this.calculateAverageMonthly(expenses),
        largestExpenseCategory: this.findLargestCategory(expenses),
        recurringExpenses: this.identifyRecurring(expenses),
        debtObligations: Math.abs(this.calculateAverageMonthly(debtPayments))
      };
    } catch (error) {
      logger.error("Error analyzing expenses:", { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  static async calculateUnderwritingMetrics(accessToken: string, proposedPayment: number): Promise<UnderwritingMetrics> {
    try {
      const income = await this.analyzeIncome(accessToken);
      const expenses = await this.analyzeExpenses(accessToken);

      const monthlyIncome = income.averageMonthlyIncome;
      const totalDebtObligations = expenses.debtObligations + proposedPayment;
      const dti = (totalDebtObligations / monthlyIncome) * 100;

      const disposableIncome = monthlyIncome - expenses.averageMonthlyExpenses;
      const hasStableIncome = income.incomeStability > 75 && income.incomeSources.length > 0;

      // Risk analysis
      const riskFactors = [];
      if (dti > 43) riskFactors.push('DTI ratio too high');
      if (!hasStableIncome) riskFactors.push('Unstable income');
      if (disposableIncome < proposedPayment * 1.5) riskFactors.push('Insufficient disposable income');

      // Conservative max payment recommendation (28% front-end DTI)
      const recommendedMaxPayment = (monthlyIncome * 0.28) - expenses.debtObligations;

      return {
        debtToIncomeRatio: parseFloat(dti.toFixed(2)),
        disposableIncome: parseFloat(disposableIncome.toFixed(2)),
        hasStableIncome,
        riskFactors,
        recommendedMaxPayment: Math.max(0, parseFloat(recommendedMaxPayment.toFixed(2)))
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

  private static calculateStability(transactions: Transaction[]): number {
    if (!transactions.length) return 0;
    const amounts = transactions.map(t => t.amount);
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