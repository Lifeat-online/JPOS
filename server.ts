import { startServer } from "./server/app.ts";

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
