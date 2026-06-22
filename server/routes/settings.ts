import { Router } from "express";
import path from "path";
import crypto from "crypto";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { requireAuth } from "../auth-middleware.js";
import { getAppConfigByTenant } from "../mariadb-adapter.js";
import { updateAppConfig } from "../mariadb-crud.js";
import { applyRetentionPolicy, getRetentionPolicy, getRetentionPreview, saveRetentionPolicy } from "../retentionPolicy.js";
import { createPromotion, listPromotions, updatePromotion, validatePromotionForSale } from "../promotions.js";
import { calculateLoyaltyAward, createLoyaltyRewardRule, createLoyaltyTier, listLoyaltyRewardRules, listLoyaltyTiers, updateLoyaltyRewardRule, updateLoyaltyTier } from "../loyalty.js";
import { generateTenantVapidKeys, getPushOverview, removePushSubscription, savePushSubscription, sendPushNotification } from "../pushNotifications.js";
import {
  canManageAi, deleteInsight, generateInsights, generateStaffScores, getAiSettings,
  listAiModels, listInsights, listStaffScores, requireAiRoleAccess, requireAiStaffScoreAccess,
  saveAiSettings, serializeAiSettings, testAiProviderContact,
} from "../ai.js";
import { applyApprovedInventoryAgentSteps, generateInventoryAgentProposal } from "../aiInventoryAgent.js";
import { createEventBooking, deleteEventBooking, listEventBookings, updateEventBooking } from "../eventBookings.js";
import { listLaybyOrders, createLaybyOrder, getLaybyOrderById, addLaybyPayment, completeLaybyOrder, cancelLaybyOrder } from "../layby.js";
import { broadcastSalesUpdate } from "../socket.js";
import { hasPackageFeature, type PackageFeature } from "../../shared/packageCatalog.js";
import {
  canUseActionCenter, canManageBookings, canManagePush, canGenerateVapidKeys,
  auditActorFromRequest, auditRouteEvent, denyWithAudit, enforceSensitiveAction,
  stripSensitiveVerification, auditChangedFields, normalizeRole, parseImageDataUrl,
  sensitiveRouteRateLimit,
} from "./_helpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const settingsRouter = Router({ mergeParams: true });

// ── App config ─────────────────────────────────────────────────────────────

