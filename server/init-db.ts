import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { query } from "./db.ts";

dotenv.config();

async function runSchema() {
  const schemaPath = path.join(process.cwd(), "db", "schema.sql");
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found: ${schemaPath}`);
  }

  const sql = fs.readFileSync(schemaPath, "utf8");
  const statements = sql
    .split(/;\s*\n/)
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0 && !stmt.startsWith("--"));

  for (const statement of statements) {
    console.log("Executing:", statement.split("\n")[0]);
    await query(statement);
  }
}

runSchema()
  .then(() => {
    console.log("Database schema initialized successfully.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Failed to initialize database schema:", err);
    process.exit(1);
  });
