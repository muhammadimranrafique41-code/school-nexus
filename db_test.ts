import { db } from "./server/db.ts";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Testing DB connection...");
  try {
    const result = await db.execute(sql`SELECT 1 as test`);
    console.log("DB CONNECTION SUCCESS:", result);
  } catch (e) {
    console.error("DB CONNECTION FAILED:", e.message);
  } finally {
    process.exit(0);
  }
}

main();
