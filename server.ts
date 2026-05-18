import dotenv from "dotenv";

dotenv.config();

const {
  ensureAiSchema,
  ensureBulkInventorySchema,
  ensureCashManagementSchema,
  ensureSalePaymentsTable,
  ensureStaffRoleSupportsChef,
  ensureStaffPermissionsSchema,
} = await import("./server/init-db.js");
const { ensureLicenceSchema } = await import("./server/licenceSchema.js");
await ensureSalePaymentsTable().catch((err: unknown) => {
  console.warn("Failed to ensure sale_payments table:", err);
});
await ensureStaffRoleSupportsChef().catch((err: unknown) => {
  console.warn("Failed to ensure staff role schema:", err);
});
await ensureStaffPermissionsSchema().catch((err: unknown) => {
  console.warn("Failed to ensure staff permissions schema:", err);
});
await ensureCashManagementSchema().catch((err: unknown) => {
  console.warn("Failed to ensure cash management schema:", err);
});
await ensureBulkInventorySchema().catch((err: unknown) => {
  console.warn("Failed to ensure bulk inventory schema:", err);
});
await ensureLicenceSchema().catch((err: unknown) => {
  console.warn("Failed to ensure licence schema:", err);
});
await ensureAiSchema().catch((err: unknown) => {
  console.warn("Failed to ensure AI schema:", err);
});

const { startServer } = await import("./server/app.js");

startServer().catch((err: unknown) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
