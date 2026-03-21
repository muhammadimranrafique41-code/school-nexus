import { drizzle } from "drizzle-orm/node-postgres";
import * as dotenv from "dotenv";
import * as schema from "../shared/schema.js";

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});

export const db = drizzle(pool, {
  schema
});

export { pool };