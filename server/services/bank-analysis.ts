
import { PlaidService } from "./plaid";
import { logger } from "../lib/logger";

interface IncomeAnalysis {
  averageMonthlyIncome: number;
  incomeStability: number;
  lastPaymentDate: Date;
}

interface ExpenseAnalysis {
  averageMonthlyExpenses: number;
  largestExpenseCategory: string;
  recurringExpenses: number;
}

export const bankAnalysisService = {
  async analyzeIncome(accessToken: string): Promise<IncomeAnalysis> {
    try {
      const transactions = await PlaidService.getTransactions(accessToken);
      const income = transactions.filter(t => t.amount > 0);
      
      return {
        averageMonthlyIncome: this.calculateAverageMonthly(income),
        incomeStability: this.calculateStability(income),
        lastPaymentDate: new Date(income[0]?.date)
      };
    } catch (error) {
      logger.error("Error analyzing income:", error);
      throw error;
    }
  },

  async analyzeExpenses(accessToken: string): Promise<ExpenseAnalysis> {
    try {
      const transactions = await PlaidService.getTransactions(accessToken);
      const expenses = transactions.filter(t => t.amount < 0);
      
      return {
        averageMonthlyExpenses: this.calculateAverageMonthly(expenses),
        largestExpenseCategory: this.findLargestCategory(expenses),
        recurringExpenses: this.identifyRecurring(expenses)
      };
    } catch (error) {
      logger.error("Error analyzing expenses:", error);
      throw error;
    }
  },

  private calculateAverageMonthly(transactions: any[]): number {
    const sum = transactions.reduce((acc, t) => acc + Math.abs(t.amount), 0);
    return sum / 30; // Assuming 30 days of transactions
  },

  private calculateStability(transactions: any[]): number {
    const amounts = transactions.map(t => t.amount);
    const std = this.standardDeviation(amounts);
    const mean = amounts.reduce((a, b) => a + b) / amounts.length;
    return (1 - (std / mean)) * 100;
  },

  private standardDeviation(values: number[]): number {
    const avg = values.reduce((a, b) => a + b) / values.length;
    const squareDiffs = values.map(value => Math.pow(value - avg, 2));
    return Math.sqrt(squareDiffs.reduce((a, b) => a + b) / values.length);
  },

  private findLargestCategory(transactions: any[]): string {
    const categories: {[key: string]: number} = {};
    transactions.forEach(t => {
      const cat = t.category[0];
      categories[cat] = (categories[cat] || 0) + Math.abs(t.amount);
    });
    return Object.entries(categories)
      .sort(([,a], [,b]) => b - a)[0][0];
  },

  private identifyRecurring(transactions: any[]): number {
    const monthly = transactions.filter(t => {
      const similar = transactions.filter(other => 
        Math.abs(other.amount - t.amount) < 1 &&
        other.merchant_name === t.merchant_name
      );
      return similar.length >= 2;
    });
    return monthly.reduce((acc, t) => acc + Math.abs(t.amount), 0);
  }
};
