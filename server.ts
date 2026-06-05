import dotenv from "dotenv";

dotenv.config();

const {
  ensureAiSchema,
  ensureBulkInventorySchema,
  ensureCashManagementSchema,
  ensureCompanionDeviceAssignmentsSchema,
  ensureCustomerAccountSchema,
  ensureAuditAndStockLedgerSchema,
  ensureHardwareDeviceSchema,
  ensureManagerTaskSchema,
  ensurePersonDiscountSchema,
  ensurePurchaseOrderReceivingSchema,
  ensurePushNotificationSchema,
  ensureRealtimePubsubSchema,
  ensureReorderRecommendationSchema,
  ensureRefundSchema,
  ensureSalePaymentsTable,
  ensureStaffRoleSupportsChef,
  ensureStaffPermissionsSchema,
  ensureStockBatchSchema,
  ensureStockTakeSchema,
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
await ensureCustomerAccountSchema().catch((err: unknown) => {
  console.warn("Failed to ensure customer account schema:", err);
});
await ensurePersonDiscountSchema().catch((err: unknown) => {
  console.warn("Failed to ensure person discount schema:", err);
});
await ensureCashManagementSchema().catch((err: unknown) => {
  console.warn("Failed to ensure cash management schema:", err);
});
await ensureRefundSchema().catch((err: unknown) => {
  console.warn("Failed to ensure refund schema:", err);
});
await ensureAuditAndStockLedgerSchema().catch((err: unknown) => {
  console.warn("Failed to ensure audit and stock ledger schema:", err);
});
await ensureManagerTaskSchema().catch((err: unknown) => {
  console.warn("Failed to ensure manager task schema:", err);
});
await ensureStockTakeSchema().catch((err: unknown) => {
  console.warn("Failed to ensure stocktake schema:", err);
});
await ensureCompanionDeviceAssignmentsSchema().catch((err: unknown) => {
  console.warn("Failed to ensure companion device assignment schema:", err);
});
await ensureHardwareDeviceSchema().catch((err: unknown) => {
  console.warn("Failed to ensure hardware device schema:", err);
});
await ensurePushNotificationSchema().catch((err: unknown) => {
  console.warn("Failed to ensure push notification schema:", err);
});
await ensureRealtimePubsubSchema().catch((err: unknown) => {
  console.warn("Failed to ensure realtime pub/sub schema:", err);
});
await ensureBulkInventorySchema().catch((err: unknown) => {
  console.warn("Failed to ensure bulk inventory schema:", err);
});
await ensurePurchaseOrderReceivingSchema().catch((err: unknown) => {
  console.warn("Failed to ensure purchase order receiving schema:", err);
});
await ensureStockBatchSchema().catch((err: unknown) => {
  console.warn("Failed to ensure stock batch schema:", err);
});
await ensureReorderRecommendationSchema().catch((err: unknown) => {
  console.warn("Failed to ensure reorder recommendation schema:", err);
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
