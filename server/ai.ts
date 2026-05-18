import { query, isPostgres } from "./db.js";
import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

export type AiRole = "admin" | "manager" | "dev" | "cashier" | "chef";
export type AiProviderName = "openai" | "ollama" | "anythingllm" | "google" | "vertex" | "openrouter";
export type AiInsightCategory = "sales" | "stock" | "cash" | "staff" | "restaurant" | "customer" | "package";
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
    openai: Boolean(settings?.apiKey || process.env.OPENAI_API_KEY),
    ollama: Boolean((settings?.baseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434").trim()),
    anythingllm: Boolean((settings?.apiKey || process.env.ANYTHINGLLM_API_KEY) && (settings?.workspaceSlug || process.env.ANYTHINGLLM_WORKSPACE_SLUG)),
    google: Boolean(settings?.apiKey || process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY),
    vertex: Boolean(
      (settings?.apiKey || process.env.GOOGLE_VERTEX_API_KEY) &&
      (settings?.workspaceSlug || process.env.GOOGLE_VERTEX_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT) &&
      (settings?.baseUrl || process.env.GOOGLE_VERTEX_LOCATION || process.env.GOOGLE_CLOUD_LOCATION)
    ),
    openrouter: Boolean(settings?.apiKey || process.env.OPENROUTER_API_KEY),
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

export async function requireAiRoleAccess(req: Request, res: Response, next: NextFunction) {
  const settings = await getAiSettings(req.params.tenantId);
  if (!settings.enabled) return res.status(403).json({ error: "AI is disabled for this tenant" });
  if (!hasRoleAccess(req.user?.role, settings.visibleRoles)) {
    return res.status(403).json({ error: "Your role cannot access AI Copilot" });
  }
  next();
}

export async function requireAiStaffScoreAccess(req: Request, res: Response, next: NextFunction) {
  const settings = await getAiSettings(req.params.tenantId);
  if (!settings.enabled || !settings.staffScoringEnabled) {
    return res.status(403).json({ error: "AI staff scoring is disabled for this tenant" });
  }
  if (!hasRoleAccess(req.user?.role, settings.staffScoreVisibleRoles)) {
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
  const next: AiSettings = {
    ...current,
    enabled: input.enabled ?? current.enabled,
    provider: input.provider || current.provider,
    model: input.model || current.model,
    apiKey: input.apiKey !== undefined ? input.apiKey : current.apiKey,
    baseUrl: input.baseUrl !== undefined ? input.baseUrl : current.baseUrl,
    workspaceSlug: input.workspaceSlug !== undefined ? input.workspaceSlug : current.workspaceSlug,
    insightsEnabled: input.insightsEnabled ?? current.insightsEnabled,
    staffScoringEnabled: input.staffScoringEnabled ?? current.staffScoringEnabled,
    visibleRoles: sanitizeRoles(input.visibleRoles || current.visibleRoles),
    staffScoreVisibleRoles: sanitizeRoles(input.staffScoreVisibleRoles || current.staffScoreVisibleRoles),
  };
  const pg = isPostgres();
  await query(
    pg
      ? `INSERT INTO ai_settings (
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
          updated_at = NOW()`
      : `INSERT INTO ai_settings (
          tenant_id, enabled, provider, model, api_key, base_url, workspace_slug, insights_enabled, staff_scoring_enabled,
          visible_roles, staff_score_visible_roles, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          enabled = VALUES(enabled),
          provider = VALUES(provider),
          model = VALUES(model),
          api_key = COALESCE(VALUES(api_key), api_key),
          base_url = VALUES(base_url),
          workspace_slug = VALUES(workspace_slug),
          insights_enabled = VALUES(insights_enabled),
          staff_scoring_enabled = VALUES(staff_scoring_enabled),
          visible_roles = VALUES(visible_roles),
          staff_score_visible_roles = VALUES(staff_score_visible_roles),
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
  if (configured) return configured;
  if (settings.provider === "openai") return process.env.OPENAI_API_KEY || "";
  if (settings.provider === "anythingllm") return process.env.ANYTHINGLLM_API_KEY || "";
  if (settings.provider === "google") return process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || "";
  if (settings.provider === "vertex") return process.env.GOOGLE_VERTEX_API_KEY || "";
  if (settings.provider === "openrouter") return process.env.OPENROUTER_API_KEY || "";
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

async function getBusinessDataset(tenantId: string) {
  const [products, staff, sales, cashSessions, cashMovements, customers, configRows, packageRows] = await Promise.all([
    query<any>("SELECT id, name, category, section, stock, min_stock, price, cost_price, workstation_id FROM products WHERE tenant_id = ?", [tenantId]),
    query<any>("SELECT id, name, role, status, wallet_balance FROM staff WHERE tenant_id = ?", [tenantId]),
    query<any>(
      `SELECT id, staff_id, customer_id, total, subtotal, payment_method, status, tip_amount, cash_out_amount, points_discount, table_number, is_tab, created_at
       FROM sales WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 500`,
      [tenantId]
    ),
    query<any>("SELECT * FROM cash_sessions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 150", [tenantId]),
    query<any>("SELECT * FROM cash_movements WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 300", [tenantId]),
    query<any>("SELECT id, name, wallet_balance, loyalty_points, created_at FROM customers WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 300", [tenantId]),
    query<any>("SELECT business FROM app_settings WHERE tenant_id = ? LIMIT 1", [tenantId]),
    query<any>("SELECT COUNT(*) AS active_registers FROM cash_sessions WHERE tenant_id = ? AND status = 'open'", [tenantId]),
  ]);
  return {
    products,
    staff,
    sales,
    cashSessions,
    cashMovements,
    customers,
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

function buildDeterministicInsights(tenantId: string, dataset: any): AiInsight[] {
  const completedSales = dataset.sales.filter((sale: any) => sale.status === "completed");
  const revenue = completedSales.reduce((sum: number, sale: any) => sum + toNumber(sale.total), 0);
  const avgOrder = completedSales.length ? revenue / completedSales.length : 0;
  const lowStock = dataset.products.filter((p: any) => toNumber(p.stock) <= Math.max(1, toNumber(p.min_stock)));
  const cashVariance = dataset.cashSessions
    .filter((s: any) => s.status === "closed" || s.review_status === "submitted" || s.review_status === "disputed")
    .reduce((sum: number, s: any) => sum + Math.abs(toNumber(s.difference)), 0);
  const openOrders = dataset.sales.filter((s: any) => ["open", "kitchen", "pending"].includes(s.status)).length;
  const activeStaff = dataset.staff.filter((s: any) => s.status === "active").length;
  const atRiskCustomers = dataset.customers.filter((c: any) => toNumber(c.wallet_balance) > 0).length;
  const insights: AiInsight[] = [];

  insights.push(makeInsight(tenantId, "sales", revenue > 0 ? "success" : "info", "Sales pulse", `Completed revenue is R${revenue.toFixed(2)} across ${completedSales.length} completed sales.`, `Use the R${avgOrder.toFixed(2)} average order value as the baseline for upsells and combos.`, [`Completed sales: ${completedSales.length}`, `Average order: R${avgOrder.toFixed(2)}`], 82));

  if (lowStock.length > 0) {
    insights.push(makeInsight(tenantId, "stock", lowStock.length > 5 ? "critical" : "warning", "Stock needs attention", `${lowStock.length} products are at or below their minimum stock level.`, "Review these products and create reorder drafts before the next rush.", lowStock.slice(0, 5).map((p: any) => `${p.name}: ${toNumber(p.stock)} left`), 88));
  } else {
    insights.push(makeInsight(tenantId, "stock", "success", "Stock looks stable", "No products are currently below their configured minimum stock.", "Keep min-stock levels updated so AI can warn earlier.", ["No low-stock products found"], 74));
  }

  insights.push(makeInsight(tenantId, "cash", cashVariance > 0 ? "warning" : "success", "Cash control", cashVariance > 0 ? `Recent submitted/closed sessions show R${cashVariance.toFixed(2)} total absolute variance.` : "No cash variance is visible in recent submitted/closed sessions.", cashVariance > 0 ? "Review the largest variance sessions before reconciliation and coach staff on cash-up habits." : "Keep reviewing sessions promptly so exceptions remain visible.", [`Recent cash sessions: ${dataset.cashSessions.length}`], cashVariance > 0 ? 84 : 72));

  insights.push(makeInsight(tenantId, "staff", "info", "Staff coverage", `${activeStaff} active staff members are configured and ${openOrders} orders are currently active.`, "Use the staff scores to balance coaching, recognition, and shift allocation.", [`Active staff: ${activeStaff}`, `Active orders: ${openOrders}`], 78));

  if (dataset.business?.isRestaurantMode) {
    insights.push(makeInsight(tenantId, "restaurant", openOrders > 8 ? "warning" : "info", "Restaurant load", `${openOrders} orders are currently open, in kitchen, or pending.`, openOrders > 8 ? "Watch kitchen queues and consider adding support during rush periods." : "Current open-order load is manageable.", [`Open/kitchen/pending orders: ${openOrders}`], 77));
  }

  insights.push(makeInsight(tenantId, "customer", atRiskCustomers > 0 ? "info" : "success", "Customer wallet liability", `${atRiskCustomers} customers currently have wallet balances.`, "Keep wallet liability visible during cash planning and payout review.", [`Customers with wallet balances: ${atRiskCustomers}`], 75));
  return insights.slice(0, 8);
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
  const completed = dataset.sales.filter((s: any) => s.status === "completed");
  const maxRevenue = Math.max(1, ...dataset.staff.map((staff: any) => completed.filter((sale: any) => sale.staff_id === staff.id).reduce((sum: number, sale: any) => sum + toNumber(sale.total), 0)));

  return dataset.staff
    .filter((staff: any) => staff.status === "active")
    .map((staff: any) => {
      const staffSales = completed.filter((sale: any) => sale.staff_id === staff.id);
      const staffRevenue = staffSales.reduce((sum: number, sale: any) => sum + toNumber(sale.total), 0);
      const sessions = dataset.cashSessions.filter((s: any) => s.staff_id === staff.id);
      const variance = sessions.reduce((sum: number, s: any) => sum + Math.abs(toNumber(s.difference)), 0);
      const tips = staffSales.reduce((sum: number, sale: any) => sum + toNumber(sale.tip_amount), 0) + sessions.reduce((sum: number, s: any) => sum + toNumber(s.net_tips), 0);
      const openSessions = sessions.filter((s: any) => s.status === "open").length;
      const disputed = sessions.filter((s: any) => s.review_status === "disputed").length;
      const riskFlags = [
        ...(variance > 50 ? [`Cash variance R${variance.toFixed(2)}`] : []),
        ...(disputed > 0 ? [`${disputed} disputed cash-up${disputed > 1 ? "s" : ""}`] : []),
        ...(openSessions > 1 ? [`${openSessions} open sessions`] : []),
      ];
      const componentScores = {
        salesThroughput: clamp((staffRevenue / maxRevenue) * 100),
        cashAccuracy: clamp(100 - variance * 1.5),
        orderHandling: clamp(staffSales.length * 12),
        reliability: clamp(100 - openSessions * 15 - disputed * 20),
        serviceSignals: clamp(tips * 4 + staffSales.length * 3),
        riskDiscipline: clamp(100 - riskFlags.length * 22),
      };
      const score = clamp(
        componentScores.salesThroughput * 0.25 +
        componentScores.cashAccuracy * 0.2 +
        componentScores.orderHandling * 0.15 +
        componentScores.reliability * 0.15 +
        componentScores.serviceSignals * 0.1 +
        componentScores.riskDiscipline * 0.15
      );
      const strengths = [
        staffSales.length > 0 ? `${staffSales.length} completed sales` : "Ready for more tracked activity",
        variance <= 10 ? "Strong cash accuracy" : "Cash-up habits are visible and coachable",
        tips > 0 ? `R${tips.toFixed(2)} in tips/service signals` : "Service signals can grow with more tracked tips",
      ];
      const coachingNotes = [
        score >= 85 ? "Recognize this performance and keep the momentum visible." : "Set one clear improvement target for the next shift.",
        variance > 20 ? "Review cash-up flow and variance reasons together." : "Keep cash-up review discipline consistent.",
      ];
      const badges = [
        ...(score >= 85 ? ["Top performer"] : []),
        ...(variance <= 10 ? ["Cash steady"] : []),
        ...(staffSales.length >= 10 ? ["Rush ready"] : []),
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
  const text = await callConfiguredProvider(settings, {
    task: "Improve these POS manager insight cards. Keep recommendations suggest-only. Return JSON array only.",
    deterministic,
    metrics: {
      productCount: dataset.products.length,
      staffCount: dataset.staff.length,
      recentSalesCount: dataset.sales.length,
      recentCashSessions: dataset.cashSessions.length,
      restaurantMode: Boolean(dataset.business?.isRestaurantMode),
    },
  });
  const parsed = parseJson(text, deterministic);
  if (!Array.isArray(parsed)) return deterministic;
  return parsed.slice(0, 8).map((item: any, idx: number) => ({
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
    task: "Extract supplier invoice data for JPOS inventory automation. Return compact valid JSON only.",
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
        { role: "system", content: "You are an invoice extraction engine for JPOS. Return strict JSON only." },
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
    if (/missing authentication header/i.test(message) && key) {
      return callGeminiApiKeyWithFiles(key, model, payload, images, documents, "Vertex fallback Gemini invoice extraction");
    }
    throw new Error(message);
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
      "X-Title": "JPOS AI Manager Copilot",
    },
    body: JSON.stringify({
      model: settings.model || process.env.OPENROUTER_MODEL || "openai/gpt-5-mini",
      messages: [
        { role: "system", content: "You are an invoice extraction engine for JPOS. Return strict JSON only." },
        { role: "user", content },
      ],
      response_format: { type: "json_object" },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `OpenRouter invoice extraction failed [${response.status}]`);
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
    if (/missing authentication header/i.test(message) && key) return listGoogleModels({ ...settings, provider: "google", apiKey: key });
    throw new Error(message);
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
          content: "You are JPOS Manager Copilot. You return compact valid JSON only. Never recommend punitive action. Never invent business metrics.",
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
        { role: "system", content: "You are JPOS Manager Copilot. Return compact valid JSON only. Never invent business metrics." },
        { role: "user", content: providerPrompt(payload) },
      ],
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `Ollama request failed [${response.status}]`);
  return body.message?.content || body.response || "";
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
    if (/missing authentication header/i.test(message) && key) return callGoogle({ ...settings, provider: "google", apiKey: key }, payload);
    throw new Error(message);
  }
  return body.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("") || "";
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
      "X-Title": "JPOS AI Manager Copilot",
    },
    body: JSON.stringify({
      model: settings.model || process.env.OPENROUTER_MODEL || "openai/gpt-5-mini",
      messages: [
        { role: "system", content: "You are JPOS Manager Copilot. Return compact valid JSON only. Never invent business metrics." },
        { role: "user", content: providerPrompt(payload) },
      ],
      response_format: { type: "json_object" },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `OpenRouter request failed [${response.status}]`);
  return body.choices?.[0]?.message?.content || "";
}
