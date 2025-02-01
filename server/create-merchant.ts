
import { db } from "@db";
import { merchants } from "@db/schema";
import { eq } from "drizzle-orm";

async function createMerchant() {
  try {
    // Check if merchant already exists
    const existingMerchant = await db.query.merchants.findMany({
      where: eq(merchants.userId, 10),
    });

    if (existingMerchant.length > 0) {
      console.log("Merchant already exists:", existingMerchant[0]);
      return;
    }

    const [merchant] = await db.insert(merchants).values({
      userId: 10, // pagel's user ID
      companyName: "Pagel Enterprises",
      ein: "",
      status: "active",
      reserveBalance: 0,
    }).returning();
    
    console.log("Created merchant:", merchant);
  } catch (err) {
    console.error("Error creating merchant:", err);
    process.exit(1);
  }
}

createMerchant();
