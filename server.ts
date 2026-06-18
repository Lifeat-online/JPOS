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
  ensureDeliveryIntegrationSchema,
  ensureIntegrationAccessSchema,
  ensureRefreshTokenSessionSchema,
  ensureSensitiveActionSchema,
  ensureTwoFactorSchema,
  ensureRetentionPolicySchema,
  ensureCustomerPrivacySchema,
  ensureCustomerConsentSchema,
  ensureLoyaltySchema,
  ensurePromotionSchema,
  ensureStaffSchedulingSchema,
  ensureTipPoolingSchema,
  ensureStaffPerformanceSchema,
  ensureOfflineSaleSyncSchema,
  ensureLaybySchema,
  ensureManagerOverrideSchema,
  ensureEventBookingSchema,
  ensureMultiLocationInventorySchema,
  ensureReorderNotificationRuleSchema,
  ensureTaxPeriodSchema,
  ensureRestaurantInventoryTables,
} = await import("./server/init-db.js");
const { ensureLicenceSchema } = await import("./server/licenceSchema.js");

const ensureFns: Array<[() => Promise<unknown>, string]> = [
  [ensureSalePaymentsTable, "sale_payments table"],
  [ensureStaffRoleSupportsChef, "staff role schema"],
  [ensureStaffPermissionsSchema, "staff permissions schema"],
  [ensureCustomerAccountSchema, "customer account schema"],
  [ensurePersonDiscountSchema, "person discount schema"],
  [ensureCashManagementSchema, "cash management schema"],
  [ensureRefundSchema, "refund schema"],
  [ensureAuditAndStockLedgerSchema, "audit and stock ledger schema"],
  [ensureManagerTaskSchema, "manager task schema"],
  [ensureStockTakeSchema, "stocktake schema"],
  [ensureCompanionDeviceAssignmentsSchema, "companion device assignment schema"],
  [ensureHardwareDeviceSchema, "hardware device schema"],
  [ensurePushNotificationSchema, "push notification schema"],
  [ensureRealtimePubsubSchema, "realtime pubsub schema"],
  [ensureBulkInventorySchema, "bulk inventory schema"],
  [ensurePurchaseOrderReceivingSchema, "purchase order receiving schema"],
  [ensureStockBatchSchema, "stock batch schema"],
  [ensureReorderRecommendationSchema, "reorder recommendation schema"],
  [ensureDeliveryIntegrationSchema, "delivery integration schema"],
  [ensureIntegrationAccessSchema, "integration access schema"],
  [ensureRefreshTokenSessionSchema, "refresh token session schema"],
  [ensureSensitiveActionSchema, "sensitive action schema"],
  [ensureTwoFactorSchema, "two factor schema"],
  [ensureRetentionPolicySchema, "retention policy schema"],
  [ensureCustomerPrivacySchema, "customer privacy schema"],
  [ensureCustomerConsentSchema, "customer consent schema"],
  [ensureLoyaltySchema, "loyalty schema"],
  [ensurePromotionSchema, "promotion schema"],
  [ensureStaffSchedulingSchema, "staff scheduling schema"],
  [ensureTipPoolingSchema, "tip pooling schema"],
  [ensureStaffPerformanceSchema, "staff performance schema"],
  [ensureOfflineSaleSyncSchema, "offline sale sync schema"],
  [ensureLaybySchema, "layby schema"],
  [ensureManagerOverrideSchema, "manager override schema"],
  [ensureEventBookingSchema, "event booking schema"],
  [ensureMultiLocationInventorySchema, "multi-location inventory schema"],
  [ensureReorderNotificationRuleSchema, "reorder notification rule schema"],
  [ensureTaxPeriodSchema, "tax period schema"],
  [ensureRestaurantInventoryTables, "restaurant inventory tables"],
];

for (const [fn, label] of ensureFns) {
  try {
    await fn();
  } catch (err: unknown) {
    console.warn(`Failed to ensure ${label}:`, err);
  }
}

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
