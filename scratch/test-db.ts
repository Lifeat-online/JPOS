import { query, isPostgres } from "../server/db.js";
import dotenv from "dotenv";

dotenv.config();

async function test() {
  console.log("Is Postgres:", isPostgres());
  try {
    const rows = await query(`SELECT 1 AS "testAlias", 2 AS camelCaseAlias`);
    console.log("Rows:", JSON.stringify(rows));
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
