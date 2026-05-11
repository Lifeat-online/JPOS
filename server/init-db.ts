import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { isPostgres, query } from "./db.js";

dotenv.config();

async function runSchema() {
  const schemaPath = path.join(
    process.cwd(),
    "db",
    isPostgres() ? "schema.postgres.sql" : "schema.sql"
  );
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found: ${schemaPath}`);
  }

  const sql = fs.readFileSync(schemaPath, "utf8");
  const sqlWithoutLineComments = sql
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (trimmed.length === 0) return true;
      if (trimmed.startsWith("--")) return false;
      if (trimmed.startsWith("#")) return false;
      return true;
    })
    .join("\n");

  const statements = sqlWithoutLineComments
    .split(/;\s*(?:\r?\n|$)/)
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0);

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
