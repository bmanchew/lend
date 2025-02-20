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
  const hashedPassword = await hashPassword("admin123");
  
  const [user] = await db
    .insert(users)
    .values({
      username: "admin",
      password: hashedPassword,
      email: "admin@shifi.com",
      name: "Admin User",
      role: "admin",
    })
    .returning();
    
  console.log("Created test admin user:", user);
}

createTestAdmin().catch(console.error);
