import dotenv from "dotenv";

dotenv.config();

const { ensureSalePaymentsTable } = await import("./server/init-db.js");
await ensureSalePaymentsTable().catch((err: unknown) => {
  console.warn("Failed to ensure sale_payments table:", err);
});

const { startServer } = await import("./server/app.js");

startServer().catch((err: unknown) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
