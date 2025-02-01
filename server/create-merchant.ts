
import { db } from "@db";
import { merchants } from "@db/schema";

async function createMerchant() {
  try {
    const [merchant] = await db.insert(merchants).values({
      userId: 10, // pagel's user ID
      companyName: "Pagel Enterprises",
      status: "active",
      reserveBalance: 0,
    }).returning();
    
    console.log("Created merchant:", merchant);
  } catch (err) {
    console.error("Error creating merchant:", err);
  }
}

createMerchant();
