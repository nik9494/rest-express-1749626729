import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";
import "dotenv/config";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

console.log("Connecting to database:", process.env.DATABASE_URL);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

// Проверяем подключение
pool.on("connect", () => {
  console.log("✅ Successfully connected to database");
});

pool.on("error", (err) => {
  console.error("❌ Database connection error:", err);
});

// Тестируем подключение только если DATABASE_URL не содержит localhost
if (
  !process.env.DATABASE_URL.includes("localhost") &&
  !process.env.DATABASE_URL.includes("127.0.0.1")
) {
  pool.query("SELECT NOW()", (err, res) => {
    if (err) {
      console.error("❌ Database test query failed:", err);
    } else {
      console.log("✅ Database test query successful:", res.rows[0]);
    }
  });
} else {
  console.log("⚠️ Skipping database test - localhost connection detected");
}

export const db = drizzle(pool, { schema });
