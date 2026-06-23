import { query } from "./db.js";
import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { recordAuditEventSafe } from "./audit.js";
import { summarizeWorkstationTiming } from "../shared/workstationTiming.js";

export type AiRole = "admin" | "manager" | "dev" | "cashier" | "chef";
export type AiProviderName = "openai" | "ollama" | "anythingllm" | "google" | "vertex" | "openrouter";
export type AiInsightCategory = "sales" | "stock" | "cash" | "staff" | "restaurant" | "customer" | "package" | "integration";
export type AiSeverity = "info" | "success" | "warning" | "critical";

export interface AiSettings {
  tenantId: string;
  enabled: boolean;
  provider: AiProviderName;
  model: string;
  apiKey?: string | null;
  baseUrl?: string | null;
  workspaceSlug?: string | null;
  insightsEnabled: boolean;
  staffScoringEnabled: boolean;
  visibleRoles: AiRole[];
  staffScoreVisibleRoles: AiRole[];
  updatedAt?: string;
}

export interface AiModelOption {
  id: string;
  name: string;
  provider: AiProviderName;
  ownedBy?: string;
}

export interface AiFileInput {
  name?: string;
  type?: string;
  dataUrl: string;
}

export interface AiInvoiceExtractionInput {
  notes?: string;
  images?: string[];
  documents?: AiFileInput[];
  context?: Record<string, any>;
}

export interface AiInsight {
  id: string;
  tenantId: string;
  category: AiInsightCategory;
  severity: AiSeverity;
  title: string;
  summary: string;
  recommendation: string;
  evidence: string[];
  confidence: number;
  status: "open" | "dismissed" | "done";
  source: "deterministic" | "openai";
  createdAt?: string;
}

export interface StaffScore {
  id: string;
  tenantId: string;
  staffId: string;
  staffName: string;
  periodStart: string;
  periodEnd: string;
  score: number;
  grade: string;
  componentScores: Record<string, number>;
  strengths: string[];
  coachingNotes: string[];
  badges: string[];
  riskFlags: string[];
  source: "deterministic" | "openai";
  createdAt?: string;
}

const DEFAULT_SETTINGS: Omit<AiSettings, "tenantId"> = {
  enabled: true,
  provider: "openai",
  model: process.env.OPENAI_MODEL || "gpt-5-mini",
  apiKey: null,
  baseUrl: null,
  workspaceSlug: null,
  insightsEnabled: true,
  staffScoringEnabled: true,
  visibleRoles: ["admin", "manager", "dev"],
  staffScoreVisibleRoles: ["admin", "manager", "dev"],
};

const AI_PROVIDERS: AiProviderName[] = ["openai", "ollama", "anythingllm", "google", "vertex", "openrouter"];
const MAX_MANAGER_INSIGHTS = 18;
const ACTIVE_MANAGER_TASK_STATUSES = new Set(["open", "in_review"]);

function asBool(value: unknown, fallback = false) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true";
  return fallback;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function compactProviderBody(body: any) {
  try {
    return JSON.stringify(body).slice(0, 800);
  } catch {
    return "";
  }
}

function providerErrorMessage(body: any, fallback: string, status?: number) {
  const error = body?.error;
  const candidates = [
    error?.message,
    error?.metadata?.raw,
    error?.metadata?.provider_name ? `${error.metadata.provider_name}: ${error.metadata.raw || error.message || ""}` : "",
    body?.message,
    body?.detail,
    body?.error_description,
    typeof error === "string" ? error : "",
  ].filter(Boolean).map(String);
  const message = candidates.find((item) => item.trim()) || fallback;
  const code = error?.code || body?.code;
  const lowerMessage = message.toLowerCase();
  const isGeneric = lowerMessage === "provider returned error" || lowerMessage === "provider returned error.";
  const friendly429 = status === 429 || code === 429
    ? "The provider is rate limiting or quota/credits are exhausted. Try a cheaper model, wait a minute, or check provider billing/limits."
    : "";
  const raw = isGeneric ? compactProviderBody(body) : "";
  return [
    friendly429,
    code ? `${message} (${code})` : message,
    raw ? `Raw provider response: ${raw}` : "",
  ].filter(Boolean).join(" ");
}

function isVertexBlockedError(message: string) {
  return /aiplatform\.googleapis\.com/i.test(message) && /blocked|permission|denied|forbidden/i.test(message);
}

function vertexBlockedGuidance(message: string) {
  return [
    message,
    "Vertex AI blocked the GenerateContent request. Enable the Vertex AI API for the Google Cloud project, remove API restrictions that block aiplatform.googleapis.com, and make sure the service account has Vertex AI user/prediction permissions.",
    "If this is a Gemini API key rather than a Vertex service account or OAuth token, choose the Google Gemini provider instead of Vertex AI.",
  ].join(" ");
}

function openRouterAuthGuidance(message: string, hasKey: boolean) {
  return [
    message,
    hasKey
      ? "MasePOS had an OpenRouter key for this request, but OpenRouter still rejected the Authorization header. Re-save the key as the raw sk-or-... token only, without the word Bearer, quotes, or extra spaces."
      : "MasePOS did not have an OpenRouter key for this request. Paste an OpenRouter sk-or-... key in AI Settings, then Save or keep it in the API key box while pressing Send test.",
    "Also make sure the selected provider is OpenRouter and the model is the full OpenRouter model id, for example openai/gpt-oss-120b rather than a short alias like oss120b.",
  ].join(" ");
}

function normalizeOpenRouterModel(model: string | undefined | null) {
  const raw = String(model || process.env.OPENROUTER_MODEL || "openai/gpt-5-mini").trim();
  const cleaned = raw.replace(/^openrouter[:\s/]+/i, "").trim();
  const aliases: Record<string, string> = {
    oss120b: "openai/gpt-oss-120b",
    "gpt-oss-120b": "openai/gpt-oss-120b",
    oss20b: "openai/gpt-oss-20b",
    "gpt-oss-20b": "openai/gpt-oss-20b",
  };
  return aliases[cleaned.toLowerCase()] || cleaned;
}

function normalizeProviderApiKey(value: string) {
  const trimmed = String(value || "").trim().replace(/^["']|["']$/g, "");
  if (/^Bearer\s+/i.test(trimmed)) return trimmed.replace(/^Bearer\s+/i, "").trim();
  return trimmed;
}

function parseProviderKeyStore(raw: unknown, legacyProvider?: AiProviderName): Partial<Record<AiProviderName, string>> {
  const text = String(raw || "").trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return AI_PROVIDERS.reduce<Partial<Record<AiProviderName, string>>>((acc, provider) => {
        const value = normalizeProviderApiKey(String((parsed as any)[provider] || ""));
        if (value) acc[provider] = value;
        return acc;
      }, {});
    }
  } catch {
    // Legacy single-key storage falls through.
  }
  const legacyKey = normalizeProviderApiKey(text);
  return legacyProvider && legacyKey ? { [legacyProvider]: legacyKey } : {};
}

