
import { db } from "@db";
import { merchants, users } from "@db/schema";
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
          reserveBalance: 0,
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
          userId: adminUser.id,
          companyName: "Pagel Enterprises",
          status: "active",
          reserveBalance: 0,
          website: "https://pagel.com",
          address: "123 Main St",
          ein: "12-3456789"
        })
        .returning();
      console.log("Created merchant:", merchant);
    }
  } catch (err) {
    console.error("Error in createMerchant:", err);
    process.exit(1);
  }
}

createMerchant();
