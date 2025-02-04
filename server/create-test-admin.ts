import { db } from "@db";
import { users } from "@db/schema";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 32)) as Buffer;
  return `${derivedKey.toString("hex")}.${salt}`;
}

async function createTestAdmin() {
  const adminPassword = process.env.ADMIN_TEST_PASSWORD || 'change_me_in_production';
  const adminEmail = process.env.ADMIN_TEST_EMAIL || 'admin@example.com';

  if (process.env.NODE_ENV === 'production') {
    console.warn('[WARNING] Running createTestAdmin in production environment');
    return;
  }

  const hashedPassword = await hashPassword(adminPassword);

  try {
    const [user] = await db
      .insert(users)
      .values({
        username: "admin",
        password: hashedPassword,
        email: adminEmail,
        name: "Admin User",
        role: "admin",
      })
      .returning();

    console.log("Created test admin user:", { username: user.username, email: user.email });
  } catch (error) {
    console.error("Failed to create test admin:", error);
  }
}

// Only run in development
if (process.env.NODE_ENV !== 'production') {
  createTestAdmin().catch(console.error);
}