function serializeProviderKeyStore(keys: Partial<Record<AiProviderName, string>>) {
  const cleaned = AI_PROVIDERS.reduce<Partial<Record<AiProviderName, string>>>((acc, provider) => {
    const value = normalizeProviderApiKey(keys[provider] || "");
    if (value) acc[provider] = value;
    return acc;
  }, {});
  return Object.keys(cleaned).length ? JSON.stringify(cleaned) : null;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function gradeForScore(score: number) {
  if (score >= 95) return "A+";
  if (score >= 85) return "A";
  if (score >= 72) return "B";
  if (score >= 60) return "C";
  return "Needs Attention";
}

function nowIso() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function canManageAi(role: unknown) {
  return ["admin", "manager", "dev"].includes(String(role || "").toLowerCase());
}

export function getAiProviderStatus(settings?: Partial<AiSettings>) {
  return {
    openai: Boolean(getProviderApiKey({ ...settings, provider: "openai" })),
    ollama: Boolean((settings?.baseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434").trim()),
    anythingllm: Boolean(getProviderApiKey({ ...settings, provider: "anythingllm" }) && (settings?.workspaceSlug || process.env.ANYTHINGLLM_WORKSPACE_SLUG)),
    google: Boolean(getProviderApiKey({ ...settings, provider: "google" })),
    vertex: Boolean(
      getProviderApiKey({ ...settings, provider: "vertex" }) &&
      (settings?.workspaceSlug || process.env.GOOGLE_VERTEX_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT) &&
      (settings?.baseUrl || process.env.GOOGLE_VERTEX_LOCATION || process.env.GOOGLE_CLOUD_LOCATION)
    ),
    openrouter: Boolean(getProviderApiKey({ ...settings, provider: "openrouter" })),
  };
}

export function serializeAiSettings(settings: AiSettings) {
  return {
    ...settings,
    apiKey: undefined,
    apiKeyConfigured: Boolean(getProviderApiKey(settings)),
    openAiConfigured: Boolean(settings.provider === "openai" ? getProviderApiKey(settings) : process.env.OPENAI_API_KEY),
    providerStatus: getAiProviderStatus(settings),
  };
}

function hasRoleAccess(role: unknown, roles: string[]) {
  const r = String(role || "").toLowerCase();
  return roles.includes(r) || r === "dev";
}

function auditAiPermissionDenied(req: Request, attemptedAction: string, reason: string) {
  const tenantId = req.params?.tenantId || req.user?.tenantId || null;
  if (!tenantId) return;
  void recordAuditEventSafe({
    tenantId,
    action: "permission.denied",
    entityType: "security",
    entityId: req.user?.staffId || req.user?.uid || null,
    staffId: req.user?.staffId || req.user?.uid || null,
    staffName: req.user?.name || null,
    source: "permission",
    details: {
      attemptedAction,
      reason,
      role: req.user?.role || null,
      method: req.method,
      route: req.originalUrl || req.url,
      ip: req.ip || req.socket?.remoteAddress || null,
      userAgent: req.get?.("user-agent") || null,
    },
  });
}

export async function requireAiRoleAccess(req: Request, res: Response, next: NextFunction) {
  const settings = await getAiSettings(req.params.tenantId);
  if (!settings.enabled) {
    auditAiPermissionDenied(req, "ai.access", "ai_disabled");
    return res.status(403).json({ error: "AI is disabled for this tenant" });
  }
  if (!hasRoleAccess(req.user?.role, settings.visibleRoles)) {
    auditAiPermissionDenied(req, "ai.access", "role_not_allowed");
    return res.status(403).json({ error: "Your role cannot access AI Copilot" });
  }
  next();
}

export async function requireAiStaffScoreAccess(req: Request, res: Response, next: NextFunction) {
  const settings = await getAiSettings(req.params.tenantId);
  if (!settings.enabled || !settings.staffScoringEnabled) {
    auditAiPermissionDenied(req, "ai.staff_scores", !settings.enabled ? "ai_disabled" : "staff_scoring_disabled");
    return res.status(403).json({ error: "AI staff scoring is disabled for this tenant" });
  }
  if (!hasRoleAccess(req.user?.role, settings.staffScoreVisibleRoles)) {
    auditAiPermissionDenied(req, "ai.staff_scores", "role_not_allowed");
    return res.status(403).json({ error: "Your role cannot access AI staff scores" });
  }
  next();
}

export async function getAiSettings(tenantId: string): Promise<AiSettings> {
  const rows = await query<any>("SELECT * FROM ai_settings WHERE tenant_id = ? LIMIT 1", [tenantId]);
  const row = rows[0];
  if (!row) return { tenantId, ...DEFAULT_SETTINGS };
  return {
    tenantId,
    enabled: asBool(row.enabled, DEFAULT_SETTINGS.enabled),
    provider: (row.provider || DEFAULT_SETTINGS.provider) as AiProviderName,
    model: row.model || DEFAULT_SETTINGS.model,
    apiKey: row.api_key || null,
    baseUrl: row.base_url || null,
    workspaceSlug: row.workspace_slug || null,
    insightsEnabled: asBool(row.insights_enabled, DEFAULT_SETTINGS.insightsEnabled),
    staffScoringEnabled: asBool(row.staff_scoring_enabled, DEFAULT_SETTINGS.staffScoringEnabled),
    visibleRoles: parseJson(row.visible_roles, DEFAULT_SETTINGS.visibleRoles),
    staffScoreVisibleRoles: parseJson(row.staff_score_visible_roles, DEFAULT_SETTINGS.staffScoreVisibleRoles),
    updatedAt: row.updated_at,
  };
}

export async function saveAiSettings(tenantId: string, input: Partial<AiSettings>): Promise<AiSettings> {
  const current = await getAiSettings(tenantId);
  const provider = input.provider || current.provider;
  const providerKeys = parseProviderKeyStore(current.apiKey, current.provider);
  if (input.apiKey !== undefined && input.apiKey !== null && input.apiKey.trim()) {
    providerKeys[provider] = normalizeProviderApiKey(input.apiKey.trim());
  }
  const next: AiSettings = {
    ...current,
    enabled: input.enabled ?? current.enabled,
    provider,
    model: input.model || current.model,
    apiKey: serializeProviderKeyStore(providerKeys),
    baseUrl: input.baseUrl !== undefined ? input.baseUrl : current.baseUrl,
    workspaceSlug: input.workspaceSlug !== undefined ? input.workspaceSlug : current.workspaceSlug,
    insightsEnabled: input.insightsEnabled ?? current.insightsEnabled,
    staffScoringEnabled: input.staffScoringEnabled ?? current.staffScoringEnabled,
    visibleRoles: sanitizeRoles(input.visibleRoles || current.visibleRoles),
    staffScoreVisibleRoles: sanitizeRoles(input.staffScoreVisibleRoles || current.staffScoreVisibleRoles),
  };
  await query(
    `INSERT INTO ai_settings (
        tenant_id, enabled, provider, model, api_key, base_url, workspace_slug, insights_enabled, staff_scoring_enabled,
        visible_roles, staff_score_visible_roles, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      ON CONFLICT (tenant_id) DO UPDATE SET
        enabled = EXCLUDED.enabled,
        provider = EXCLUDED.provider,
        model = EXCLUDED.model,
        api_key = COALESCE(EXCLUDED.api_key, ai_settings.api_key),
        base_url = EXCLUDED.base_url,
        workspace_slug = EXCLUDED.workspace_slug,
        insights_enabled = EXCLUDED.insights_enabled,
        staff_scoring_enabled = EXCLUDED.staff_scoring_enabled,
        visible_roles = EXCLUDED.visible_roles,
        staff_score_visible_roles = EXCLUDED.staff_score_visible_roles,
        updated_at = NOW()`,
    [
      tenantId,
      next.enabled ? 1 : 0,
      next.provider,
      next.model,
      next.apiKey?.trim() || null,
      next.baseUrl || null,
      next.workspaceSlug || null,
      next.insightsEnabled ? 1 : 0,
      next.staffScoringEnabled ? 1 : 0,
      JSON.stringify(next.visibleRoles),
      JSON.stringify(next.staffScoreVisibleRoles),
    ]
  );
  return getAiSettings(tenantId);
}

function getProviderApiKey(settings: Partial<AiSettings>) {
  const configured = settings.apiKey?.trim();
  if (configured) {
    const providerKeys = parseProviderKeyStore(configured);
    const scopedKey = settings.provider ? providerKeys[settings.provider] : "";
    if (scopedKey) return scopedKey;
    if (!configured.startsWith("{")) return normalizeProviderApiKey(configured);
  }
  if (settings.provider === "openai") return process.env.OPENAI_API_KEY || "";
  if (settings.provider === "anythingllm") return process.env.ANYTHINGLLM_API_KEY || "";
  if (settings.provider === "google") return process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || "";
  if (settings.provider === "vertex") return process.env.GOOGLE_VERTEX_API_KEY || "";
  if (settings.provider === "openrouter") return normalizeProviderApiKey(process.env.OPENROUTER_API_KEY || "");
  return "";
}

function getVertexConfig(settings: Partial<AiSettings>) {
  const configured = getProviderApiKey({ ...settings, provider: "vertex" });
  const bearer = configured.startsWith("Bearer ") ? configured.slice("Bearer ".length).trim() : configured;
  return {
    key: configured,
    accessToken: bearer.startsWith("ya29.") || bearer.startsWith("ya29_") ? bearer : (process.env.GOOGLE_VERTEX_ACCESS_TOKEN || ""),
    serviceAccountJson: configured.trim().startsWith("{") ? configured : (process.env.GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON || ""),
    projectId: settings.workspaceSlug || process.env.GOOGLE_VERTEX_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "",
    location: settings.baseUrl || process.env.GOOGLE_VERTEX_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
  };
}

function uniqueModels(models: AiModelOption[]) {
  const seen = new Set<string>();
  return models
    .filter((model) => {
      if (!model.id || seen.has(model.id)) return false;
      seen.add(model.id);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listAiModels(tenantId: string, input: Partial<AiSettings> = {}): Promise<AiModelOption[]> {
  const settings = { ...(await getAiSettings(tenantId)), ...input };
  if (settings.provider === "openai") return listOpenAiModels(settings);
  if (settings.provider === "ollama") return listOllamaModels(settings);
  if (settings.provider === "anythingllm") return listAnythingLlmModels(settings);
  if (settings.provider === "google") return listGoogleModels(settings);
  if (settings.provider === "vertex") return listVertexModels(settings);
  if (settings.provider === "openrouter") return listOpenRouterModels(settings);
  throw new Error(`Unsupported AI provider: ${settings.provider}`);
}

export async function testAiProviderContact(tenantId: string, input: Partial<AiSettings> & { message?: string; images?: string[]; documents?: AiFileInput[] } = {}) {
  const settings = { ...(await getAiSettings(tenantId)), ...input };
  const message = String(input.message || "").trim() || "Reply with one short sentence confirming the AI provider connection works.";
  const startedAt = Date.now();
  const reply = await callConfiguredProviderText(settings, message, input.images || [], input.documents || []);
  return {
    provider: settings.provider,
    model: settings.model,
    reply: String(reply || "").trim(),
    latencyMs: Date.now() - startedAt,
  };
}

function sanitizeRoles(roles: string[]) {
  const allowed = new Set(["admin", "manager", "dev", "cashier", "chef"]);
  const cleaned = roles.map(String).filter((role) => allowed.has(role));
  return cleaned.length > 0 ? [...new Set(cleaned)] as AiRole[] : DEFAULT_SETTINGS.visibleRoles;
}

async function insertAudit(tenantId: string, action: string, requestedBy: string | null, status: string, details: any) {
  await query(
    `INSERT INTO ai_audit_log (id, tenant_id, action, requested_by, provider, status, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [id("aiaudit"), tenantId, action, requestedBy, "openai", status, JSON.stringify(details || {})]
  );
}

function rowsOf(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function rowValue(row: any, ...keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function sumRows(rows: any[], getter: (row: any) => unknown) {
  return rows.reduce((sum, row) => sum + toNumber(getter(row)), 0);
}

function countRows(rows: any[], predicate: (row: any) => boolean) {
  return rows.reduce((count, row) => count + (predicate(row) ? 1 : 0), 0);
}

function countByKey(rows: any[], getter: (row: any) => unknown, fallback = "unspecified") {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const raw = getter(row);
    const key = String(raw === undefined || raw === null || raw === "" ? fallback : raw).trim() || fallback;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function dateTime(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isPastDue(value: unknown, now = new Date()) {
  const date = dateTime(value);
  return Boolean(date && date.getTime() < now.getTime());
}

function isDueSoon(value: unknown, days = 7, now = new Date()) {
  const date = dateTime(value);
  if (!date) return false;
  const soon = now.getTime() + days * 24 * 60 * 60 * 1000;
  return date.getTime() >= now.getTime() && date.getTime() <= soon;
}

function percent(value: number) {
  return `${Math.round(value)}%`;
}

function productIdOf(row: any) {
  return String(rowValue(row, "product_id", "productId") || "");
}

function saleIdOf(row: any) {
  return String(rowValue(row, "sale_id", "saleId") || "");
}

function directionAmount(row: any) {
  const amount = toNumber(rowValue(row, "amount"));
  const direction = String(rowValue(row, "direction") || "").toLowerCase();
  if (direction === "in") return amount;
  if (direction === "out") return -amount;
  return 0;
}

function activeTasks(rows: any[]) {
  return rows.filter((task) => ACTIVE_MANAGER_TASK_STATUSES.has(String(rowValue(task, "status") || "").toLowerCase()));
}

function buildBusinessMetrics(dataset: any) {
  const products = rowsOf(dataset.products);
  const staff = rowsOf(dataset.staff);
  const sales = rowsOf(dataset.sales);
  const saleItems = rowsOf(dataset.saleItems);
  const salePayments = rowsOf(dataset.salePayments);
  const cashSessions = rowsOf(dataset.cashSessions);
  const cashMovements = rowsOf(dataset.cashMovements);
  const managerCashMovements = rowsOf(dataset.managerCashMovements);
  const cashCloseCheckpoints = rowsOf(dataset.cashCloseCheckpoints);
  const cashCustodyTransfers = rowsOf(dataset.cashCustodyTransfers);
  const customers = rowsOf(dataset.customers);
  const customerPayoutRequests = rowsOf(dataset.customerPayoutRequests);
  const staffPayoutRequests = rowsOf(dataset.staffPayoutRequests);
  const auditEvents = rowsOf(dataset.auditEvents);
  const stockMovements = rowsOf(dataset.stockMovements);
  const managerTaskRows = rowsOf(dataset.managerTasks);
  const stockTakeSessions = rowsOf(dataset.stockTakeSessions);
  const stockTakeItems = rowsOf(dataset.stockTakeItems);
  const stockTakeRules = rowsOf(dataset.stockTakeRules);
  const laybyOrders = rowsOf(dataset.laybyOrders);
  const laybyItems = rowsOf(dataset.laybyItems);
  const purchaseOrders = rowsOf(dataset.purchaseOrders);
  const companionDevices = rowsOf(dataset.companionDevices);
  const pushSubscriptions = rowsOf(dataset.pushSubscriptions);
  const promotions = rowsOf(dataset.promotions);
  const integrationApiKeys = rowsOf(dataset.integrationApiKeys);
  const integrationWebhookEvents = rowsOf(dataset.integrationWebhookEvents);

  const now = new Date();
  const completedSales = sales.filter((sale) => rowValue(sale, "status") === "completed");
  const completedSaleIds = new Set(completedSales.map((sale) => String(rowValue(sale, "id") || "")).filter(Boolean));
  const revenue = sumRows(completedSales, (sale) => rowValue(sale, "total"));
  const refundSales = sales.filter((sale) => (
    String(rowValue(sale, "refund_status", "refundStatus") || "none") !== "none" ||
    toNumber(rowValue(sale, "refunded_amount", "refundedAmount")) > 0
  ));
  const voidedSales = sales.filter((sale) => Boolean(rowValue(sale, "void_reason", "voidReason", "voided_by", "voidedBy")));
  const offlineSales = sales.filter((sale) => (
    Boolean(rowValue(sale, "offline_event_id", "offlineEventId")) ||
    String(rowValue(sale, "sync_source", "syncSource") || "online") !== "online"
  ));
  const tabSales = sales.filter((sale) => Number(rowValue(sale, "is_tab", "isTab") || 0) === 1 || Boolean(rowValue(sale, "tab_name", "tabName")));
  const tableSales = sales.filter((sale) => Boolean(rowValue(sale, "table_number", "tableNumber")));
  const openOrders = sales.filter((sale) => ["open", "kitchen", "pending"].includes(String(rowValue(sale, "status") || "")));
  const splitPaymentSaleIds = new Set<string>();
  const paymentCountBySale = salePayments.reduce<Record<string, number>>((acc, payment) => {
    const saleId = String(rowValue(payment, "sale_id", "saleId") || "");
    if (!saleId) return acc;
    acc[saleId] = (acc[saleId] || 0) + 1;
    if (acc[saleId] > 1) splitPaymentSaleIds.add(saleId);
    return acc;
  }, {});
  void paymentCountBySale;

  const lowStock = products.filter((product) => toNumber(rowValue(product, "stock")) <= Math.max(1, toNumber(rowValue(product, "min_stock", "minStock"))));
  const productById = new Map(products.map((product) => [String(rowValue(product, "id") || ""), product]));
  const soldItems = saleItems.filter((item) => completedSaleIds.size === 0 || completedSaleIds.has(saleIdOf(item)));
  const productPerformance = soldItems.reduce<Record<string, any>>((acc, item) => {
    const productId = productIdOf(item);
    const product = productById.get(productId);
    const name = String(rowValue(item, "product_name", "productName") || rowValue(product, "name") || "Unknown product");
    const category = String(rowValue(item, "category") || rowValue(product, "category") || "Uncategorised");
    const quantity = toNumber(rowValue(item, "quantity"));
    const revenue = toNumber(rowValue(item, "price", "unit_price", "unitPrice")) * quantity;
    const cost = toNumber(rowValue(product, "cost_price", "costPrice")) * quantity;
    const current = acc[productId || name] || { productId, name, category, quantity: 0, revenue: 0, cost: 0 };
    current.quantity += quantity;
    current.revenue += revenue;
    current.cost += cost;
    acc[productId || name] = current;
    return acc;
  }, {});
  const productStats = Object.values(productPerformance).map((item: any) => ({
    ...item,
    grossProfit: item.revenue - item.cost,
    marginPercent: item.revenue > 0 ? ((item.revenue - item.cost) / item.revenue) * 100 : 0,
  }));
  const categoryStats = Object.values(productStats.reduce<Record<string, any>>((acc, item: any) => {
    const key = item.category || "Uncategorised";
    const current = acc[key] || { category: key, quantity: 0, revenue: 0, cost: 0, grossProfit: 0 };
    current.quantity += item.quantity;
    current.revenue += item.revenue;
    current.cost += item.cost;
    current.grossProfit += item.grossProfit;
    acc[key] = current;
    return acc;
  }, {})).map((item: any) => ({
    ...item,
    marginPercent: item.revenue > 0 ? (item.grossProfit / item.revenue) * 100 : 0,
  }));
  const topMarginProducts = [...productStats]
    .filter((item: any) => item.revenue > 0)
    .sort((a: any, b: any) => b.grossProfit - a.grossProfit)
    .slice(0, 3);
  const weakMarginCategories = [...categoryStats]
    .filter((item: any) => item.revenue > 0)
    .sort((a: any, b: any) => a.marginPercent - b.marginPercent)
    .slice(0, 3);
  const topCategory = [...categoryStats].sort((a: any, b: any) => b.revenue - a.revenue)[0] || null;
  const activePromotions = promotions.filter((promotion) => String(rowValue(promotion, "status") || "active") === "active");
  const stockReasonCounts = countByKey(stockMovements, (movement) => rowValue(movement, "reason_code", "reasonCode", "reason"));
  const shrinkageMovements = stockMovements.filter((movement) => ["shrinkage", "wastage"].includes(String(rowValue(movement, "reason_code", "reasonCode") || "")));
  const countCorrectionMovements = stockMovements.filter((movement) => String(rowValue(movement, "reason_code", "reasonCode") || "") === "count_correction");

  const openManagerTasks = activeTasks(managerTaskRows);
  const highPriorityTasks = openManagerTasks.filter((task) => ["high", "critical"].includes(String(rowValue(task, "priority") || "")));
  const openTaskCounts = countByKey(openManagerTasks, (task) => rowValue(task, "task_type", "taskType"));
  const offlineAuditEvents = auditEvents.filter((event) => String(rowValue(event, "action") || "").startsWith("offline."));
  const offlineConflictEvents = offlineAuditEvents.filter((event) => String(rowValue(event, "action") || "").includes("conflict"));
  const deviceIds = new Set<string>();
  const localReceiptNumbers = new Set<string>();
  for (const event of auditEvents) {
    const details = parseJson<Record<string, any>>(rowValue(event, "details"), {});
    const deviceId = rowValue(details, "deviceId", "device_id", "registerDeviceId", "register_device_id");
    const localReceiptNumber = rowValue(details, "localReceiptNumber", "local_receipt_number");
    if (deviceId) deviceIds.add(String(deviceId));
    if (localReceiptNumber) localReceiptNumbers.add(String(localReceiptNumber));
  }

  const cashVariance = cashSessions
    .filter((session) => {
      const status = String(rowValue(session, "status") || "");
      const reviewStatus = String(rowValue(session, "review_status", "reviewStatus") || "");
      return status === "closed" || ["submitted", "disputed", "reconciled"].includes(reviewStatus);
    })
    .reduce((sum, session) => sum + Math.abs(toNumber(rowValue(session, "difference"))), 0);
  const latestCashCheckpoint = cashCloseCheckpoints[0] || null;
  const latestCashCheckpointVariance = latestCashCheckpoint ? Math.abs(toNumber(rowValue(latestCashCheckpoint, "variance"))) : 0;
  const managerCashNet = sumRows(managerCashMovements, directionAmount);
  const pettyCashTotal = sumRows(
    managerCashMovements.filter((movement) => rowValue(movement, "movement_type", "movementType") === "petty_cash"),
    (movement) => rowValue(movement, "amount")
  );
  const payoutCashTotal = sumRows(
    managerCashMovements.filter((movement) => rowValue(movement, "movement_type", "movementType") === "payout"),
    (movement) => rowValue(movement, "amount")
  );
  const pendingCashCustodyTransfers = cashCustodyTransfers.filter((transfer) => rowValue(transfer, "status") === "pending_confirmation");
  const custodyVariance = sumRows(cashCustodyTransfers, (transfer) => Math.abs(toNumber(rowValue(transfer, "variance"))));

  const stockTakeVarianceItems = stockTakeItems.filter((item) => Math.abs(toNumber(rowValue(item, "variance_quantity", "varianceQuantity"))) > 0);
  const stockTakeVarianceQuantity = sumRows(stockTakeVarianceItems, (item) => Math.abs(toNumber(rowValue(item, "variance_quantity", "varianceQuantity"))));
  const submittedStockTakeSessions = stockTakeSessions.filter((session) => rowValue(session, "status") === "submitted");
  const overdueStockTakeSessions = stockTakeSessions.filter((session) => (
    ["active", "submitted"].includes(String(rowValue(session, "status") || "")) &&
    isPastDue(rowValue(session, "due_at", "dueAt"), now)
  ));

  const activeLaybys = laybyOrders.filter((order) => rowValue(order, "status") === "active");
  const overdueLaybys = activeLaybys.filter((order) => isPastDue(rowValue(order, "due_date", "dueDate"), now));
  const dueSoonLaybys = activeLaybys.filter((order) => isDueSoon(rowValue(order, "due_date", "dueDate"), 7, now));
  const activeLaybyBalance = sumRows(activeLaybys, (order) => rowValue(order, "balance_due", "balanceDue"));
  const reservedLaybyQuantity = sumRows(laybyItems.filter((item) => rowValue(item, "order_status", "orderStatus") === "active"), (item) => rowValue(item, "reserved_quantity", "reservedQuantity"));

  const accountCustomers = customers.filter((customer) => Number(rowValue(customer, "account_enabled", "accountEnabled") || 0) === 1 || toNumber(rowValue(customer, "account_balance", "accountBalance")) > 0);
  const accountOwing = sumRows(accountCustomers, (customer) => rowValue(customer, "account_balance", "accountBalance"));
  const overLimitAccounts = accountCustomers.filter((customer) => {
    const limit = toNumber(rowValue(customer, "account_limit", "accountLimit"));
    return limit > 0 && toNumber(rowValue(customer, "account_balance", "accountBalance")) > limit;
  });
  const walletLiability = sumRows(customers, (customer) => Math.max(0, toNumber(rowValue(customer, "wallet_balance", "walletBalance"))));
  const pendingCustomerPayouts = customerPayoutRequests.filter((request) => ["pending", "approved"].includes(String(rowValue(request, "status") || "")));
  const pendingStaffPayouts = staffPayoutRequests.filter((request) => ["pending", "approved"].includes(String(rowValue(request, "status") || "")));

  const kitchenItems = saleItems.filter((item) => ["pending", "accepted", "ready"].includes(String(rowValue(item, "status") || "")));
  const workstationTimingItems = saleItems.filter((item) => Boolean(rowValue(item, "workstationId", "workstation_id")));
  const liveTiming = summarizeWorkstationTiming(workstationTimingItems, { now, completedWindowSeconds: 2 * 60 * 60 });
  const servicePeriodTiming = summarizeWorkstationTiming(workstationTimingItems, { now, completedWindowSeconds: 12 * 60 * 60 });
  const activePurchaseOrders = purchaseOrders.filter((order) => ["draft", "sent"].includes(String(rowValue(order, "status") || "")));
  const overduePurchaseOrders = activePurchaseOrders.filter((order) => isPastDue(rowValue(order, "expected_delivery_date", "expectedDeliveryDate"), now));
  const activeIntegrationKeys = integrationApiKeys.filter((key) => String(rowValue(key, "status") || "active") === "active");
  const failedIntegrationEvents = integrationWebhookEvents.filter((event) => ["failed", "error", "rejected"].includes(String(rowValue(event, "status") || "").toLowerCase()));
  const integrationProviderCounts = countByKey(integrationWebhookEvents, (event) => rowValue(event, "provider"));
  const payfastPaymentCount = salePayments.filter((payment) => (
    String(rowValue(payment, "method") || "").toLowerCase() === "payfast" ||
    String(rowValue(payment, "provider") || "").toLowerCase() === "payfast"
  )).length + sales.filter((sale) => Boolean(rowValue(sale, "payfast_payment_id", "payfastPaymentId"))).length;

  return {
    sales: {
      completedCount: completedSales.length,
      revenue,
      averageOrder: completedSales.length ? revenue / completedSales.length : 0,
      refundCount: refundSales.length,
      refundedAmount: sumRows(refundSales, (sale) => rowValue(sale, "refunded_amount", "refundedAmount")),
      voidCount: voidedSales.length,
      offlineSaleCount: offlineSales.length,
      splitPaymentSaleCount: splitPaymentSaleIds.size,
      paymentMix: salePayments.length
        ? countByKey(salePayments, (payment) => rowValue(payment, "method"))
        : countByKey(sales, (sale) => rowValue(sale, "payment_method", "paymentMethod")),
      openOrderCount: openOrders.length,
      openTabCount: tabSales.filter((sale) => ["open", "kitchen", "pending"].includes(String(rowValue(sale, "status") || ""))).length,
      tableOrderCount: tableSales.length,
      topCategory: topCategory ? String(topCategory.category) : null,
    },
    performance: {
      categoryStats,
      topMarginProducts,
      weakMarginCategories,
      activePromotionCount: activePromotions.length,
      upsellCandidates: topMarginProducts.map((item: any) => `${item.name}: R${item.grossProfit.toFixed(2)} gross profit (${percent(item.marginPercent)} margin)`),
      menuCandidates: weakMarginCategories.map((item: any) => `${item.category}: ${percent(item.marginPercent)} margin on R${item.revenue.toFixed(2)} revenue`),
    },
    stock: {
      productCount: products.length,
      lowStockCount: lowStock.length,
      lowStockProducts: lowStock.slice(0, 5).map((product) => `${rowValue(product, "name")}: ${toNumber(rowValue(product, "stock"))} left`),
      movementCount: stockMovements.length,
      reasonCounts: stockReasonCounts,
      shrinkageOrWastageCount: shrinkageMovements.length,
      shrinkageOrWastageQuantity: sumRows(shrinkageMovements, (movement) => Math.abs(toNumber(rowValue(movement, "quantity_delta", "quantityDelta")))),
      countCorrectionCount: countCorrectionMovements.length,
      countCorrectionQuantity: sumRows(countCorrectionMovements, (movement) => Math.abs(toNumber(rowValue(movement, "quantity_delta", "quantityDelta")))),
      activePurchaseOrderCount: activePurchaseOrders.length,
      overduePurchaseOrderCount: overduePurchaseOrders.length,
    },
    stocktake: {
      sessionCounts: countByKey(stockTakeSessions, (session) => rowValue(session, "status")),
      activeRuleCount: countRows(stockTakeRules, (rule) => rowValue(rule, "status") === "active"),
      submittedSessionCount: submittedStockTakeSessions.length,
      overdueSessionCount: overdueStockTakeSessions.length,
      varianceItemCount: stockTakeVarianceItems.length,
      absoluteVarianceQuantity: stockTakeVarianceQuantity,
    },
    cash: {
      activeRegisterCount: toNumber(dataset.activeRegisters),
      cashVariance,
      recentCashMovementCount: cashMovements.length,
      managerCashMovementCount: managerCashMovements.length,
      managerCashNet,
      pettyCashTotal,
      payoutCashTotal,
      latestCheckpointStatus: rowValue(latestCashCheckpoint, "status"),
      latestCheckpointVariance: latestCashCheckpointVariance,
      latestCheckpointWalletLiability: toNumber(rowValue(latestCashCheckpoint, "wallet_liability", "walletLiability")),
      latestCheckpointPendingPayouts: toNumber(rowValue(latestCashCheckpoint, "pending_payouts", "pendingPayouts")),
      pendingCashCustodyTransferCount: pendingCashCustodyTransfers.length,
      custodyVariance,
    },
    tasks: {
      openCount: openManagerTasks.length,
      highPriorityCount: highPriorityTasks.length,
      countsByType: openTaskCounts,
      aiRecommendationCount: toNumber(openTaskCounts.ai_recommendation),
      offlineSyncCount: toNumber(openTaskCounts.offline_sync),
      stockVarianceCount: toNumber(openTaskCounts.stock_variance),
    },
    offline: {
      auditEventCount: offlineAuditEvents.length,
      conflictEventCount: offlineConflictEvents.length,
      localReceiptCount: localReceiptNumbers.size,
      deviceCount: deviceIds.size,
      companionDeviceCount: companionDevices.length,
      activePushDeviceCount: pushSubscriptions.filter((sub) => !rowValue(sub, "disabled_at", "disabledAt")).length,
    },
    layby: {
      activeCount: activeLaybys.length,
      overdueCount: overdueLaybys.length,
      dueSoonCount: dueSoonLaybys.length,
      balanceDue: activeLaybyBalance,
      reservedQuantity: reservedLaybyQuantity,
      completedCount: countRows(laybyOrders, (order) => rowValue(order, "status") === "completed"),
      cancelledCount: countRows(laybyOrders, (order) => rowValue(order, "status") === "cancelled"),
    },
    customer: {
      count: customers.length,
      walletCustomerCount: countRows(customers, (customer) => toNumber(rowValue(customer, "wallet_balance", "walletBalance")) > 0),
      walletLiability,
      accountCustomerCount: accountCustomers.length,
      accountOwing,
      overLimitAccountCount: overLimitAccounts.length,
      pendingCustomerPayoutAmount: sumRows(pendingCustomerPayouts, (request) => rowValue(request, "amount")),
      pendingStaffPayoutAmount: sumRows(pendingStaffPayouts, (request) => rowValue(request, "amount")),
    },
    staff: {
      activeCount: countRows(staff, (member) => rowValue(member, "status") === "active"),
      totalCount: staff.length,
    },
    restaurant: {
      enabled: Boolean(dataset.business?.isRestaurantMode),
      openOrderCount: openOrders.length,
      openTabCount: tabSales.filter((sale) => ["open", "kitchen", "pending"].includes(String(rowValue(sale, "status") || ""))).length,
      kitchenItemCount: kitchenItems.length,
      liveTiming,
      servicePeriodTiming,
    },
    audit: {
      recentEventCount: auditEvents.length,
      actionCounts: countByKey(auditEvents, (event) => rowValue(event, "action")),
      sourceCounts: countByKey(auditEvents, (event) => rowValue(event, "source")),
      permissionDeniedCount: countRows(auditEvents, (event) => rowValue(event, "action") === "permission.denied"),
      aiEventCount: countRows(auditEvents, (event) => String(rowValue(event, "action") || "").startsWith("ai.")),
    },
    integration: {
      activeApiKeyCount: activeIntegrationKeys.length,
      webhookEventCount: integrationWebhookEvents.length,
      failedWebhookEventCount: failedIntegrationEvents.length,
      providerCounts: integrationProviderCounts,
      payfastPaymentCount,
      configuredConnectorCount: activeIntegrationKeys.length + Object.keys(integrationProviderCounts).length + (payfastPaymentCount > 0 ? 1 : 0),
    },
  };
}

async function getBusinessDataset(tenantId: string) {
  const [
    products,
    staff,
    sales,
    saleItems,
    salePayments,
    cashSessions,
    cashMovements,
    managerCashMovements,
    cashCloseCheckpoints,
    cashCustodyTransfers,
    customers,
    customerPayoutRequests,
    staffPayoutRequests,
    auditEvents,
    stockMovements,
    managerTasks,
    stockTakeSessions,
    stockTakeItems,
    stockTakeRules,
    laybyOrders,
    laybyItems,
    laybyPayments,
    purchaseOrders,
    vendors,
    companionDevices,
    pushSubscriptions,
    promotions,
    integrationApiKeys,
    integrationWebhookEvents,
    configRows,
    packageRows,
  ] = await Promise.all([
    query<any>("SELECT id, name, category, section, stock, min_stock, price, cost_price, workstation_id FROM products WHERE tenant_id = ?", [tenantId]),
    query<any>("SELECT id, name, role, status, wallet_balance FROM staff WHERE tenant_id = ?", [tenantId]),
    query<any>(
      `SELECT
         id, staff_id, customer_id, total, subtotal, payment_method, status,
         tip_amount, cash_out_amount, points_discount, table_number, is_tab,
         tab_name, transaction_type, parent_sale_id, refund_status,
         refunded_amount, refund_reason, refunded_by, void_reason, voided_by,
         payfast_payment_id, offline_event_id, sync_source, created_at
       FROM sales WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 500`,
      [tenantId]
    ),
    query<any>(
      `SELECT
         si.id, si.sale_id AS saleId, si.product_id AS productId,
         si.product_name AS productName, si.price, si.quantity, si.status,
         si.workstation_id AS workstationId, si.action_staff_id AS actionStaffId,
         si.ordered_at AS orderedAt, si.accepted_at AS acceptedAt,
         si.ready_at AS readyAt, si.delivered_at AS deliveredAt,
         si.created_at AS createdAt
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       WHERE s.tenant_id = ?
       ORDER BY si.created_at DESC
       LIMIT 1000`,
      [tenantId]
    ),
    query<any>(
      `SELECT
         sp.id, sp.sale_id AS saleId, sp.method, sp.amount, sp.tip_amount AS tipAmount,
         sp.cash_out_amount AS cashOutAmount, sp.provider, sp.provider_status AS providerStatus,
         sp.created_at AS createdAt
       FROM sale_payments sp
       JOIN sales s ON s.id = sp.sale_id
       WHERE s.tenant_id = ?
       ORDER BY sp.created_at DESC
       LIMIT 1000`,
      [tenantId]
    ),
    query<any>("SELECT * FROM cash_sessions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 150", [tenantId]),
    query<any>("SELECT * FROM cash_movements WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 300", [tenantId]),
    query<any>("SELECT * FROM manager_cash_movements WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 300", [tenantId]),
    query<any>("SELECT * FROM cash_close_checkpoints WHERE tenant_id = ? ORDER BY business_date DESC LIMIT 30", [tenantId]),
    query<any>("SELECT * FROM cash_custody_transfers WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100", [tenantId]),
    query<any>("SELECT id, name, wallet_balance, account_enabled, account_limit, account_balance, loyalty_points, created_at FROM customers WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 300", [tenantId]),
    query<any>("SELECT id, customer_id, customer_name, amount, status, created_at, processed_at FROM customer_payout_requests WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100", [tenantId]),
    query<any>("SELECT id, staff_id, staff_name, customer_id, customer_name, amount, status, created_at, processed_at FROM payout_requests WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100", [tenantId]),
    query<any>("SELECT id, action, entity_type, entity_id, related_sale_id, staff_id, staff_name, customer_id, source, details, created_at FROM audit_events WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 500", [tenantId]),
    query<any>("SELECT id, item_type, product_id, bulk_item_id, item_name, quantity_delta, previous_quantity, new_quantity, reason, reason_code, reference_type, reference_id, sale_id, staff_id, staff_name, note, created_at FROM stock_movements WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 500", [tenantId]),
    query<any>("SELECT id, task_type, title, summary, priority, status, source_type, source_id, related_sale_id, related_product_id, assigned_to, requested_by, decided_by, details, due_at, created_at, updated_at FROM manager_tasks WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 500", [tenantId]),
    query<any>("SELECT id, name, type, status, assigned_by, assigned_by_name, due_at, submitted_at, approved_at, approved_by, approved_by_name, created_at, updated_at FROM stock_take_sessions WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 150", [tenantId]),
    query<any>("SELECT id, session_id, product_id, product_name, expected_quantity, counted_quantity, variance_quantity, assigned_to, assigned_to_name, counted_by, counted_by_name, status, counted_at, confirmed_at, created_at, updated_at FROM stock_take_items WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 500", [tenantId]),
    query<any>("SELECT id, name, status, schedule_type, run_time, product_scope, product_count, category, assigned_to, assigned_to_name, last_run_for_date, last_run_at, created_at, updated_at FROM stock_take_rules WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 100", [tenantId]),
    query<any>("SELECT id, customer_id, customer_name, staff_id, staff_name, status, total_amount, deposit_amount, amount_paid, balance_due, refund_amount, forfeited_amount, due_date, completed_sale_id, created_at, updated_at FROM layby_orders WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 200", [tenantId]),
    query<any>(
      `SELECT
         li.id, li.layby_order_id AS laybyOrderId, li.product_id AS productId,
         li.product_name AS productName, li.quantity, li.reserved_quantity AS reservedQuantity,
         lo.status AS orderStatus
       FROM layby_items li
       JOIN layby_orders lo ON lo.id = li.layby_order_id
       WHERE lo.tenant_id = ?
       ORDER BY li.created_at DESC
       LIMIT 500`,
      [tenantId]
    ),
    query<any>(
      `SELECT
         lp.id, lp.layby_order_id AS laybyOrderId, lp.method, lp.amount,
         lp.staff_id AS staffId, lp.staff_name AS staffName, lp.cash_session_id AS cashSessionId,
         lp.created_at AS createdAt
       FROM layby_payments lp
       JOIN layby_orders lo ON lo.id = lp.layby_order_id
       WHERE lo.tenant_id = ?
       ORDER BY lp.created_at DESC
       LIMIT 300`,
      [tenantId]
    ),
    query<any>("SELECT id, vendor_id, status, type, total_amount, expected_delivery_date, invoice_status, created_at, updated_at FROM purchase_orders WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 200", [tenantId]),
    query<any>("SELECT id, name, status, created_at, updated_at FROM vendors WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 200", [tenantId]),
    query<any>("SELECT id, device_id, device_name, workstation_id, default_mode, assigned_by, created_at, updated_at FROM companion_device_assignments WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 200", [tenantId]),
    query<any>("SELECT id, staff_id, device_label, disabled_at, last_seen_at, created_at, updated_at FROM push_subscriptions WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 200", [tenantId]),
    query<any>("SELECT id, name, code, status, discount_type, discount_value, applies_to, target_product_ids, target_categories, starts_at, ends_at, redemption_count FROM promotions WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 100", [tenantId]),
    query<any>("SELECT id, name, status, scopes, last_used_at, created_at, updated_at FROM integration_api_keys WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 100", [tenantId]),
    query<any>("SELECT id, source, event_type, status, error_message, processed_at, created_at FROM integration_webhook_events WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 200", [tenantId]),
    query<any>("SELECT business FROM app_settings WHERE tenant_id = ? LIMIT 1", [tenantId]),
    query<any>("SELECT COUNT(*) AS active_registers FROM cash_sessions WHERE tenant_id = ? AND status = 'open'", [tenantId]),
  ]);
  return {
    products,
    staff,
    sales,
    saleItems,
    salePayments,
    cashSessions,
    cashMovements,
    managerCashMovements,
    cashCloseCheckpoints,
    cashCustodyTransfers,
    customers,
    customerPayoutRequests,
    staffPayoutRequests,
    auditEvents,
    stockMovements,
    managerTasks,
    stockTakeSessions,
    stockTakeItems,
    stockTakeRules,
    laybyOrders,
    laybyItems,
    laybyPayments,
    purchaseOrders,
    vendors,
    companionDevices,
    pushSubscriptions,
    promotions,
    integrationApiKeys,
    integrationWebhookEvents,
    business: parseJson(configRows[0]?.business, {}),
    activeRegisters: toNumber(packageRows[0]?.active_registers),
  };
}

export async function generateInsights(tenantId: string, requestedBy?: string | null): Promise<AiInsight[]> {
  const settings = await getAiSettings(tenantId);
  const dataset = await getBusinessDataset(tenantId);
  const deterministic = buildDeterministicInsights(tenantId, dataset);
  let insights = deterministic;

  if (isProviderConfigured(settings)) {
    try {
      const enriched = await callProviderForInsights(settings, deterministic, dataset);
      if (enriched.length > 0) insights = enriched;
      await insertAudit(tenantId, "generate_insights", requestedBy || null, "success", { source: settings.provider, count: insights.length });
    } catch (err: any) {
      await insertAudit(tenantId, "generate_insights", requestedBy || null, "fallback", { error: err?.message || String(err) });
    }
  } else {
    await insertAudit(tenantId, "generate_insights", requestedBy || null, "success", { source: "deterministic", count: insights.length });
  }

  await replaceInsights(tenantId, insights);
  return listInsights(tenantId);
}

export function buildDeterministicInsights(tenantId: string, dataset: any): AiInsight[] {
  const metrics = buildBusinessMetrics(dataset);
  const insights: AiInsight[] = [];

  insights.push(makeInsight(
    tenantId,
    "sales",
    metrics.sales.revenue > 0 ? "success" : "info",
    "Sales pulse",
    `Completed revenue is R${metrics.sales.revenue.toFixed(2)} across ${metrics.sales.completedCount} completed sales.`,
    `Use the R${metrics.sales.averageOrder.toFixed(2)} average order value alongside payment mix, table/tab, and offline-sale signals when shaping upsells or shift targets.`,
    [
      `Completed sales: ${metrics.sales.completedCount}`,
      `Average order: R${metrics.sales.averageOrder.toFixed(2)}`,
      `Split-payment sales: ${metrics.sales.splitPaymentSaleCount}`,
      `Offline-synced sales: ${metrics.sales.offlineSaleCount}`,
    ],
    84
  ));

  insights.push(makeInsight(
    tenantId,
    "sales",
    metrics.performance.upsellCandidates.length > 0 ? "info" : "success",
    "Cashier upsell prompts",
    metrics.performance.upsellCandidates.length > 0
      ? `Use ${metrics.performance.upsellCandidates.length} high-margin product prompt${metrics.performance.upsellCandidates.length === 1 ? "" : "s"} with cart contents, active promotions, and customer context.`
      : "No high-confidence upsell prompt is available yet because there is not enough completed sale and margin history.",
    metrics.performance.upsellCandidates.length > 0
      ? "Prompt cashiers to suggest the highest-margin matching add-on only when stock is available and the recommendation fits the current cart, customer history, active promotion, and time-of-day demand."
      : "Keep product cost prices, stock levels, promotion targets, and customer history current so cashier-facing upsells stay useful.",
    [
      ...metrics.performance.upsellCandidates,
      `Active promotions: ${metrics.performance.activePromotionCount}`,
      `Top category: ${metrics.sales.topCategory || "not enough history"}`,
    ].slice(0, 5),
    metrics.performance.upsellCandidates.length > 0 ? 82 : 68
  ));

  insights.push(makeInsight(
    tenantId,
    "restaurant",
    metrics.performance.menuCandidates.length > 0 || metrics.stock.shrinkageOrWastageCount > 0 ? "warning" : "info",
    "Menu/product optimization",
    metrics.performance.menuCandidates.length > 0
      ? `${metrics.performance.menuCandidates.length} category or product margin signal${metrics.performance.menuCandidates.length === 1 ? "" : "s"} can guide menu, shelf, and recipe decisions.`
      : "Menu and product optimization needs more sale, cost, recipe, stock, and wastage history before ranking changes confidently.",
    "Review low-margin categories, recipe-cost gaps, low-stock products, shrinkage/wastage, and time-of-day demand before changing menus, prices, bundles, or product placement.",
    [
      ...metrics.performance.menuCandidates,
      `Low-stock products: ${metrics.stock.lowStockCount}`,
      `Shrinkage/wastage movements: ${metrics.stock.shrinkageOrWastageCount}`,
      `Wastage/shrinkage units: ${metrics.stock.shrinkageOrWastageQuantity.toFixed(3)}`,
    ].slice(0, 6),
    metrics.performance.menuCandidates.length > 0 ? 86 : 72
  ));

  if (metrics.tasks.openCount > 0) {
    insights.push(makeInsight(
      tenantId,
      "staff",
      metrics.tasks.highPriorityCount > 0 ? "critical" : "warning",
      "Manager action queue",
      `${metrics.tasks.openCount} Action Center task${metrics.tasks.openCount === 1 ? "" : "s"} are open or in review, including ${metrics.tasks.highPriorityCount} high-priority item${metrics.tasks.highPriorityCount === 1 ? "" : "s"}.`,
      "Work the queue from highest priority first, and convert AI recommendations into tracked manager tasks before anyone changes stock, cash, refunds, or settings.",
      [
        `Open tasks: ${metrics.tasks.openCount}`,
        `AI recommendation tasks: ${metrics.tasks.aiRecommendationCount}`,
        `Stock variance tasks: ${metrics.tasks.stockVarianceCount}`,
        `Offline sync tasks: ${metrics.tasks.offlineSyncCount}`,
      ],
      metrics.tasks.highPriorityCount > 0 ? 91 : 84
    ));
  }

  if (metrics.offline.auditEventCount > 0 || metrics.tasks.offlineSyncCount > 0 || metrics.sales.offlineSaleCount > 0) {
    insights.push(makeInsight(
      tenantId,
      "sales",
      metrics.offline.conflictEventCount > 0 || metrics.tasks.offlineSyncCount > 0 ? "warning" : "info",
      "Offline sync health",
      `${metrics.sales.offlineSaleCount} recent sale${metrics.sales.offlineSaleCount === 1 ? "" : "s"} carry offline sync metadata, with ${metrics.offline.conflictEventCount} conflict event${metrics.offline.conflictEventCount === 1 ? "" : "s"}.`,
      metrics.offline.conflictEventCount > 0 || metrics.tasks.offlineSyncCount > 0
        ? "Review duplicate receipts, stock shortages, and table/tab collisions before clearing offline sync tasks."
        : "Keep device and local receipt metadata visible so successful offline trading remains auditable.",
      [
        `Offline audit events: ${metrics.offline.auditEventCount}`,
        `Local receipts tracked: ${metrics.offline.localReceiptCount}`,
        `Devices in audit details: ${metrics.offline.deviceCount}`,
        `Companion devices: ${metrics.offline.companionDeviceCount}`,
      ],
      metrics.offline.conflictEventCount > 0 ? 88 : 76
    ));
  }

  if (metrics.stock.lowStockCount > 0) {
    insights.push(makeInsight(
      tenantId,
      "stock",
      metrics.stock.lowStockCount > 5 || metrics.stock.shrinkageOrWastageCount > 0 ? "critical" : "warning",
      "Stock needs attention",
      `${metrics.stock.lowStockCount} products are at or below their minimum stock level, with ${metrics.stock.countCorrectionCount} recent count-correction movement${metrics.stock.countCorrectionCount === 1 ? "" : "s"}.`,
      "Prioritize low-stock items that also show count corrections, shrinkage, wastage, or overdue supplier orders.",
      [
        ...metrics.stock.lowStockProducts,
        `Shrinkage/wastage movements: ${metrics.stock.shrinkageOrWastageCount}`,
        `Active purchase orders: ${metrics.stock.activePurchaseOrderCount}`,
      ].slice(0, 5),
      89
    ));
  } else {
    insights.push(makeInsight(
      tenantId,
      "stock",
      metrics.stock.shrinkageOrWastageCount > 0 || metrics.stock.countCorrectionCount > 0 ? "warning" : "success",
      metrics.stock.shrinkageOrWastageCount > 0 ? "Stock exceptions" : "Stock looks stable",
      metrics.stock.shrinkageOrWastageCount > 0
        ? `${metrics.stock.shrinkageOrWastageCount} shrinkage or wastage movement${metrics.stock.shrinkageOrWastageCount === 1 ? "" : "s"} are visible in the recent ledger.`
        : "No products are currently below their configured minimum stock.",
      metrics.stock.shrinkageOrWastageCount > 0
        ? "Use reason-code patterns to decide which products need spot checks, recipe review, or tighter receiving controls."
        : "Keep min-stock levels and stock movement reason codes updated so AI can warn earlier.",
      [
        `Stock movements: ${metrics.stock.movementCount}`,
        `Count corrections: ${metrics.stock.countCorrectionCount}`,
        `Active purchase orders: ${metrics.stock.activePurchaseOrderCount}`,
      ],
      metrics.stock.shrinkageOrWastageCount > 0 ? 82 : 74
    ));
  }

  if (metrics.stocktake.submittedSessionCount > 0 || metrics.stocktake.varianceItemCount > 0 || metrics.stocktake.overdueSessionCount > 0) {
    insights.push(makeInsight(
      tenantId,
      "stock",
      metrics.stocktake.overdueSessionCount > 0 || metrics.stocktake.varianceItemCount > 5 ? "warning" : "info",
      "Stocktake variance watch",
      `${metrics.stocktake.varianceItemCount} stocktake item${metrics.stocktake.varianceItemCount === 1 ? "" : "s"} have variance, totalling ${metrics.stocktake.absoluteVarianceQuantity.toFixed(3)} units absolute variance.`,
      "Approve clean stocktakes promptly and send high-variance items to recount before posting count-correction movements.",
      [
        `Submitted sessions: ${metrics.stocktake.submittedSessionCount}`,
        `Overdue sessions: ${metrics.stocktake.overdueSessionCount}`,
        `Active spot-check rules: ${metrics.stocktake.activeRuleCount}`,
      ],
      86
    ));
  }

  if (metrics.stock.activePurchaseOrderCount > 0 || metrics.stock.overduePurchaseOrderCount > 0) {
    insights.push(makeInsight(
      tenantId,
      "stock",
      metrics.stock.overduePurchaseOrderCount > 0 ? "warning" : "info",
      "Purchasing pipeline",
      `${metrics.stock.activePurchaseOrderCount} purchase order${metrics.stock.activePurchaseOrderCount === 1 ? "" : "s"} are still draft or sent, with ${metrics.stock.overduePurchaseOrderCount} overdue expected deliver${metrics.stock.overduePurchaseOrderCount === 1 ? "y" : "ies"}.`,
      "Use open purchase orders together with low-stock and receiving gaps before creating more supplier work.",
      [
        `Active POs: ${metrics.stock.activePurchaseOrderCount}`,
        `Overdue POs: ${metrics.stock.overduePurchaseOrderCount}`,
      ],
      metrics.stock.overduePurchaseOrderCount > 0 ? 83 : 72
    ));
  }

  const cashNeedsReview = metrics.cash.cashVariance > 0 || metrics.cash.latestCheckpointVariance > 0 || metrics.cash.pendingCashCustodyTransferCount > 0;
  insights.push(makeInsight(
    tenantId,
    "cash",
    cashNeedsReview ? "warning" : "success",
    "Cash control",
    cashNeedsReview
      ? `Recent cash sessions and EOD checkpoints show R${(metrics.cash.cashVariance + metrics.cash.latestCheckpointVariance).toFixed(2)} total visible variance.`
      : "No cash variance is visible in recent submitted, closed, or EOD checkpoint data.",
    cashNeedsReview
      ? "Review register variance, manager float movement, petty cash, pending custody transfers, and wallet-cash activity before closing the day."
      : "Keep reviewing sessions promptly so exceptions remain visible while the manager cash ledger stays balanced.",
    [
      `Open registers: ${metrics.cash.activeRegisterCount}`,
      `Manager cash net: R${metrics.cash.managerCashNet.toFixed(2)}`,
      `Pending custody transfers: ${metrics.cash.pendingCashCustodyTransferCount}`,
      `Petty cash: R${metrics.cash.pettyCashTotal.toFixed(2)}`,
    ],
    cashNeedsReview ? 86 : 74
  ));

  insights.push(makeInsight(
    tenantId,
    "staff",
    metrics.sales.refundCount > 0 || metrics.sales.voidCount > 0 || cashNeedsReview || metrics.tasks.stockVarianceCount > 0 ? "warning" : "info",
    "Exception insight watch",
    `Refunds, voids, cash variance, staff task exceptions, and stock variance signals are being tracked for manager review.`,
    "Use this as an approval-first exception queue: assign a manager task before refund follow-up, cash correction, stock correction, discounting, or staff coaching changes are applied.",
    [
      `Refund count: ${metrics.sales.refundCount}`,
      `Void count: ${metrics.sales.voidCount}`,
      `Cash variance: R${(metrics.cash.cashVariance + metrics.cash.latestCheckpointVariance).toFixed(2)}`,
      `Stock variance tasks: ${metrics.tasks.stockVarianceCount}`,
      `Open manager tasks: ${metrics.tasks.openCount}`,
    ],
    metrics.sales.refundCount > 0 || metrics.sales.voidCount > 0 || cashNeedsReview ? 87 : 75
  ));

  if (metrics.layby.activeCount > 0) {
    insights.push(makeInsight(
      tenantId,
      "customer",
      metrics.layby.overdueCount > 0 ? "warning" : "info",
      "Lay-by exposure",
      `${metrics.layby.activeCount} active lay-by order${metrics.layby.activeCount === 1 ? "" : "s"} hold R${metrics.layby.balanceDue.toFixed(2)} balance due and ${metrics.layby.reservedQuantity.toFixed(3)} reserved unit${metrics.layby.reservedQuantity === 1 ? "" : "s"}.`,
      metrics.layby.overdueCount > 0
        ? "Follow up overdue lay-bys before reserved stock sits idle or cancellation refunds affect cash planning."
        : "Watch due-soon lay-bys alongside reserved stock so managers can follow up before deadlines pass.",
      [
        `Overdue lay-bys: ${metrics.layby.overdueCount}`,
        `Due in 7 days: ${metrics.layby.dueSoonCount}`,
        `Completed lay-bys: ${metrics.layby.completedCount}`,
      ],
      metrics.layby.overdueCount > 0 ? 84 : 76
    ));
  }

  if (metrics.restaurant.enabled || metrics.restaurant.openOrderCount > 0 || metrics.restaurant.openTabCount > 0) {
    const liveTiming = metrics.restaurant.liveTiming;
    insights.push(makeInsight(
      tenantId,
      "restaurant",
      metrics.restaurant.openOrderCount > 8 || metrics.restaurant.kitchenItemCount > 12 || liveTiming.staleTimerCount > 0 ? "warning" : "info",
      "Restaurant load",
      `${metrics.restaurant.openOrderCount} orders are open, kitchen, or pending, with ${metrics.restaurant.openTabCount} open tab${metrics.restaurant.openTabCount === 1 ? "" : "s"}.`,
      liveTiming.staleTimerCount > 0
        ? "Clear stale workstation timers before using prep averages for coaching, then watch kitchen queues, open tabs, and table turnover before the next rush."
        : metrics.restaurant.openOrderCount > 8
          ? "Watch kitchen queues, open tabs, and table turnover before the next rush."
        : "Current restaurant load is manageable; keep table and tab collisions visible when offline sync catches up.",
      [
        `Kitchen items: ${metrics.restaurant.kitchenItemCount}`,
        `Table-linked sales: ${metrics.sales.tableOrderCount}`,
        `Live avg prep: ${liveTiming.avgPrepSeconds}s`,
        `Live stale timers: ${liveTiming.staleTimerCount}`,
      ],
      78
    ));
  }

  insights.push(makeInsight(
    tenantId,
    "integration",
    metrics.integration.failedWebhookEventCount > 0 ? "warning" : "info",
    "Integration health",
    `${metrics.integration.configuredConnectorCount} connector signal${metrics.integration.configuredConnectorCount === 1 ? "" : "s"} are visible across payment, API-key, webhook, accounting, delivery, e-commerce, and ERP paths.`,
    metrics.integration.failedWebhookEventCount > 0
      ? "Resolve failed connector events before relying on external stock, delivery, accounting, e-commerce, or ERP sync decisions."
      : "Keep PayFast, future Yoco/SnapScan/BNPL, accounting, delivery, e-commerce, and ERP connectors on the manager health checklist before launch or busy periods.",
    [
      `Active API keys: ${metrics.integration.activeApiKeyCount}`,
      `Webhook events: ${metrics.integration.webhookEventCount}`,
      `Failed webhooks: ${metrics.integration.failedWebhookEventCount}`,
      `PayFast/provider payments: ${metrics.integration.payfastPaymentCount}`,
      `Providers: ${Object.keys(metrics.integration.providerCounts).join(", ") || "none yet"}`,
    ],
    metrics.integration.failedWebhookEventCount > 0 ? 86 : 76
  ));

  const customerExposure = metrics.customer.walletLiability + metrics.customer.accountOwing + metrics.customer.pendingCustomerPayoutAmount + metrics.customer.pendingStaffPayoutAmount;
  insights.push(makeInsight(
    tenantId,
    "customer",
    metrics.customer.overLimitAccountCount > 0 ? "warning" : customerExposure > 0 ? "info" : "success",
    "Customer and wallet exposure",
    customerExposure > 0
      ? `Wallet, account, and payout exposure totals R${customerExposure.toFixed(2)} across current customer and payout records.`
      : "No customer wallet, account, or payout exposure is currently visible.",
    metrics.customer.overLimitAccountCount > 0
      ? "Review over-limit accounts before extending more account credit or approving wallet payouts."
      : "Monitor wallet liability, account debt, and pending payouts alongside cash-in-system planning.",
    [
      `Wallet customers: ${metrics.customer.walletCustomerCount}`,
      `Account owing: R${metrics.customer.accountOwing.toFixed(2)}`,
      `Over-limit accounts: ${metrics.customer.overLimitAccountCount}`,
      `Pending payouts: R${(metrics.customer.pendingCustomerPayoutAmount + metrics.customer.pendingStaffPayoutAmount).toFixed(2)}`,
    ],
    customerExposure > 0 ? 84 : 72
  ));

  insights.push(makeInsight(
    tenantId,
    "staff",
    "info",
    "Staff coverage",
    `${metrics.staff.activeCount} active staff members are configured and ${metrics.sales.openOrderCount} orders are currently active.`,
    "Use staff scores together with cash variance, stocktake participation, refund/void patterns, and Action Center follow-through for coaching.",
    [
      `Active staff: ${metrics.staff.activeCount}`,
      `Open tasks: ${metrics.tasks.openCount}`,
      `Recent audit events: ${metrics.audit.recentEventCount}`,
    ],
    78
  ));

  return insights.slice(0, MAX_MANAGER_INSIGHTS);
}

function makeInsight(tenantId: string, category: AiInsightCategory, severity: AiSeverity, title: string, summary: string, recommendation: string, evidence: string[], confidence: number): AiInsight {
  return {
    id: id("aiins"),
    tenantId,
    category,
    severity,
    title,
    summary,
    recommendation,
    evidence,
    confidence,
    status: "open",
    source: "deterministic",
    createdAt: nowIso(),
  };
}

async function replaceInsights(tenantId: string, insights: AiInsight[]) {
  await query("DELETE FROM ai_insights WHERE tenant_id = ? AND status = 'open'", [tenantId]);
  for (const insight of insights) {
    await query(
      `INSERT INTO ai_insights (
        id, tenant_id, category, severity, title, summary, recommendation, evidence,
        confidence, status, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        insight.id,
        tenantId,
        insight.category,
        insight.severity,
        insight.title,
        insight.summary,
        insight.recommendation,
        JSON.stringify(insight.evidence || []),
        insight.confidence,
        insight.status,
        insight.source,
      ]
    );
  }
}

export async function listInsights(tenantId: string): Promise<AiInsight[]> {
  const rows = await query<any>(
    `SELECT * FROM ai_insights WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 50`,
    [tenantId]
  );
  return rows.map((r: any) => ({
    id: r.id,
    tenantId: r.tenant_id,
    category: r.category,
    severity: r.severity,
    title: r.title,
    summary: r.summary,
    recommendation: r.recommendation,
    evidence: parseJson(r.evidence, []),
    confidence: toNumber(r.confidence),
    status: r.status,
    source: r.source,
    createdAt: r.created_at,
  }));
}

export async function deleteInsight(tenantId: string, insightId: string) {
  const result: any = await query("DELETE FROM ai_insights WHERE tenant_id = ? AND id = ?", [tenantId, insightId]);
  return {
    deleted: Number(result?.affectedRows || result?.rowCount || 0),
  };
}

export async function generateStaffScores(tenantId: string, requestedBy?: string | null): Promise<StaffScore[]> {
  const settings = await getAiSettings(tenantId);
  const dataset = await getBusinessDataset(tenantId);
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
  let scores = buildDeterministicStaffScores(tenantId, dataset, periodStart, periodEnd);

  if (isProviderConfigured(settings)) {
    try {
      scores = await callProviderForStaffScores(settings, scores);
      await insertAudit(tenantId, "generate_staff_scores", requestedBy || null, "success", { source: settings.provider, count: scores.length });
    } catch (err: any) {
      await insertAudit(tenantId, "generate_staff_scores", requestedBy || null, "fallback", { error: err?.message || String(err) });
    }
  } else {
    await insertAudit(tenantId, "generate_staff_scores", requestedBy || null, "success", { source: "deterministic", count: scores.length });
  }

  await replaceStaffScores(tenantId, scores);
  return listStaffScores(tenantId);
}

export function buildDeterministicStaffScores(tenantId: string, dataset: any, periodStart: Date, periodEnd: Date): StaffScore[] {
  const staffRows = rowsOf(dataset.staff);
  const sales = rowsOf(dataset.sales);
  const cashSessions = rowsOf(dataset.cashSessions);
  const cashMovements = rowsOf(dataset.cashMovements);
  const managerTasks = rowsOf(dataset.managerTasks);
  const stockTakeItems = rowsOf(dataset.stockTakeItems);
  const auditEvents = rowsOf(dataset.auditEvents);
  const completed = sales.filter((sale: any) => rowValue(sale, "status") === "completed");
  const maxRevenue = Math.max(1, ...staffRows.map((staff: any) => completed.filter((sale: any) => rowValue(sale, "staff_id", "staffId") === staff.id).reduce((sum: number, sale: any) => sum + toNumber(rowValue(sale, "total")), 0)));

  return staffRows
    .filter((staff: any) => staff.status === "active")
    .map((staff: any) => {
      const staffSales = completed.filter((sale: any) => rowValue(sale, "staff_id", "staffId") === staff.id);
      const staffRevenue = staffSales.reduce((sum: number, sale: any) => sum + toNumber(rowValue(sale, "total")), 0);
      const sessions = cashSessions.filter((session: any) => rowValue(session, "staff_id", "staffId") === staff.id);
      const variance = sessions.reduce((sum: number, session: any) => sum + Math.abs(toNumber(rowValue(session, "difference"))), 0);
      const tips = staffSales.reduce((sum: number, sale: any) => sum + toNumber(rowValue(sale, "tip_amount", "tipAmount")), 0) + sessions.reduce((sum: number, session: any) => sum + toNumber(rowValue(session, "net_tips", "netTips")), 0);
      const openSessions = sessions.filter((session: any) => rowValue(session, "status") === "open").length;
      const disputed = sessions.filter((session: any) => rowValue(session, "review_status", "reviewStatus") === "disputed").length;
      const staffRefunds = sales.filter((sale: any) => (
        rowValue(sale, "refunded_by", "refundedBy") === staff.id ||
        (rowValue(sale, "staff_id", "staffId") === staff.id && String(rowValue(sale, "refund_status", "refundStatus") || "none") !== "none")
      ));
      const staffVoids = sales.filter((sale: any) => (
        rowValue(sale, "voided_by", "voidedBy") === staff.id ||
        (rowValue(sale, "staff_id", "staffId") === staff.id && Boolean(rowValue(sale, "void_reason", "voidReason")))
      ));
      const refundVoidCount = staffRefunds.length + staffVoids.length;
      const staffTasks = managerTasks.filter((task: any) => (
        rowValue(task, "assigned_to", "assignedTo") === staff.id ||
        rowValue(task, "requested_by", "requestedBy") === staff.id ||
        rowValue(task, "decided_by", "decidedBy") === staff.id
      ));
      const openAssignedTasks = staffTasks.filter((task: any) => (
        rowValue(task, "assigned_to", "assignedTo") === staff.id &&
        ACTIVE_MANAGER_TASK_STATUSES.has(String(rowValue(task, "status") || ""))
      ));
      const resolvedTasks = staffTasks.filter((task: any) => ["approved", "done", "dismissed"].includes(String(rowValue(task, "status") || "")));
      const countedStockItems = stockTakeItems.filter((item: any) => (
        rowValue(item, "counted_by", "countedBy") === staff.id ||
        rowValue(item, "assigned_to", "assignedTo") === staff.id
      ));
      const stockVariance = countedStockItems.reduce((sum: number, item: any) => sum + Math.abs(toNumber(rowValue(item, "variance_quantity", "varianceQuantity"))), 0);
      const offlineIssues = auditEvents.filter((event: any) => (
        String(rowValue(event, "action") || "").startsWith("offline.") &&
        rowValue(event, "staff_id", "staffId") === staff.id
      ));
      const noSaleMovements = cashMovements.filter((movement: any) => (
        rowValue(movement, "staff_id", "staffId") === staff.id &&
        rowValue(movement, "type") === "no_sale"
      ));
      const riskFlags = [
        ...(variance > 50 ? [`Cash variance R${variance.toFixed(2)}`] : []),
        ...(disputed > 0 ? [`${disputed} disputed cash-up${disputed > 1 ? "s" : ""}`] : []),
        ...(openSessions > 1 ? [`${openSessions} open sessions`] : []),
        ...(refundVoidCount > 2 ? [`${refundVoidCount} refund/void exceptions`] : []),
        ...(openAssignedTasks.length > 0 ? [`${openAssignedTasks.length} open assigned task${openAssignedTasks.length === 1 ? "" : "s"}`] : []),
        ...(offlineIssues.length > 0 ? [`${offlineIssues.length} offline sync issue${offlineIssues.length === 1 ? "" : "s"}`] : []),
        ...(stockVariance > 5 ? [`${stockVariance.toFixed(3)} stocktake variance units`] : []),
      ];
      const componentScores = {
        salesThroughput: clamp((staffRevenue / maxRevenue) * 100),
        cashAccuracy: clamp(100 - variance * 1.5),
        orderHandling: clamp(staffSales.length * 12),
        reliability: clamp(100 - openSessions * 15 - disputed * 20),
        serviceSignals: clamp(tips * 4 + staffSales.length * 3),
        riskDiscipline: clamp(100 - riskFlags.length * 18),
        taskFollowThrough: clamp(75 + resolvedTasks.length * 6 - openAssignedTasks.length * 14),
        stockDiscipline: clamp(88 + countedStockItems.length * 2 - stockVariance * 4),
        exceptionControl: clamp(100 - refundVoidCount * 8 - offlineIssues.length * 15 - noSaleMovements.length * 3),
      };
      const score = clamp(
        componentScores.salesThroughput * 0.2 +
        componentScores.cashAccuracy * 0.18 +
        componentScores.orderHandling * 0.12 +
        componentScores.reliability * 0.12 +
        componentScores.serviceSignals * 0.1 +
        componentScores.riskDiscipline * 0.12 +
        componentScores.taskFollowThrough * 0.1 +
        componentScores.stockDiscipline * 0.08 +
        componentScores.exceptionControl * 0.08
      );
      const strengths = [
        staffSales.length > 0 ? `${staffSales.length} completed sales` : "Ready for more tracked activity",
        variance <= 10 ? "Strong cash accuracy" : "Cash-up habits are visible and coachable",
        tips > 0 ? `R${tips.toFixed(2)} in tips/service signals` : "Service signals can grow with more tracked tips",
        countedStockItems.length > 0 ? `${countedStockItems.length} stocktake item${countedStockItems.length === 1 ? "" : "s"} handled` : "Can build stocktake participation",
        resolvedTasks.length > 0 ? `${resolvedTasks.length} Action Center task${resolvedTasks.length === 1 ? "" : "s"} resolved` : "Action Center follow-through can build a stronger track record",
      ];
      const coachingNotes = [
        score >= 85 ? "Recognize this performance and keep the momentum visible." : "Set one clear improvement target for the next shift.",
        variance > 20 ? "Review cash-up flow and variance reasons together." : "Keep cash-up review discipline consistent.",
        refundVoidCount > 2 ? "Review refund and void reasons so exception handling stays consistent." : "Keep exception notes clear for future audit reviews.",
        openAssignedTasks.length > 0 ? "Close or reassign open Action Center tasks before the next cash-up." : "Use Action Center tasks as positive evidence for follow-through.",
      ];
      const badges = [
        ...(score >= 85 ? ["Top performer"] : []),
        ...(variance <= 10 ? ["Cash steady"] : []),
        ...(staffSales.length >= 10 ? ["Rush ready"] : []),
        ...(countedStockItems.length >= 5 ? ["Stock count support"] : []),
        ...(refundVoidCount === 0 && offlineIssues.length === 0 ? ["Clean exception trail"] : []),
      ];
      return {
        id: id("aiscore"),
        tenantId,
        staffId: staff.id,
        staffName: staff.name,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        score,
        grade: gradeForScore(score),
        componentScores,
        strengths,
        coachingNotes,
        badges,
        riskFlags,
        source: "deterministic" as const,
        createdAt: nowIso(),
      };
    })
    .sort((a: StaffScore, b: StaffScore) => b.score - a.score);
}

async function replaceStaffScores(tenantId: string, scores: StaffScore[]) {
  await query("DELETE FROM ai_staff_scores WHERE tenant_id = ?", [tenantId]);
  for (const score of scores) {
    await query(
      `INSERT INTO ai_staff_scores (
        id, tenant_id, staff_id, staff_name, period_start, period_end, score, grade,
        component_scores, strengths, coaching_notes, badges, risk_flags, source, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        score.id,
        tenantId,
        score.staffId,
        score.staffName,
        new Date(score.periodStart),
        new Date(score.periodEnd),
        score.score,
        score.grade,
        JSON.stringify(score.componentScores),
        JSON.stringify(score.strengths),
        JSON.stringify(score.coachingNotes),
        JSON.stringify(score.badges),
        JSON.stringify(score.riskFlags),
        score.source,
      ]
    );
  }
}

export async function listStaffScores(tenantId: string): Promise<StaffScore[]> {
  const rows = await query<any>("SELECT * FROM ai_staff_scores WHERE tenant_id = ? ORDER BY score DESC, staff_name ASC", [tenantId]);
  return rows.map((r: any) => ({
    id: r.id,
    tenantId: r.tenant_id,
    staffId: r.staff_id,
    staffName: r.staff_name,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    score: toNumber(r.score),
    grade: r.grade,
    componentScores: parseJson(r.component_scores, {}),
    strengths: parseJson(r.strengths, []),
    coachingNotes: parseJson(r.coaching_notes, []),
    badges: parseJson(r.badges, []),
    riskFlags: parseJson(r.risk_flags, []),
    source: r.source,
    createdAt: r.created_at,
  }));
}

function isProviderConfigured(settings: AiSettings) {
  const status = getAiProviderStatus(settings);
  return Boolean((status as any)[settings.provider]);
}

async function callProviderForInsights(settings: AiSettings, deterministic: AiInsight[], dataset: any): Promise<AiInsight[]> {
  const metrics = buildBusinessMetrics(dataset);
  const text = await callConfiguredProvider(settings, {
    task: "Improve these POS manager insight cards. Keep recommendations suggest-only and approval-first. Return JSON array only.",
    deterministic,
    metrics: {
      sales: metrics.sales,
      stock: metrics.stock,
      stocktake: metrics.stocktake,
      cash: metrics.cash,
      managerTasks: metrics.tasks,
      offline: metrics.offline,
      layby: metrics.layby,
      customer: metrics.customer,
      staff: metrics.staff,
      restaurant: metrics.restaurant,
      audit: {
        recentEventCount: metrics.audit.recentEventCount,
        permissionDeniedCount: metrics.audit.permissionDeniedCount,
        aiEventCount: metrics.audit.aiEventCount,
      },
      businessMode: {
        restaurantMode: Boolean(dataset.business?.isRestaurantMode),
      },
    },
    signalDigest: {
      openTaskTypes: metrics.tasks.countsByType,
      stockReasonCounts: metrics.stock.reasonCounts,
      paymentMix: metrics.sales.paymentMix,
      latestCashCheckpoint: {
        status: metrics.cash.latestCheckpointStatus,
        variance: metrics.cash.latestCheckpointVariance,
        walletLiability: metrics.cash.latestCheckpointWalletLiability,
        pendingPayouts: metrics.cash.latestCheckpointPendingPayouts,
      },
      auditSources: metrics.audit.sourceCounts,
      auditActions: Object.fromEntries(Object.entries(metrics.audit.actionCounts).slice(0, 20)),
    },
  });
  const parsed = parseJson(text, deterministic);
  if (!Array.isArray(parsed)) return deterministic;
  return parsed.slice(0, MAX_MANAGER_INSIGHTS).map((item: any, idx: number) => ({
    ...deterministic[idx % deterministic.length],
    ...item,
    id: deterministic[idx]?.id || id("aiins"),
    source: settings.provider === "openai" ? "openai" : "deterministic",
    status: "open",
    evidence: Array.isArray(item.evidence) ? item.evidence.map(String).slice(0, 5) : deterministic[idx]?.evidence || [],
    confidence: clamp(toNumber(item.confidence || deterministic[idx]?.confidence || 70), 0, 100),
  }));
}

async function callProviderForStaffScores(settings: AiSettings, scores: StaffScore[]): Promise<StaffScore[]> {
  const text = await callConfiguredProvider(settings, {
    task: "Rewrite staff score explanation fields in a coaching and motivational tone. Do not change numeric scores or grades. Return JSON array only.",
    scores,
  });
  const parsed = parseJson(text, scores);
  if (!Array.isArray(parsed)) return scores;
  return scores.map((score, idx) => {
    const item: any = parsed[idx] || {};
    return {
      ...score,
      strengths: Array.isArray(item.strengths) ? item.strengths.map(String).slice(0, 4) : score.strengths,
      coachingNotes: Array.isArray(item.coachingNotes) ? item.coachingNotes.map(String).slice(0, 4) : score.coachingNotes,
      badges: Array.isArray(item.badges) ? item.badges.map(String).slice(0, 4) : score.badges,
      source: settings.provider === "openai" ? "openai" : "deterministic",
    };
  });
}

async function callConfiguredProvider(settings: AiSettings, payload: any): Promise<string> {
  if (settings.provider === "openai") return callOpenAi(settings, payload);
  if (settings.provider === "ollama") return callOllama(settings, payload);
  if (settings.provider === "anythingllm") return callAnythingLlm(settings, payload);
  if (settings.provider === "google") return callGoogle(settings, payload);
  if (settings.provider === "vertex") return callVertex(settings, payload);
  if (settings.provider === "openrouter") return callOpenRouter(settings, payload);
  throw new Error(`Unsupported AI provider: ${settings.provider}`);
}

async function callConfiguredProviderText(settings: AiSettings, message: string, images: string[] = [], documents: AiFileInput[] = []): Promise<string> {
  if (settings.provider === "openai") return callOpenAiText(settings, message, images, documents);
  if (settings.provider === "ollama") return callOllamaText(settings, message, images);
  if (settings.provider === "anythingllm") return callAnythingLlmText(settings, message, images, documents);
  if (settings.provider === "google") return callGoogleText(settings, message, images, documents);
  if (settings.provider === "vertex") return callVertexText(settings, message, images, documents);
  if (settings.provider === "openrouter") return callOpenRouterText(settings, message, images);
  throw new Error(`Unsupported AI provider: ${settings.provider}`);
}

function dataUrlPayload(dataUrl: string) {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl || "");
  return {
    mimeType: match?.[1] || "application/octet-stream",
    base64: match?.[2] || "",
  };
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function parseServiceAccount(raw: string) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    } catch {
      return null;
    }
  }
}

async function getVertexBearerToken(settings: Partial<AiSettings>) {
  const cfg = getVertexConfig(settings);
  if (cfg.accessToken) return cfg.accessToken;
  const account = parseServiceAccount(cfg.serviceAccountJson);
  if (!account?.client_email || !account?.private_key) return "";
  const now = Math.floor(Date.now() / 1000);
  const assertion = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }))}`;
  const signature = crypto.createSign("RSA-SHA256").update(assertion).sign(account.private_key);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${assertion}.${base64Url(signature)}`,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error_description || body?.error || `Vertex service account auth failed [${response.status}]`);
  return body.access_token || "";
}

function buildInvoiceExtractionPayload(input: AiInvoiceExtractionInput) {
  return {
    task: "Extract supplier invoice data for MasePOS inventory automation. Return compact valid JSON only.",
    requiredShape: {
      vendorName: "string",
      invoiceNumber: "string",
      invoiceDate: "YYYY-MM-DD or empty string",
      currency: "string",
      lines: [
        {
          description: "string",
          sku: "string",
          barcode: "string",
          quantity: "number",
          unit: "string",
          unitCost: "number",
          lineTotal: "number",
          packSize: "number",
          itemType: "bulk or single",
          sellable: "boolean",
          confidence: "number 0-1"
        }
      ],
      totals: { subtotal: "number", tax: "number", total: "number" },
      warnings: ["string"]
    },
    rules: [
      "Do not invent missing invoice lines.",
      "If a value is unclear, use an empty string or 0 and add a warning.",
      "Prefer supplier/vendor name exactly as printed on the invoice.",
      "For stock items, use the invoice line description as productName.",
      "Return JSON with keys: vendorName, invoiceNumber, invoiceDate, currency, lines, totals, warnings.",
    ],
    notes: input.notes || "",
    context: input.context || {},
  };
}

export async function extractInvoiceWithAi(tenantId: string, input: AiInvoiceExtractionInput): Promise<any | null> {
  const settings = await getAiSettings(tenantId);
  if (!isProviderConfigured(settings)) return null;
  const promptPayload = buildInvoiceExtractionPayload(input);
  const documents = input.documents || [];
  const images = input.images || [];

  let text = "";
  if (settings.provider === "openai") {
    text = await callOpenAiWithFiles(settings, promptPayload, images, documents);
  } else if (settings.provider === "google") {
    text = await callGoogleWithFiles(settings, promptPayload, images, documents);
  } else if (settings.provider === "vertex") {
    text = await callVertexWithFiles(settings, promptPayload, images, documents);
  } else if (settings.provider === "openrouter") {
    text = await callOpenRouterWithImages(settings, promptPayload, images);
  } else if (settings.provider === "ollama") {
    text = await callOllamaWithImages(settings, promptPayload, images);
  } else {
    text = await callConfiguredProvider(settings, {
      ...promptPayload,
      warning: "This provider was called without binary document support. Use manager notes if available.",
    });
  }

  const parsed = parseJson(text, null);
  if (!parsed || typeof parsed !== "object") return null;
  return parsed;
}

async function callOpenAiWithFiles(settings: AiSettings, payload: any, images: string[], documents: AiFileInput[]): Promise<string> {
  const key = getProviderApiKey(settings);
  if (!key) throw new Error("OPENAI_API_KEY is not configured");
  const content: any[] = [{ type: "input_text", text: providerPrompt(payload) }];
  for (const image of images) {
    content.push({ type: "input_image", image_url: image });
  }
  for (const document of documents) {
    if (!document.dataUrl) continue;
    content.push({
      type: "input_file",
      filename: document.name || "invoice.pdf",
      file_data: document.dataUrl,
    });
  }
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: settings.model,
      input: [
        { role: "system", content: "You are an invoice extraction engine for MasePOS. Return strict JSON only." },
        { role: "user", content },
      ],
      text: { format: { type: "json_object" } },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `OpenAI invoice extraction failed [${response.status}]`);
  return body.output_text || body.output?.flatMap((item: any) => item.content || []).map((part: any) => part.text || "").join("") || "";
}

async function callGoogleWithFiles(settings: AiSettings, payload: any, images: string[], documents: AiFileInput[]): Promise<string> {
  const key = getProviderApiKey(settings);
  if (!key) throw new Error("GOOGLE_AI_API_KEY or GEMINI_API_KEY is not configured");
  const model = settings.model || process.env.GOOGLE_AI_MODEL || "gemini-2.5-flash";
  return callGeminiApiKeyWithFiles(key, model, payload, images, documents, "Google invoice extraction");
}

async function callGeminiApiKeyWithFiles(key: string, model: string, payload: any, images: string[], documents: AiFileInput[], label: string): Promise<string> {
  const parts: any[] = [{ text: `Return compact valid JSON only.\n${providerPrompt(payload)}` }];
  for (const dataUrl of [...images, ...documents.map((doc) => doc.dataUrl)]) {
    const parsed = dataUrlPayload(dataUrl);
    if (parsed.base64) parts.push({ inlineData: { mimeType: parsed.mimeType, data: parsed.base64 } });
  }
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `${label} failed [${response.status}]`);
  return body.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("") || "";
}

async function callVertexWithFiles(settings: AiSettings, payload: any, images: string[], documents: AiFileInput[]): Promise<string> {
  const { key, projectId, location } = getVertexConfig(settings);
  if (!key) throw new Error("GOOGLE_VERTEX_API_KEY is not configured");
  if (!projectId) throw new Error("Google Vertex AI project ID is required");
  if (!location) throw new Error("Google Vertex AI location is required");
  const model = settings.model || process.env.GOOGLE_VERTEX_MODEL || "gemini-2.5-flash";
  const token = await getVertexBearerToken(settings);
  const parts: any[] = [{ text: `Return compact valid JSON only.\n${providerPrompt(payload)}` }];
  for (const dataUrl of [...images, ...documents.map((doc) => doc.dataUrl)]) {
    const parsed = dataUrlPayload(dataUrl);
    if (parsed.base64) parts.push({ inlineData: { mimeType: parsed.mimeType, data: parsed.base64 } });
  }
  const querySuffix = token ? "" : `?key=${encodeURIComponent(key)}`;
  const response = await fetch(
    `https://${location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent${querySuffix}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || `Vertex invoice extraction failed [${response.status}]`;
    if ((/missing authentication header/i.test(message) || isVertexBlockedError(message)) && key) {
      return callGeminiApiKeyWithFiles(key, model, payload, images, documents, "Vertex fallback Gemini invoice extraction");
    }
    throw new Error(isVertexBlockedError(message) ? vertexBlockedGuidance(message) : message);
  }
  return body.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("") || "";
}

async function callOpenRouterWithImages(settings: AiSettings, payload: any, images: string[]): Promise<string> {
  const key = getProviderApiKey(settings);
  if (!key) throw new Error("OPENROUTER_API_KEY is not configured");
  const content: any[] = [{ type: "text", text: providerPrompt(payload) }];
  for (const image of images) content.push({ type: "image_url", image_url: { url: image } });
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": process.env.APP_URL || "http://localhost",
      "X-Title": "MasePOS AI Manager Copilot",
    },
    body: JSON.stringify({
      model: normalizeOpenRouterModel(settings.model),
      messages: [
        { role: "system", content: "You are an invoice extraction engine for MasePOS. Return strict JSON only." },
        { role: "user", content },
      ],
      response_format: { type: "json_object" },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || `OpenRouter invoice extraction failed [${response.status}]`;
    throw new Error(/missing authentication header|auth/i.test(message) ? openRouterAuthGuidance(message, Boolean(key)) : message);
  }
  return body.choices?.[0]?.message?.content || "";
}

async function callOllamaWithImages(settings: AiSettings, payload: any, images: string[]): Promise<string> {
  const baseUrl = (settings.baseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: settings.model || process.env.OLLAMA_MODEL || "llama3.1",
      stream: false,
      format: "json",
      messages: [
        {
          role: "user",
          content: providerPrompt(payload),
          images: images.map((image) => dataUrlPayload(image).base64).filter(Boolean),
        },
      ],
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `Ollama invoice extraction failed [${response.status}]`);
  return body.message?.content || body.response || "";
}

function providerPrompt(payload: any) {
  return JSON.stringify(payload);
}

async function listOpenAiModels(settings: Partial<AiSettings>) {
  const key = getProviderApiKey({ ...settings, provider: "openai" });
  if (!key) throw new Error("OpenAI API key is not configured");
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `OpenAI model list failed [${response.status}]`);
  return uniqueModels((body.data || []).map((model: any) => ({
    id: model.id,
    name: model.id,
    provider: "openai" as const,
    ownedBy: model.owned_by,
  })));
}

async function listOllamaModels(settings: Partial<AiSettings>) {
  const baseUrl = (settings.baseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/tags`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `Ollama model list failed [${response.status}]`);
  return uniqueModels((body.models || []).map((model: any) => ({
    id: model.name,
    name: model.name,
    provider: "ollama" as const,
    ownedBy: model.details?.family,
  })));
}

async function listAnythingLlmModels(settings: Partial<AiSettings>) {
  const baseUrl = (settings.baseUrl || process.env.ANYTHINGLLM_BASE_URL || "http://localhost:3001").replace(/\/$/, "");
  const key = getProviderApiKey({ ...settings, provider: "anythingllm" });
  if (!key) throw new Error("AnythingLLM API key is not configured");
  const headers = { Authorization: `Bearer ${key}` };
  const endpoints = [
    "/api/v1/system/llm",
    "/api/v1/system/models",
    "/api/v1/admin/llm",
  ];

  let lastError = "AnythingLLM model list failed";
  for (const endpoint of endpoints) {
    const response = await fetch(`${baseUrl}${endpoint}`, { headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      lastError = body?.error || body?.message || `${endpoint} failed [${response.status}]`;
      continue;
    }
    const rawModels =
      body.models ||
      body.availableModels ||
      body.llm?.models ||
      body.providers?.flatMap((provider: any) => provider.models || []) ||
      [];
    const models = Array.isArray(rawModels)
      ? rawModels.map((model: any) => {
          const id = typeof model === "string" ? model : model.id || model.name || model.model;
          return { id, name: id, provider: "anythingllm" as const, ownedBy: model.provider || model.family };
        })
      : [];
    if (models.length) return uniqueModels(models);
  }
  throw new Error(lastError);
}

async function listGoogleModels(settings: Partial<AiSettings>) {
  const key = getProviderApiKey({ ...settings, provider: "google" });
  if (!key) throw new Error("Google AI API key is not configured");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `Google model list failed [${response.status}]`);
  return uniqueModels((body.models || [])
    .filter((model: any) => (model.supportedGenerationMethods || []).includes("generateContent"))
    .map((model: any) => {
      const id = String(model.name || "").replace(/^models\//, "");
      return { id, name: model.displayName || id, provider: "google" as const, ownedBy: "google" };
    }));
}

async function listVertexModels(settings: Partial<AiSettings>) {
  const { key, projectId, location } = getVertexConfig(settings);
  if (!projectId) throw new Error("Google Vertex AI project ID is required");
  if (!location) throw new Error("Google Vertex AI location is required");
  const token = await getVertexBearerToken(settings);
  if (!token && !key) throw new Error("Google Vertex AI access token, service account JSON, or API key is not configured");

  const response = await fetch(
    `https://${location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models${token ? "" : `?key=${encodeURIComponent(key)}`}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    }
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || `Vertex AI model list failed [${response.status}]`;
    if ((/missing authentication header/i.test(message) || isVertexBlockedError(message)) && key) return listGoogleModels({ ...settings, provider: "google", apiKey: key });
    throw new Error(isVertexBlockedError(message) ? vertexBlockedGuidance(message) : message);
  }

  return uniqueModels((body.publisherModels || body.models || []).map((model: any) => {
    const rawName = String(model.name || model.publisherModel || model.id || "");
    const id = rawName.split("/models/").pop() || rawName.split("/").pop() || rawName;
    return {
      id,
      name: model.displayName || id,
      provider: "vertex" as const,
      ownedBy: "google",
    };
  }));
}

async function listOpenRouterModels(settings: Partial<AiSettings>) {
  const key = getProviderApiKey({ ...settings, provider: "openrouter" });
  if (!key) throw new Error("OpenRouter API key is not configured");
  const response = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `OpenRouter model list failed [${response.status}]`);
  return uniqueModels((body.data || []).map((model: any) => ({
    id: model.id,
    name: model.name || model.id,
    provider: "openrouter" as const,
    ownedBy: model.architecture?.modality,
  })));
}

async function callOpenAiText(settings: AiSettings, message: string, images: string[] = [], documents: AiFileInput[] = []): Promise<string> {
  const key = getProviderApiKey(settings);
  if (!key) throw new Error("OPENAI_API_KEY is not configured");
  const content: any[] = [{ type: "input_text", text: message }];
  for (const image of images) content.push({ type: "input_image", image_url: image });
  for (const document of documents) {
    if (document.dataUrl) content.push({ type: "input_file", filename: document.name || "test-document", file_data: document.dataUrl });
  }
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: settings.model,
      input: [
        { role: "system", content: "You are a provider connectivity tester for MasePOS. Reply briefly in plain text." },
        { role: "user", content },
      ],
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(providerErrorMessage(body, `OpenAI test failed [${response.status}]`, response.status));
  return body.output_text || body.output?.flatMap((item: any) => item.content || []).map((part: any) => part.text || "").join("") || "";
}

async function callOpenAi(settings: AiSettings, payload: any): Promise<string> {
  const key = getProviderApiKey(settings);
  if (!key) throw new Error("OPENAI_API_KEY is not configured");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: settings.model,
      input: [
        {
          role: "system",
          content: "You are MasePOS Manager Copilot. You return compact valid JSON only. Never recommend punitive action. Never invent business metrics.",
        },
        {
          role: "user",
          content: JSON.stringify(payload),
        },
      ],
      text: { format: { type: "json_object" } },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `OpenAI request failed [${response.status}]`);
  return body.output_text || body.output?.flatMap((item: any) => item.content || []).map((part: any) => part.text || "").join("") || "";
}

async function callOllamaText(settings: AiSettings, message: string, images: string[] = []): Promise<string> {
  const baseUrl = (settings.baseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: settings.model || process.env.OLLAMA_MODEL || "llama3.1",
      stream: false,
      messages: [
        { role: "system", content: "You are a provider connectivity tester for MasePOS. Reply briefly in plain text." },
        { role: "user", content: message, ...(images.length ? { images: images.map((image) => dataUrlPayload(image).base64).filter(Boolean) } : {}) },
      ],
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(providerErrorMessage(body, `Ollama test failed [${response.status}]`, response.status));
  return body.message?.content || body.response || "";
}

async function callOllama(settings: AiSettings, payload: any): Promise<string> {
  const baseUrl = (settings.baseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: settings.model || process.env.OLLAMA_MODEL || "llama3.1",
      stream: false,
      format: "json",
      messages: [
        { role: "system", content: "You are MasePOS Manager Copilot. Return compact valid JSON only. Never invent business metrics." },
        { role: "user", content: providerPrompt(payload) },
      ],
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `Ollama request failed [${response.status}]`);
  return body.message?.content || body.response || "";
}

async function callAnythingLlmText(settings: AiSettings, message: string, images: string[] = [], documents: AiFileInput[] = []): Promise<string> {
  const baseUrl = (settings.baseUrl || process.env.ANYTHINGLLM_BASE_URL || "http://localhost:3001").replace(/\/$/, "");
  const workspaceSlug = settings.workspaceSlug || process.env.ANYTHINGLLM_WORKSPACE_SLUG;
  const key = getProviderApiKey(settings);
  if (!key) throw new Error("ANYTHINGLLM_API_KEY is not configured");
  if (!workspaceSlug) throw new Error("AnythingLLM workspace slug is not configured");
  const mediaNote = images.length || documents.length ? `\n\nAttached media count: ${images.length + documents.length}. This AnythingLLM test endpoint verifies text contact; media support depends on your AnythingLLM workspace connector.` : "";
  const response = await fetch(`${baseUrl}/api/v1/workspace/${encodeURIComponent(workspaceSlug)}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ message: `${message}${mediaNote}`, mode: "chat" }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(providerErrorMessage(body, `AnythingLLM test failed [${response.status}]`, response.status));
  return body.textResponse || body.response || body.message || "";
}

async function callAnythingLlm(settings: AiSettings, payload: any): Promise<string> {
  const baseUrl = (settings.baseUrl || process.env.ANYTHINGLLM_BASE_URL || "http://localhost:3001").replace(/\/$/, "");
  const workspaceSlug = settings.workspaceSlug || process.env.ANYTHINGLLM_WORKSPACE_SLUG;
  const key = getProviderApiKey(settings);
  if (!key) throw new Error("ANYTHINGLLM_API_KEY is not configured");
  if (!workspaceSlug) throw new Error("AnythingLLM workspace slug is not configured");
  const response = await fetch(`${baseUrl}/api/v1/workspace/${encodeURIComponent(workspaceSlug)}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      message: providerPrompt(payload),
      mode: "chat",
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || body?.message || `AnythingLLM request failed [${response.status}]`);
  return body.textResponse || body.response || body.message || "";
}

async function callGoogleText(settings: AiSettings, message: string, images: string[] = [], documents: AiFileInput[] = []): Promise<string> {
  const key = getProviderApiKey(settings);
  if (!key) throw new Error("GOOGLE_AI_API_KEY or GEMINI_API_KEY is not configured");
  const model = settings.model || process.env.GOOGLE_AI_MODEL || "gemini-2.5-flash";
  const parts: any[] = [{ text: message }];
  for (const dataUrl of [...images, ...documents.map((doc) => doc.dataUrl)]) {
    const parsed = dataUrlPayload(dataUrl);
    if (parsed.base64) parts.push({ inlineData: { mimeType: parsed.mimeType, data: parsed.base64 } });
  }
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts }] }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(providerErrorMessage(body, `Google AI test failed [${response.status}]`, response.status));
  return body.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("") || "";
}

async function callGoogle(settings: AiSettings, payload: any): Promise<string> {
  const key = getProviderApiKey(settings);
  if (!key) throw new Error("GOOGLE_AI_API_KEY or GEMINI_API_KEY is not configured");
  const model = settings.model || process.env.GOOGLE_AI_MODEL || "gemini-2.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: `Return compact valid JSON only. Never invent business metrics.\n${providerPrompt(payload)}` }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
      },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `Google AI request failed [${response.status}]`);
  return body.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("") || "";
}

