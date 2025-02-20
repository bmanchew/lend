import { db } from "@db";
import { merchants, users, programs } from "@db/schema";
import { eq } from "drizzle-orm";

async function createMerchant() {
  try {
    // First find admin user
    const [adminUser] = await db
      .select()
      .from(users)
      .where(eq(users.role, 'admin'))
      .limit(1);

    if (!adminUser) {
      console.error("No admin user found");
      process.exit(1);
    }

    console.log("Checking for existing merchant...");
    const existingMerchant = await db.query.merchants.findMany({
      where: eq(merchants.userId, adminUser.id),
    });

    if (existingMerchant.length > 0) {
      console.log("Updating existing merchant...");
      const [merchant] = await db
        .update(merchants)
        .set({
          companyName: "Example Merchant",
          status: "active",
          reserveBalance: "0", // Changed to string to match schema
          website: "https://example.com",
          address: "123 Main St"
        } as typeof merchants.$inferInsert)
        .where(eq(merchants.id, existingMerchant[0].id))
        .returning();

      // Ensure merchant has the standard 24-month 0% APR program
      const [existingProgram] = await db
        .select()
        .from(programs)
        .where(eq(programs.merchantId, merchant.id))
        .limit(1);

      if (!existingProgram) {
        await db.insert(programs)
          .values({
            merchantId: merchant.id,
            name: "Standard Financing",
            term: 24,
            interestRate: "0",
            status: "active"
          } as typeof programs.$inferInsert);
      }

      console.log("Updated merchant:", merchant);
    } else {
      console.log("Creating new merchant...");
      const [merchant] = await db
        .insert(merchants)
        .values({
          userId: adminUser.id,
          companyName: "Example Merchant",
          status: "active",
          reserveBalance: "0", // Changed to string to match schema
          website: "https://example.com",
          address: "123 Main St",
          ein: "12-3456789"
        } as typeof merchants.$inferInsert)
        .returning();

      // Create default 24-month 0% APR program
      await db.insert(programs)
        .values({
          merchantId: merchant.id,
          name: "Standard Financing",
          term: 24,
          interestRate: "0",
          status: "active"
        } as typeof programs.$inferInsert);

      console.log("Created merchant:", merchant);
    }
  } catch (err) {
    console.error("Error in createMerchant:", err);
    process.exit(1);
  }
}

createMerchant();