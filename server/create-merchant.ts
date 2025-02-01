
import { db } from "@db";
import { merchants } from "@db/schema";
import { eq } from "drizzle-orm";

async function createMerchant() {
  try {
    console.log("Checking for existing merchant...");
    const existingMerchant = await db.query.merchants.findMany({
      where: eq(merchants.userId, 10),
    });

    if (existingMerchant.length > 0) {
      console.log("Updating existing merchant...");
      const [merchant] = await db
        .update(merchants)
        .set({
          companyName: "Pagel Enterprises",
          status: "active",
          reserveBalance: 0,
          address: "123 Main St",
          website: "https://pagel.com"
        })
        .where(eq(merchants.id, existingMerchant[0].id))
        .returning();
      console.log("Updated merchant:", merchant);
    } else {
      console.log("Creating new merchant...");
      const [merchant] = await db
        .insert(merchants)
        .values({
          userId: 10,
          companyName: "Pagel Enterprises",
          status: "active",
          reserveBalance: 0,
          address: "123 Main St",
          website: "https://pagel.com",
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