async function callVertexText(settings: AiSettings, message: string, images: string[] = [], documents: AiFileInput[] = []): Promise<string> {
  const { key, projectId, location } = getVertexConfig(settings);
  if (!projectId) throw new Error("Google Vertex AI project ID is required");
  if (!location) throw new Error("Google Vertex AI location is required");
  const model = settings.model || process.env.GOOGLE_VERTEX_MODEL || "gemini-2.5-flash";
  const token = await getVertexBearerToken(settings);
  if (!token && !key) throw new Error("Google Vertex AI access token, service account JSON, or API key is not configured");
  const parts: any[] = [{ text: message }];
  for (const dataUrl of [...images, ...documents.map((doc) => doc.dataUrl)]) {
    const parsed = dataUrlPayload(dataUrl);
    if (parsed.base64) parts.push({ inlineData: { mimeType: parsed.mimeType, data: parsed.base64 } });
  }
  const response = await fetch(
    `https://${location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent${token ? "" : `?key=${encodeURIComponent(key)}`}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ contents: [{ role: "user", parts }] }),
    }
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = providerErrorMessage(body, `Vertex AI test failed [${response.status}]`, response.status);
    if ((/missing authentication header/i.test(error) || isVertexBlockedError(error)) && key) return callGoogleText({ ...settings, provider: "google", apiKey: key }, message, images, documents);
    throw new Error(isVertexBlockedError(error) ? vertexBlockedGuidance(error) : error);
  }
  return body.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("") || "";
}

async function callVertex(settings: AiSettings, payload: any): Promise<string> {
  const { key, projectId, location } = getVertexConfig(settings);
  if (!key) throw new Error("GOOGLE_VERTEX_API_KEY is not configured");
  if (!projectId) throw new Error("Google Vertex AI project ID is required");
  if (!location) throw new Error("Google Vertex AI location is required");
  const model = settings.model || process.env.GOOGLE_VERTEX_MODEL || "gemini-2.5-flash";
  const token = await getVertexBearerToken(settings);
  const response = await fetch(
    `https://${location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent${token ? "" : `?key=${encodeURIComponent(key)}`}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `Return compact valid JSON only. Never invent business metrics.\n${providerPrompt(payload)}` }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    }
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || `Vertex AI request failed [${response.status}]`;
    if ((/missing authentication header/i.test(message) || isVertexBlockedError(message)) && key) return callGoogle({ ...settings, provider: "google", apiKey: key }, payload);
    throw new Error(isVertexBlockedError(message) ? vertexBlockedGuidance(message) : message);
  }
  return body.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("") || "";
}

