import { rewardService } from './reward';
import { shifiRewardsService } from './shifi-rewards';

export function calculateMonthlyPayment(
  amount: number,
  annualInterestRate: number = 0, // Fixed at 0% interest
  termMonths: number = 24 // Fixed at 24 months
): number {
  // Calculate loan amount after 5% down payment
  const downPayment = amount * 0.05;
  const principalAfterDownPayment = amount - downPayment;

  // For 0% interest, simply divide by term
  return principalAfterDownPayment / termMonths;
}

export function calculateTotalInterest(
  monthlyPayment: number,
  amount: number,
  termMonths: number = 24
): number {
  // With 0% interest, total interest is 0
  return 0;
}

export async function processDownPayment(
  userId: number,
  contractId: number,
  amount: number
): Promise<void> {
  const basePoints = Math.floor(amount / 10);

  await shifiRewardsService.addTransaction({
    userId,
    contractId,
    amount: basePoints,
    type: 'DOWN_PAYMENT',
    description: `Earned ${basePoints} coins for down payment of $${amount}`,
    metadata: { downPaymentAmount: amount }
  });
}

export async function processEarlyPayment(
  userId: number,
  contractId: number,
  amount: number,
  monthsEarly: number,
  isFullPayoff: boolean
): Promise<void> {
  const reward = rewardService.calculateEarlyPaymentReward(amount, monthsEarly, isFullPayoff);

  await shifiRewardsService.addTransaction({
    userId,
    contractId,
    amount: reward.totalPoints,
    type: isFullPayoff ? 'FULL_PAYOFF' : 'EARLY_PAYMENT',
    description: `Earned ${reward.totalPoints} coins for ${isFullPayoff ? 'full payoff' : 'early payment'} of $${amount}`,
    metadata: {
      amount,
      monthsEarly,
      basePoints: reward.basePoints,
      bonusPoints: reward.bonusPoints
    }
  });
}

export async function processAdditionalPayment(
  userId: number,
  contractId: number,
  additionalAmount: number
): Promise<void> {
  const reward = rewardService.calculateAdditionalPaymentReward(additionalAmount);

  await shifiRewardsService.addTransaction({
    userId,
    contractId,
    amount: reward.totalPoints,
    type: 'ADDITIONAL_PAYMENT',
    description: `Earned ${reward.totalPoints} coins for additional payment of $${additionalAmount}`,
    metadata: {
      additionalAmount,
      basePoints: reward.basePoints,
      bonusPoints: reward.bonusPoints
    }
  });
}

export function calculatePotentialRewards(
  remainingBalance: number,
  remainingMonths: number,
  additionalPayment: number = 0
): { earlyPayoff: number, additional: number } {
  const earlyPayoffReward = rewardService.calculatePotentialEarlyPayoffReward(
    remainingBalance,
    remainingMonths
  );

  const additionalPaymentReward = additionalPayment > 0 
    ? rewardService.calculateAdditionalPaymentReward(additionalPayment)
    : { totalPoints: 0 };

  return {
    earlyPayoff: earlyPayoffReward.totalPoints,
    additional: additionalPaymentReward.totalPoints
  };
}