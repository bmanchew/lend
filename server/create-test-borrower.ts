
import { db } from "@db";
import { users } from "@db/schema";
import { authService } from "./auth";

async function createTestBorrower() {
  try {
    const [borrower] = await db.insert(users).values({
      username: "testborrower@example.com",
      password: await authService.hashPassword("borrower123"),
      email: "testborrower@example.com",
      name: "Test Borrower",
      role: "customer",
      phoneNumber: "+19493223824",
      kycStatus: "pending"
    }).returning();

    console.log("Created borrower:", borrower);
  } catch (err) {
    console.error("Error creating borrower:", err);
    process.exit(1);
  }
}

createTestBorrower();
