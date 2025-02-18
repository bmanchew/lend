import { db } from "@db";
import { contracts } from "@db/schema";
import { eq } from "drizzle-orm";
import { smsService } from "./sms";
import { logger } from "../lib/logger";
import { rewardService } from "./reward";

export const latePaymentService = {
  calculateLateFee(amount: number): number {
    // For 24-hour contracts, late fee is higher to encourage timely payment
    return Math.min(amount * 0.1, 100); // 10% or $100, whichever is less
  },

  async processLatePayment(contractId: number) {
    try {
      const [contract] = await db
        .select()
        .from(contracts)
        .where(eq(contracts.id, contractId))
        .limit(1);

      if (!contract || !contract.monthlyPayment) return;

      const lateFee = this.calculateLateFee(parseFloat(contract.monthlyPayment));

      // Update contract with late fee
      await db
        .update(contracts)
        .set({
          monthlyPayment: (parseFloat(contract.monthlyPayment) + lateFee).toString()
        })
        .where(eq(contracts.id, contractId));

      // Send notification with reward incentive
      if (contract.borrowerPhone) {
        const potentialReward = rewardService.calculateAdditionalPaymentReward(lateFee);
        await smsService.sendSMS(
          contract.borrowerPhone,
          `Late payment fee of $${lateFee} has been applied to your account. Make your payment now to earn ${potentialReward.totalPoints} ShiFi coins as a reward for catching up!`
        );
      }
    } catch (error) {
      logger.error("Error processing late payment:", error);
    }
  }
};