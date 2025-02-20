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
          companyName: "Pagel Enterprises",
          status: "active",
          reserveBalance: "0", // Store as string to match schema
          website: "https://pagel.com",
          address: "123 Main St"
        })
        .where(eq(merchants.id, existingMerchant[0].id))
        .returning();

      console.log("Updated merchant:", merchant);
    } else {
      console.log("Creating new merchant...");
      const [merchant] = await db
        .insert(merchants)
        .values({
          companyName: "Pagel Enterprises",
          status: "active",
          reserveBalance: "0", // Store as string to match schema
          website: "https://pagel.com",
          address: "123 Main St",
          userId: adminUser.id
        })
        .returning();

      // Create default program with fixed terms
      const [program] = await db
        .insert(programs)
        .values({
          merchantId: merchant.id,
          name: 'Standard Program',
          term: 24,
          interestRate: '0',
          active: true
        })
        .returning();

      console.log("Created merchant:", merchant);
      console.log("Created program:", program);
    }
  } catch (err) {
    console.error("Error in createMerchant:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

createMerchant();