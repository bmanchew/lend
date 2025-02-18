
import { db } from "@db";
import { contracts } from "@db/schema";
import { eq } from "drizzle-orm";
import { smsService } from "./sms";
import { logger } from "../lib/logger";

export const latePaymentService = {
  calculateLateFee(amount: number): number {
    return Math.min(amount * 0.05, 50); // 5% or $50, whichever is less
  },

  async processLatePayment(contractId: number) {
    try {
      const [contract] = await db
        .select()
        .from(contracts)
        .where(eq(contracts.id, contractId))
        .limit(1);

      if (!contract) return;

      const lateFee = this.calculateLateFee(parseFloat(contract.monthlyPayment));
      
      // Update contract with late fee
      await db
        .update(contracts)
        .set({
          monthlyPayment: (parseFloat(contract.monthlyPayment) + lateFee).toString()
        })
        .where(eq(contracts.id, contractId));

      // Send notification
      await smsService.sendSMS(
        contract.borrowerPhone,
        `Late payment fee of $${lateFee} has been applied to your account. Please make your payment as soon as possible.`
      );
    } catch (error) {
      logger.error("Error processing late payment:", error);
    }
  }
};