async function callOpenRouterText(settings: AiSettings, message: string, images: string[] = []): Promise<string> {
  const key = getProviderApiKey(settings);
  if (!key) throw new Error("OPENROUTER_API_KEY is not configured");
  const content: any[] = [{ type: "text", text: message }];
  for (const image of images) content.push({ type: "image_url", image_url: { url: image } });
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": process.env.APP_URL || "http://localhost",
      "X-Title": "MasePOS AI Manager Copilot",
    },
    body: JSON.stringify({
      model: normalizeOpenRouterModel(settings.model),
      messages: [
        { role: "system", content: "You are a provider connectivity tester for MasePOS. Reply briefly in plain text." },
        { role: "user", content },
      ],
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = providerErrorMessage(body, `OpenRouter test failed [${response.status}]`, response.status);
    throw new Error(/missing authentication header|auth/i.test(message) ? openRouterAuthGuidance(message, Boolean(key)) : message);
  }
  return body.choices?.[0]?.message?.content || "";
}

async function callOpenRouter(settings: AiSettings, payload: any): Promise<string> {
  const key = getProviderApiKey(settings);
  if (!key) throw new Error("OPENROUTER_API_KEY is not configured");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": process.env.APP_URL || "http://localhost",
      "X-Title": "MasePOS AI Manager Copilot",
    },
    body: JSON.stringify({
      model: normalizeOpenRouterModel(settings.model),
      messages: [
        { role: "system", content: "You are MasePOS Manager Copilot. Return compact valid JSON only. Never invent business metrics." },
        { role: "user", content: providerPrompt(payload) },
      ],
      response_format: { type: "json_object" },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || `OpenRouter request failed [${response.status}]`;
    throw new Error(/missing authentication header|auth/i.test(message) ? openRouterAuthGuidance(message, Boolean(key)) : message);
  }
  return body.choices?.[0]?.message?.content || "";
}
