import { logger } from '../lib/logger';

export interface RewardPoints {
  basePoints: number;
  bonusPoints: number;
  totalPoints: number;
}

export const rewardService = {
  /**
   * Calculate reward points for early payment
   * @param contractAmount The total contract amount
   * @param monthsEarly Number of months paid early
   * @param isFullPayment Whether this is a full payoff
   */
  calculateEarlyPaymentReward(
    contractAmount: number,
    monthsEarly: number,
    isFullPayment: boolean
  ): RewardPoints {
    // Base points: 1 point per $10 of contract amount
    const basePoints = Math.floor(contractAmount / 10);
    
    // Bonus points for early payment:
    // - 10 points per month early
    // - Additional 100 points for full payoff
    const earlyPaymentBonus = monthsEarly * 10;
    const fullPayoffBonus = isFullPayment ? 100 : 0;
    const bonusPoints = earlyPaymentBonus + fullPayoffBonus;
    
    const totalPoints = basePoints + bonusPoints;

    logger.info('Calculated reward points:', {
      contractAmount,
      monthsEarly,
      isFullPayment,
      basePoints,
      bonusPoints,
      totalPoints
    });

    return {
      basePoints,
      bonusPoints,
      totalPoints
    };
  },

  /**
   * Calculate reward points for additional payment
   * @param additionalAmount Amount paid above minimum payment
   */
  calculateAdditionalPaymentReward(additionalAmount: number): RewardPoints {
    // Base points: 1 point per $10 of additional payment
    const basePoints = Math.floor(additionalAmount / 10);
    
    // Bonus points: 5% of base points for encouraging additional payments
    const bonusPoints = Math.floor(basePoints * 0.05);
    
    const totalPoints = basePoints + bonusPoints;

    logger.info('Calculated additional payment reward:', {
      additionalAmount,
      basePoints,
      bonusPoints,
      totalPoints
    });

    return {
      basePoints,
      bonusPoints,
      totalPoints
    };
  },

  /**
   * Calculate potential rewards for early payoff
   * @param remainingAmount Remaining loan amount
   * @param remainingMonths Months left in loan term
   */
  calculatePotentialEarlyPayoffReward(
    remainingAmount: number,
    remainingMonths: number
  ): RewardPoints {
    return this.calculateEarlyPaymentReward(
      remainingAmount,
      remainingMonths,
      true
    );
  }
};
import { logger } from '../lib/logger';

interface RewardParams {
  amount: number;
  type: 'down_payment' | 'early_payment' | 'additional_payment';
  contractId: string;
}

export async function calculateRewards(params: RewardParams): Promise<number> {
  const REWARD_RATES = {
    down_payment: 0.05, // 5% rewards on down payments
    early_payment: 0.03, // 3% on early payments
    additional_payment: 0.02 // 2% on additional payments
  };

  try {
    const rewardRate = REWARD_RATES[params.type];
    const rewardAmount = params.amount * rewardRate;
    
    logger.info(`Calculated rewards for contract ${params.contractId}:`, {
      amount: params.amount,
      type: params.type,
      rewards: rewardAmount
    });

    return rewardAmount;
  } catch (error) {
    logger.error('Failed to calculate rewards:', error);
    return 0;
  }
}