settingsRouter.get("/config", requireAuth, async (req: any, res) => {
  try { res.json(await getAppConfigByTenant(req.params.tenantId)); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

settingsRouter.put("/settings/app", requireAuth, async (req: any, res) => {
  try {
    const settingsUpdate = stripSensitiveVerification(req.body || {});
    const r = await enforceSensitiveAction(req, res, "settings_change", { changedFields: auditChangedFields(settingsUpdate || {}), businessFields: auditChangedFields((settingsUpdate as any)?.business || {}) });
    if (r) return;
    await updateAppConfig(req.params.tenantId, settingsUpdate as any);
    await auditRouteEvent(req, "settings.app_updated", "settings", { changedFields: auditChangedFields(settingsUpdate || {}), businessFields: auditChangedFields((settingsUpdate as any)?.business || {}) }, req.params.tenantId, "settings");
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

settingsRouter.post("/settings/logo", requireAuth, async (req: any, res) => {
  try {
    const parsed = parseImageDataUrl(req.body?.dataUrl);
    if (!parsed) return res.status(400).json({ error: "Upload a PNG, JPG, WebP, GIF, or SVG logo file" });
    if (parsed.buffer.length > 2 * 1024 * 1024) return res.status(413).json({ error: "Logo file is too large. Use an image smaller than 2MB" });
    const tenantId = req.params.tenantId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const uploadDir = path.resolve(__dirname, "..", "..", "public", "uploads", "tenant-logos");
    await fs.mkdir(uploadDir, { recursive: true });
    const fileName = `${tenantId}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${parsed.extension}`;
    await fs.writeFile(path.join(uploadDir, fileName), parsed.buffer);
    const logoUrl = `/uploads/tenant-logos/${fileName}`;
    const currentConfig = await getAppConfigByTenant(req.params.tenantId);
    if (!currentConfig) return res.status(404).json({ error: "Tenant settings not found" });
    const nextConfig = { ...currentConfig, business: { ...(currentConfig.business || {}), logoUrl } };
    await updateAppConfig(req.params.tenantId, nextConfig);
    await auditRouteEvent(req, "settings.logo_uploaded", "settings", { logoUrl, mimeType: parsed.mimeType, sizeBytes: parsed.buffer.length }, req.params.tenantId, "settings");
    res.json({ logoUrl, config: nextConfig });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

settingsRouter.get("/settings/retention-policy", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "retention_policy.view", "Manager access is required to view retention settings.");
    res.json(await getRetentionPolicy(req.params.tenantId));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
settingsRouter.put("/settings/retention-policy", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "retention_policy.update", "Manager access is required to update retention settings.");
    res.json(await saveRetentionPolicy(req.params.tenantId, req.body || {}, auditActorFromRequest(req)));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
settingsRouter.post("/settings/retention-policy/preview", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "retention_policy.preview", "Manager access is required to preview retention cleanup.");
    res.json(await getRetentionPreview(req.params.tenantId, req.body || undefined));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
settingsRouter.post("/settings/retention-policy/apply", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "retention_policy.apply", "Manager access is required to apply retention cleanup.");
    res.json(await applyRetentionPolicy(req.params.tenantId, req.body || undefined, auditActorFromRequest(req)));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// ── Promotions ─────────────────────────────────────────────────────────────

settingsRouter.get("/promotions", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "promotions.view", "Manager access is required for promotions.");
    res.json(await listPromotions(req.params.tenantId));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
settingsRouter.post("/promotions", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "promotions.create", "Manager access is required to create promotions.");
    const promotion = await createPromotion(req.params.tenantId, req.body || {}, auditActorFromRequest(req));
    await auditRouteEvent(req, "promotion.created", "promotion", { promotionId: promotion.id, code: promotion.code, discountType: promotion.discountType, discountValue: promotion.discountValue }, promotion.id, "promotions");
    res.status(201).json(promotion);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
settingsRouter.post("/promotions/validate", requireAuth, async (req: any, res) => {
  try {
    const result = await validatePromotionForSale(null, req.params.tenantId, req.body || {});
    if (!result.valid) return res.status(400).json({ ...result, error: result.reason || "Promotion could not be applied." });
    res.json(result);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
settingsRouter.put("/promotions/:promotionId", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "promotions.update", "Manager access is required to update promotions.");
    const promotion = await updatePromotion(req.params.tenantId, req.params.promotionId, req.body || {}, auditActorFromRequest(req));
    await auditRouteEvent(req, "promotion.updated", "promotion", { promotionId: promotion.id, code: promotion.code, status: promotion.status, discountType: promotion.discountType }, promotion.id, "promotions");
    res.json(promotion);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// ── Loyalty ────────────────────────────────────────────────────────────────

settingsRouter.get("/loyalty/tiers", requireAuth, async (req: any, res) => {
  try { res.json(await listLoyaltyTiers(req.params.tenantId)); } catch (err: any) { res.status(500).json({ error: err.message }); }
});
settingsRouter.post("/loyalty/tiers", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "loyalty.tier_create", "Manager access is required to create loyalty tiers.");
    const tier = await createLoyaltyTier(req.params.tenantId, req.body || {});
    await auditRouteEvent(req, "loyalty.tier_created", "loyalty_tier", { tierId: tier.id, name: tier.name, minPoints: tier.minPoints }, tier.id, "loyalty");
    res.status(201).json(tier);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
settingsRouter.put("/loyalty/tiers/:tierId", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "loyalty.tier_update", "Manager access is required to update loyalty tiers.");
    const tier = await updateLoyaltyTier(req.params.tenantId, req.params.tierId, req.body || {});
    await auditRouteEvent(req, "loyalty.tier_updated", "loyalty_tier", { tierId: tier.id, name: tier.name, status: tier.status }, tier.id, "loyalty");
    res.json(tier);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
settingsRouter.get("/loyalty/reward-rules", requireAuth, async (req: any, res) => {
  try { res.json(await listLoyaltyRewardRules(req.params.tenantId)); } catch (err: any) { res.status(500).json({ error: err.message }); }
});
settingsRouter.post("/loyalty/reward-rules", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "loyalty.rule_create", "Manager access is required to create loyalty reward rules.");
    const rule = await createLoyaltyRewardRule(req.params.tenantId, req.body || {});
    await auditRouteEvent(req, "loyalty.reward_rule_created", "loyalty_reward_rule", { ruleId: rule.id, name: rule.name, ruleType: rule.ruleType }, rule.id, "loyalty");
    res.status(201).json(rule);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
settingsRouter.put("/loyalty/reward-rules/:ruleId", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "loyalty.rule_update", "Manager access is required to update loyalty reward rules.");
    const rule = await updateLoyaltyRewardRule(req.params.tenantId, req.params.ruleId, req.body || {});
    await auditRouteEvent(req, "loyalty.reward_rule_updated", "loyalty_reward_rule", { ruleId: rule.id, name: rule.name, status: rule.status }, rule.id, "loyalty");
    res.json(rule);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
settingsRouter.post("/loyalty/preview", requireAuth, async (req: any, res) => {
  try { res.json(await calculateLoyaltyAward(null, req.params.tenantId, req.body || {})); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});

// ── Push notifications ─────────────────────────────────────────────────────

settingsRouter.get("/push/status", requireAuth, async (req: any, res) => {
  try { res.json(await getPushOverview(req.params.tenantId)); } catch (err: any) { res.status(500).json({ error: err.message }); }
});
settingsRouter.post("/push/vapid/generate", requireAuth, async (req: any, res) => {
  try {
    if (!canGenerateVapidKeys(req.user?.role)) return denyWithAudit(req, res, "push.vapid_generate", "Only Dev users can generate VAPID keys");
    const result = await generateTenantVapidKeys(req.params.tenantId, req.body?.subject);
    await auditRouteEvent(req, "settings.push_vapid_generated", "settings", { subject: req.body?.subject || null }, req.params.tenantId, "push");
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
settingsRouter.post("/push/subscriptions", requireAuth, async (req: any, res) => {
  try {
    const overview = await savePushSubscription(req.params.tenantId, req.user?.staffId || req.user?.uid || null, req.body?.subscription || req.body, { deviceLabel: req.body?.deviceLabel, userAgent: req.get("user-agent") || "" });
    res.json(overview);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
settingsRouter.delete("/push/subscriptions", requireAuth, async (req: any, res) => {
  try {
    const endpoint = String(req.body?.endpoint || req.query.endpoint || "").trim();
    if (!endpoint) return res.status(400).json({ error: "Push subscription endpoint is required" });
    res.json(await removePushSubscription(req.params.tenantId, endpoint));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
settingsRouter.post("/push/test", requireAuth, async (req: any, res) => {
  try {
    if (!canManagePush(req.user?.role)) return denyWithAudit(req, res, "push.test_send", "Only managers, admins, and devs can send test push notifications");
    const staffIds = req.user?.staffId ? [String(req.user.staffId)] : undefined;
    const result = await sendPushNotification(req.params.tenantId, { title: "MasePOS push test", body: "Browser push is ready for workstation orders, ready messages, and staff alerts.", url: "/messages", tag: `dev-push-test-${Date.now()}`, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", requireInteraction: true, vibrate: [120, 60, 120], data: { type: "dev_push_test" }, actions: [{ action: "open-messages", title: "Open messages" }] }, { staffIds, urgency: "high", ttl: 60 });
    await auditRouteEvent(req, "settings.push_test_sent", "settings", { success: true, recipientStaffIds: staffIds || [] }, req.params.tenantId, "push");
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── AI ─────────────────────────────────────────────────────────────────────

settingsRouter.get("/ai/settings", requireAuth, requireAiRoleAccess, async (req: any, res) => {
  try { res.json(serializeAiSettings(await getAiSettings(req.params.tenantId))); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});
settingsRouter.put("/ai/settings", requireAuth, async (req: any, res) => {
  try {
    if (!canManageAi(req.user?.role)) return denyWithAudit(req, res, "ai.settings_update", "Only managers, admins, and devs can manage AI settings");
    const settings = await saveAiSettings(req.params.tenantId, req.body || {});
    await auditRouteEvent(req, "ai.settings_updated", "settings", { provider: settings.provider, model: settings.model, enabled: settings.enabled, changedFields: auditChangedFields(req.body || {}), apiKeySubmitted: req.body?.apiKey !== undefined }, req.params.tenantId, "ai");
    res.json(serializeAiSettings(settings));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
settingsRouter.post("/ai/models", requireAuth, async (req: any, res) => {
  try {
    if (!canManageAi(req.user?.role)) return denyWithAudit(req, res, "ai.models_list", "Only managers, admins, and devs can manage AI settings");
    const models = await listAiModels(req.params.tenantId, req.body || {});
    await auditRouteEvent(req, "ai.models_listed", "settings", { provider: req.body?.provider || null, modelCount: models.length }, req.params.tenantId, "ai");
    res.json({ models });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
settingsRouter.post("/ai/test", requireAuth, sensitiveRouteRateLimit, async (req: any, res) => {
  try {
    if (!canManageAi(req.user?.role)) return denyWithAudit(req, res, "ai.provider_test", "Only managers, admins, and devs can test AI provider credentials");
    const result = await testAiProviderContact(req.params.tenantId, req.body || {});
    await auditRouteEvent(req, "ai.provider_tested", "settings", { provider: result.provider, model: result.model }, req.params.tenantId, "ai");
    res.json(result);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
settingsRouter.get("/ai/insights", requireAuth, requireAiRoleAccess, async (req: any, res) => {
  try { res.json(await listInsights(req.params.tenantId)); } catch (err: any) { res.status(500).json({ error: err.message }); }
});
settingsRouter.delete("/ai/insights/:insightId", requireAuth, requireAiRoleAccess, async (req: any, res) => {
  try { res.json(await deleteInsight(req.params.tenantId, req.params.insightId)); } catch (err: any) { res.status(500).json({ error: err.message }); }
});
settingsRouter.post("/ai/insights/generate", requireAuth, requireAiRoleAccess, async (req: any, res) => {
  try { res.json(await generateInsights(req.params.tenantId, req.user?.staffId || null)); } catch (err: any) { res.status(500).json({ error: err.message }); }
});
settingsRouter.get("/ai/staff-scores", requireAuth, requireAiStaffScoreAccess, async (req: any, res) => {
  try { res.json(await listStaffScores(req.params.tenantId)); } catch (err: any) { res.status(500).json({ error: err.message }); }
});
settingsRouter.post("/ai/staff-scores/generate", requireAuth, requireAiStaffScoreAccess, async (req: any, res) => {
  try { res.json(await generateStaffScores(req.params.tenantId, req.user?.staffId || null)); } catch (err: any) { res.status(500).json({ error: err.message }); }
});
settingsRouter.post("/ai/agent/inventory/proposal", requireAuth, requireAiRoleAccess, async (req: any, res) => {
  try { res.json(await generateInventoryAgentProposal(req.params.tenantId, req.body || {}, { actor: auditActorFromRequest(req) })); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});
settingsRouter.post("/ai/agent/inventory/apply", requireAuth, requireAiRoleAccess, async (req: any, res) => {
  try {
    const fullAutopilot = Boolean(req.body?.fullAutopilot);
    if (fullAutopilot && normalizeRole(req.user?.role) !== "dev") return denyWithAudit(req, res, "ai.inventory_full_autopilot", "Full autopilot is restricted to Dev users", { stepCount: Array.isArray(req.body?.steps) ? req.body.steps.length : 0 });
    const runId = req.body?.runId || req.body?.proposalId || null;
    const result = await applyApprovedInventoryAgentSteps(req.params.tenantId, req.body?.steps || [], { fullAutopilot, runId, actor: auditActorFromRequest(req) });
    await auditRouteEvent(req, "ai.inventory_steps_applied", "ai_agent_run", { runId, fullAutopilot, requestedStepCount: Array.isArray(req.body?.steps) ? req.body.steps.length : 0, appliedCount: result.applied.length, skippedCount: result.skipped.length }, runId, "ai");
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── Laybys ─────────────────────────────────────────────────────────────────

settingsRouter.get("/laybys", requireAuth, async (req: any, res) => {
  try { res.json(await listLaybyOrders(req.params.tenantId, req.query || {})); } catch (err: any) { res.status(500).json({ error: err.message }); }
});
settingsRouter.post("/laybys", requireAuth, async (req: any, res) => {
  try { res.json(await createLaybyOrder(req.params.tenantId, { ...req.body, staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null })); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});
settingsRouter.get("/laybys/:laybyId", requireAuth, async (req: any, res) => {
  try {
    const order = await getLaybyOrderById(req.params.tenantId, req.params.laybyId);
    if (!order) return res.status(404).json({ error: "Lay-by not found" });
    res.json(order);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
settingsRouter.post("/laybys/:laybyId/payments", requireAuth, async (req: any, res) => {
  try { res.json(await addLaybyPayment(req.params.tenantId, req.params.laybyId, { ...req.body, staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null })); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});
settingsRouter.post("/laybys/:laybyId/complete", requireAuth, async (req: any, res) => {
  try {
    const order = await completeLaybyOrder(req.params.tenantId, req.params.laybyId, { ...req.body, staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null, payment: req.body?.payment ? { ...req.body.payment, staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null } : undefined });
    const io = req.app.get("io");
    if (io && order.completedSaleId) broadcastSalesUpdate(io, req.params.tenantId, order.completedSaleId);
    res.json(order);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
settingsRouter.post("/laybys/:laybyId/cancel", requireAuth, async (req: any, res) => {
  try { res.json(await cancelLaybyOrder(req.params.tenantId, req.params.laybyId, { ...req.body, staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null })); }
  catch (err: any) { res.status(400).json({ error: err.message }); }
});

// ── Event bookings ─────────────────────────────────────────────────────────

settingsRouter.get("/event-bookings", requireAuth, async (req: any, res) => {
  try {
    if (!canManageBookings(req.user?.role)) return denyWithAudit(req, res, "event_bookings.view", "Manager access is required for event bookings.");
    res.json(await listEventBookings(req.params.tenantId, { from: typeof req.query.from === "string" ? req.query.from : undefined, to: typeof req.query.to === "string" ? req.query.to : undefined, status: typeof req.query.status === "string" ? req.query.status : undefined, eventType: typeof req.query.eventType === "string" ? req.query.eventType : undefined, reminderStatus: typeof req.query.reminderStatus === "string" ? req.query.reminderStatus : undefined }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
settingsRouter.post("/event-bookings", requireAuth, async (req: any, res) => {
  try {
    if (!canManageBookings(req.user?.role)) return denyWithAudit(req, res, "event_bookings.create", "Manager access is required to create event bookings.");
    res.json(await createEventBooking(req.params.tenantId, { ...req.body, staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
settingsRouter.put("/event-bookings/:id", requireAuth, async (req: any, res) => {
  try {
    if (!canManageBookings(req.user?.role)) return denyWithAudit(req, res, "event_bookings.update", "Manager access is required to update event bookings.", { bookingId: req.params.id });
    res.json(await updateEventBooking(req.params.tenantId, req.params.id, { ...req.body, staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
settingsRouter.delete("/event-bookings/:id", requireAuth, async (req: any, res) => {
  try {
    if (!canManageBookings(req.user?.role)) return denyWithAudit(req, res, "event_bookings.delete", "Manager access is required to delete event bookings.", { bookingId: req.params.id });
    res.json(await deleteEventBooking(req.params.tenantId, req.params.id, { staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
