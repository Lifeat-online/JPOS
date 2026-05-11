import dotenv from "dotenv";

dotenv.config();

const { startServer } = await import("./server/app.js");

startServer().catch((err: unknown) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
