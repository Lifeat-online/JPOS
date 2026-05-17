import dotenv from "dotenv";
import express from "express";
import path from "path";
import cors from "cors";
import bodyParser from "body-parser";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { getConnection, isPostgres, query } from "./db.js";
import { initDb } from "./init-db.js";
import rateLimit from "express-rate-limit";
import http from "http";
import { setupSocketIO, broadcastToMessages, broadcastToWorkstation, broadcastToTable, broadcastToTab, broadcastToSales } from "./socket.js";
import { validateSchema, LoginSchema, ProductSchema, CustomerSchema, CustomerUpdateSchema, StaffSchema, StaffUpdateSchema, SaleSchema, WorkstationSchema, TableSectionSchema, RestaurantTableSchema, PasswordSetupSchema } from "./validation.js";
import { NextFunction, Request, Response } from "express";
import {
  getProductsByTenant,
  getTenantIdBySlug,
  getUserByUid,
  getStaffTenantByEmail,
  getAppConfigByTenant,
  getCustomersByTenant,
  getStaffByTenant,
  getWorkstationsByTenant,
  getActiveSalesByTenant,
  getOpenCashSessionByStaff,
  getPayoutRequestsByTenant,
  getCustomerPayoutRequestsByTenant,
  getMessagesByTenant,
  getMessagesByChannel,
  getTableSectionsByTenant,
  getRestaurantTablesByTenant,
} from "./mariadb-adapter.js";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  createStaff,
  updateStaff,
  deleteStaff,
  createWorkstation,
  deleteWorkstation,
  createTableSection,
  updateTableSection,
  deleteTableSection,
  createRestaurantTable,
  updateRestaurantTable,
  deleteRestaurantTable,
  createSale,
  updateSale,
  updateSaleStatus,
  updateSaleItem,
  getSaleById,
  createPayoutRequest,
  updatePayoutRequest,
  createCustomerPayoutRequest,
  updateCustomerPayoutRequest,
  createMessage,
  markMessageRead,
  setupTenant,
  clearAllSales,
  seedProducts,
  updateAppConfig,
  getBulkItems,
  createBulkItem,
  updateBulkItem,
  deleteBulkItem,
  updateProductRecipe,
  getProductRecipe,
  createModifierGroup,
  updateModifierOptions,
  getProductModifiers,
  deleteModifierGroup,
} from "./mariadb-crud.js";
import { broadcastSalesUpdate } from "./socket.js";
import {
  handleEnrollment,
  handleLogin,
  handleLogout,
  handleRefreshToken,
  handleGetMe,
  handleSetupPassword,
  handleStartDemo,
} from "./auth-handler.js";
import { requireAuth, optionalAuth } from "./auth-middleware.js";
import { clearSeededDemoData, seedDemoData } from "./demo-seed.js";
import { getHostedPackage, JPOS_PACKAGE_ADDONS, JPOS_PACKAGES } from "../shared/packageCatalog.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizeRole(role: unknown) {
  return String(role || "").toLowerCase();
}

function canManageCash(role: unknown) {
  const r = normalizeRole(role);
  return r === "admin" || r === "manager" || r === "dev";
}

function safeJsonField(value: unknown, fallback: any) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function cashSessionResponse(r: any) {
  const toNumber = (value: unknown): number => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "string") {
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };

  return {
    id: r.id,
    tenantId: r.tenant_id,
    staffId: r.staff_id,
    staffName: r.staff_name,
    openedAt: r.opened_at,
    closedAt: r.closed_at,
    submittedAt: r.submitted_at,
    reviewedAt: r.reviewed_at,
    reviewedBy: r.reviewed_by,
    reconciledAt: r.reconciled_at,
    reconciledBy: r.reconciled_by,
    openingFloat: toNumber(r.opening_float),
    openingBreakdown: safeJsonField(r.opening_breakdown, {}),
    expectedCash: toNumber(r.expected_cash),
    actualCash: toNumber(r.actual_cash),
    closingBreakdown: safeJsonField(r.closing_breakdown, {}),
    difference: toNumber(r.difference),
    accumulatedTips: toNumber(r.accumulated_tips),
    netTips: toNumber(r.net_tips),
    status: r.status,
    reviewStatus: r.review_status || (r.status === "open" ? "in_progress" : "submitted"),
    notes: r.notes,
    managerNotes: r.manager_notes,
    varianceReason: r.variance_reason,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

async function recordCashMovement(tenantId: string, data: any) {
  const id = data.id || `cm_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  await query(
    `INSERT INTO cash_movements (
      id, tenant_id, cash_session_id, type, direction, amount, sale_id, payment_id,
      staff_id, staff_name, created_by, note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      id,
      tenantId,
      data.cashSessionId,
      data.type,
      data.direction || "neutral",
      data.amount || 0,
      data.saleId || null,
      data.paymentId || null,
      data.staffId || null,
      data.staffName || null,
      data.createdBy || null,
      data.note || null,
    ]
  );
  return { id, ...data };
}

function toMoneyNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function getSessionRecordedTips(tenantId: string, sessionId: string, closedAt: Date) {
  const rows = await query(
    `SELECT
      cs.staff_id AS staffId,
      cs.status AS currentStatus,
      cs.net_tips AS previousNetTips,
      COALESCE((
        SELECT SUM(sp.tip_amount)
        FROM sales s
        INNER JOIN sale_payments sp ON sp.sale_id = s.id
        WHERE s.tenant_id = cs.tenant_id
          AND s.staff_id = cs.staff_id
          AND s.status = 'completed'
          AND sp.tip_amount > 0
          AND sp.created_at >= cs.opened_at
          AND sp.created_at <= ?
      ), 0) AS paymentTips,
      COALESCE((
        SELECT SUM(s.tip_amount)
        FROM sales s
        WHERE s.tenant_id = cs.tenant_id
          AND s.staff_id = cs.staff_id
          AND s.status = 'completed'
          AND s.tip_amount > 0
          AND s.created_at >= cs.opened_at
          AND s.created_at <= ?
          AND NOT EXISTS (
            SELECT 1 FROM sale_payments sp WHERE sp.sale_id = s.id
          )
      ), 0) AS legacyTips
    FROM cash_sessions cs
    WHERE cs.tenant_id = ? AND cs.id = ?
    LIMIT 1`,
    [closedAt, closedAt, tenantId, sessionId]
  );

  const row = rows[0] as any;
  if (!row) return null;
  return {
    staffId: row.staffId,
    currentStatus: row.currentStatus,
    recordedTips: toMoneyNumber(row.paymentTips) + toMoneyNumber(row.legacyTips),
  };
}

let PAYFAST_MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID;
let PAYFAST_MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY;
let PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE;
let PAYFAST_SANDBOX = process.env.PAYFAST_SANDBOX === "true";

if (!PAYFAST_MERCHANT_ID || !PAYFAST_MERCHANT_KEY || !PAYFAST_PASSPHRASE) {
  console.warn("⚠️  PayFast credentials not configured. Payment processing will fail.");
}

async function getAppConfig(tenantId: string) {
  try {
    const config = await getAppConfigByTenant(tenantId);
    if (config) {
      return {
        merchant_id: config.payfastMerchantId || PAYFAST_MERCHANT_ID,
        merchant_key: config.payfastMerchantKey || PAYFAST_MERCHANT_KEY,
        passphrase: config.payfastPassphrase || PAYFAST_PASSPHRASE,
        sandbox: config.payfastSandbox !== undefined ? config.payfastSandbox : PAYFAST_SANDBOX,
      };
    }
  } catch (err) {
    console.error("Error fetching config from database:", err);
  }
  return {
    merchant_id: PAYFAST_MERCHANT_ID,
    merchant_key: PAYFAST_MERCHANT_KEY,
    passphrase: PAYFAST_PASSPHRASE,
    sandbox: PAYFAST_SANDBOX,
  };
}

function generatePayFastSignature(data: any, passphrase?: string) {
  let queryString = "";
  Object.keys(data).forEach((key) => {
    if (data[key] !== "" && key !== "signature") {
      queryString += `${key}=${encodeURIComponent(data[key]).replace(/%20/g, "+")}&`;
    }
  });

  queryString = queryString.substring(0, queryString.length - 1);
  if (passphrase) {
    queryString += `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, "+")}`;
  }

  return crypto.createHash("md5").update(queryString).digest("hex");
}

export async function createApp(io: any = null) {
  const app = express();
  
  // Force production mode if running on Railway
  if (process.env.RAILWAY_ENVIRONMENT_ID || process.env.RAILWAY_PROJECT_ID) {
    process.env.NODE_ENV = "production";
  }
  
  const isProduction = process.env.NODE_ENV === "production";
  const isTest = process.env.VITEST === "1" || process.env.NODE_ENV === "test";

  app.use(cors());
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  if (process.env.JPOS_HOSTED === "true") {
    const { licenceRouter } = await import("./licenceServer.js");
    app.use("/api", licenceRouter);
  }

  const licence = await import("./licenceMiddleware.js");
  await licence.initialiseLicence();

  // Security Headers
  app.use((req, res, next) => {
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    
    if (isProduction) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    
    next();
  });

  // Rate Limiting for auth endpoints
  const rateLimit = (windowMs: number, max: number) => {
    const attempts = new Map<string, { count: number; resetTime: number }>();
    
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const now = Date.now();
      
      const record = attempts.get(ip);
      if (!record || now > record.resetTime) {
        attempts.set(ip, { count: 1, resetTime: now + windowMs });
        return next();
      }
      
      record.count++;
      if (record.count > max) {
        res.status(429).json({ error: "Too many requests. Please try again later." });
        return;
      }
      
      next();
    };
  };

  // Apply rate limiting to auth endpoints
  const authRateLimit = rateLimit(15 * 60 * 1000, 5); // 5 attempts per 15 minutes

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/licence/info", (req, res) => {
    const info = licence.getLicenceInfo();
    res.json({
      enabled: info.enabled,
      valid: info.valid,
      lockedOut: info.lockedOut,
      reason: info.reason,
      lastOnlineCheck: info.lastOnlineCheck || null,
      lastOnlineSuccess: info.lastOnlineSuccess || null,
      tier: info.payload?.tier,
      tenantName: info.payload?.tenantName,
      maxRegisters: info.payload?.maxRegisters,
      features: info.payload?.features || [],
      expiresAt: info.payload?.expiresAt ? new Date(info.payload.expiresAt * 1000).toISOString() : null,
    });
  });

  app.get("/api/packages", (_req, res) => {
    res.json({
      packages: JPOS_PACKAGES,
      addOns: JPOS_PACKAGE_ADDONS,
    });
  });

  app.use("/api", licence.requireValidLicence);

  app.post("/api/demo/start", handleStartDemo);
  app.post("/api/enroll", handleEnrollment);

  app.get("/api/dev/db-test", async (req, res) => {
    try {
      const conn = await getConnection();
      try {
        const rows = await conn.query("SELECT 1 as val");
        res.json({ status: "ok", postgres: isPostgres(), rows });
      } finally {
        conn.release();
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message, stack: err.stack });
    }
  });

  app.post("/api/dev/init-db", async (req, res) => {
    try {
      await initDb();
      res.json({ success: true, message: "Database schema initialized successfully" });
    } catch (err: any) {
      res.status(500).json({ error: err.message, stack: err.stack });
    }
  });

  app.post("/api/auth/login", authRateLimit, validateSchema(LoginSchema), handleLogin);
  app.post("/api/auth/logout", handleLogout);
  app.post("/api/auth/refresh", authRateLimit, handleRefreshToken);
  app.get("/api/auth/me", requireAuth, handleGetMe);
  app.post("/api/auth/setup-password", requireAuth, validateSchema(PasswordSetupSchema), handleSetupPassword);

  app.get("/api/mariadb/users/:uid", optionalAuth, async (req, res) => {
    try {
      const user = await getUserByUid(req.params.uid);
      res.json(user || null);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/staff", optionalAuth, async (req, res) => {
    try {
      const { email } = req.query;
      if (email) {
        const staff = await getStaffTenantByEmail(email as string);
        return res.json(staff || null);
      }
      res.status(400).json({ error: "Email query parameter is required" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/products", requireAuth, async (req, res) => {
    try {
      const products = await getProductsByTenant(req.params.tenantId);
      res.json(products);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/config", requireAuth, async (req, res) => {
    try {
      const config = await getAppConfigByTenant(req.params.tenantId);
      res.json(config);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/settings/app", requireAuth, async (req, res) => {
    try {
      await updateAppConfig(req.params.tenantId, req.body);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/customers", requireAuth, async (req, res) => {
    try {
      const customers = await getCustomersByTenant(req.params.tenantId);
      res.json(customers);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/staff", requireAuth, async (req, res) => {
    try {
      const staff = await getStaffByTenant(req.params.tenantId);
      res.json(staff);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/workstations", requireAuth, async (req, res) => {
    try {
      const workstations = await getWorkstationsByTenant(req.params.tenantId);
      res.json(workstations);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/sales", requireAuth, async (req, res) => {
    try {
      const data = await getActiveSalesByTenant(req.params.tenantId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/sales", requireAuth, validateSchema(SaleSchema), async (req, res) => {
    try {
      const sale = await createSale(req.params.tenantId, req.body);
      
      // Broadcast to workstations if order has workstation items
      if (io && sale.items && Array.isArray(sale.items)) {
        const hasWorkstationItems = sale.items.some((item: any) => item.workstationId);
        if (hasWorkstationItems) {
          broadcastSalesUpdate(io, req.params.tenantId, sale.id);
        }
      }
      
      res.json(sale);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/sales/:saleId", requireAuth, async (req, res) => {
    try {
      const sale = await getSaleById(req.params.tenantId, req.params.saleId);
      if (!sale) {
        res.status(404).json({ error: "Sale not found" });
        return;
      }
      res.json(sale);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/sales/:saleId", requireAuth, async (req, res) => {
    try {
      const hasPayload = req.body && typeof req.body === "object" && Object.keys(req.body).length > 0;
      if (!hasPayload) {
        res.status(400).json({ error: "Missing sale updates" });
        return;
      }
      const sale = await updateSale(req.params.tenantId, req.params.saleId, req.body);
      res.json(sale);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/sales/:saleId/items/:itemId", requireAuth, async (req, res) => {
    try {
      await updateSaleItem(req.params.tenantId, req.params.saleId, req.params.itemId, req.body);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/live", requireAuth, async (req, res) => {
    try {
      const tenantId = req.params.tenantId;
      const toNumber = (value: unknown): number => {
        if (typeof value === "number") return Number.isFinite(value) ? value : 0;
        if (typeof value === "string") {
          const parsed = parseFloat(value);
          return Number.isFinite(parsed) ? parsed : 0;
        }
        return 0;
      };

      const cfg = await getAppConfigByTenant(tenantId);
      const isRestaurantMode = Boolean(cfg?.business?.isRestaurantMode);

      const registerRows = await query<any>(
        `
          SELECT
            cs.id AS cashSessionId,
            cs.staff_id AS staffId,
            cs.staff_name AS staffName,
            cs.opened_at AS openedAt,
            cs.opening_float AS openingFloat,
            cs.expected_cash AS expectedCash,
            cs.actual_cash AS actualCash,
            cs.accumulated_tips AS accumulatedTips,
            cs.net_tips AS netTips,
            SUM(CASE WHEN s.status = 'completed' THEN 1 ELSE 0 END) AS completedCount,
            SUM(CASE WHEN s.status = 'completed' THEN s.total ELSE 0 END) AS completedRevenue,
            SUM(CASE WHEN s.status IN ('open','kitchen','pending') THEN 1 ELSE 0 END) AS activeOrders,
            MAX(s.created_at) AS lastSaleAt,
            SUM(CASE WHEN s.status = 'completed' AND s.payment_method = 'cash' THEN s.total ELSE 0 END) AS cashRevenue,
            SUM(CASE WHEN s.status = 'completed' AND s.payment_method IN ('card','payfast') THEN s.total ELSE 0 END) AS cardRevenue,
            SUM(CASE WHEN s.status = 'completed' AND s.payment_method = 'wallet' THEN s.total ELSE 0 END) AS walletRevenue
          FROM cash_sessions cs
          LEFT JOIN sales s
            ON s.tenant_id = cs.tenant_id
           AND s.staff_id = cs.staff_id
           AND s.created_at >= cs.opened_at
          WHERE cs.tenant_id = ?
            AND cs.status = 'open'
          GROUP BY cs.id
          ORDER BY cs.opened_at ASC
        `,
        [tenantId]
      );

      const registers = registerRows.map((r: any) => ({
        cashSessionId: String(r.cashSessionId),
        staffId: String(r.staffId),
        staffName: String(r.staffName || ""),
        openedAt: r.openedAt,
        openingFloat: toNumber(r.openingFloat),
        expectedCash: toNumber(r.expectedCash),
        actualCash: toNumber(r.actualCash),
        accumulatedTips: toNumber(r.accumulatedTips),
        netTips: toNumber(r.netTips),
        completedCount: toNumber(r.completedCount),
        completedRevenue: toNumber(r.completedRevenue),
        activeOrders: toNumber(r.activeOrders),
        lastSaleAt: r.lastSaleAt,
        cashRevenue: toNumber(r.cashRevenue),
        cardRevenue: toNumber(r.cardRevenue),
        walletRevenue: toNumber(r.walletRevenue),
      }));

      const pg = isPostgres();
      const salesSummaryRows = await query<any>(
        pg
          ? `
              SELECT
                SUM(CASE WHEN status IN ('open','kitchen','pending') THEN 1 ELSE 0 END) AS activeOrdersCount,
                SUM(CASE WHEN status = 'completed' AND created_at >= (NOW() - INTERVAL '60 minutes') THEN 1 ELSE 0 END) AS lastHourCompletedCount,
                SUM(CASE WHEN status = 'completed' AND created_at >= (NOW() - INTERVAL '60 minutes') THEN total ELSE 0 END) AS lastHourCompletedRevenue,
                SUM(CASE WHEN status = 'completed' AND created_at::date = CURRENT_DATE THEN 1 ELSE 0 END) AS todayCompletedCount,
                SUM(CASE WHEN status = 'completed' AND created_at::date = CURRENT_DATE THEN total ELSE 0 END) AS todayCompletedRevenue,
                SUM(CASE WHEN is_tab = 1 AND status = 'open' THEN 1 ELSE 0 END) AS openTabsCount
              FROM sales
              WHERE tenant_id = ?
            `
          : `
              SELECT
                SUM(CASE WHEN status IN ('open','kitchen','pending') THEN 1 ELSE 0 END) AS activeOrdersCount,
                SUM(CASE WHEN status = 'completed' AND created_at >= (NOW() - INTERVAL 60 MINUTE) THEN 1 ELSE 0 END) AS lastHourCompletedCount,
                SUM(CASE WHEN status = 'completed' AND created_at >= (NOW() - INTERVAL 60 MINUTE) THEN total ELSE 0 END) AS lastHourCompletedRevenue,
                SUM(CASE WHEN status = 'completed' AND DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) AS todayCompletedCount,
                SUM(CASE WHEN status = 'completed' AND DATE(created_at) = CURDATE() THEN total ELSE 0 END) AS todayCompletedRevenue,
                SUM(CASE WHEN is_tab = 1 AND status = 'open' THEN 1 ELSE 0 END) AS openTabsCount
              FROM sales
              WHERE tenant_id = ?
            `,
        [tenantId]
      );
      const salesSummary = salesSummaryRows[0] || {};

      let restaurant: any = null;
      if (isRestaurantMode) {
        const tableRows = await query<any>(
          `
            SELECT
              s.table_number AS "tableNumber",
              COUNT(*) AS "activeOrders",
              MIN(s.created_at) AS "oldestOrderAt",
              SUM(s.total) AS "activeOrderValue"
            FROM sales s
            WHERE s.tenant_id = ?
              AND s.table_number IS NOT NULL
              AND s.table_number <> ''
              AND s.status IN ('open','kitchen','pending')
            GROUP BY s.table_number
            ORDER BY "oldestOrderAt" ASC
          `,
          [tenantId]
        );

        const activeTablesCountRows = await query<any>(
          `SELECT COUNT(*) AS activeTableCount FROM restaurant_tables WHERE tenant_id = ? AND status = 'active'`,
          [tenantId]
        );

        const staffRows = await query<any>(
          pg
            ? `
                SELECT
                  st.id AS staffId,
                  st.name AS staffName,
                  st.role AS staffRole,
                  SUM(CASE WHEN s.status = 'completed' THEN 1 ELSE 0 END) AS completedCount,
                  SUM(CASE WHEN s.status = 'completed' THEN s.total ELSE 0 END) AS completedRevenue,
                  SUM(CASE WHEN s.status IN ('open','kitchen','pending') THEN 1 ELSE 0 END) AS activeOrders,
                  MAX(s.created_at) AS lastSaleAt
                FROM staff st
                LEFT JOIN sales s
                  ON s.tenant_id = st.tenant_id
                 AND s.staff_id = st.id
                 AND s.created_at >= (NOW() - INTERVAL '60 minutes')
                WHERE st.tenant_id = ?
                  AND st.status = 'active'
                GROUP BY st.id
                ORDER BY completedRevenue DESC, completedCount DESC
              `
            : `
                SELECT
                  st.id AS staffId,
                  st.name AS staffName,
                  st.role AS staffRole,
                  SUM(CASE WHEN s.status = 'completed' THEN 1 ELSE 0 END) AS completedCount,
                  SUM(CASE WHEN s.status = 'completed' THEN s.total ELSE 0 END) AS completedRevenue,
                  SUM(CASE WHEN s.status IN ('open','kitchen','pending') THEN 1 ELSE 0 END) AS activeOrders,
                  MAX(s.created_at) AS lastSaleAt
                FROM staff st
                LEFT JOIN sales s
                  ON s.tenant_id = st.tenant_id
                 AND s.staff_id = st.id
                 AND s.created_at >= (NOW() - INTERVAL 60 MINUTE)
                WHERE st.tenant_id = ?
                  AND st.status = 'active'
                GROUP BY st.id
                ORDER BY completedRevenue DESC, completedCount DESC
              `,
          [tenantId]
        );

        const workstationRows = await query<any>(
          pg
            ? `
                SELECT
                  w.id AS workstationId,
                  w.name AS workstationName,
                  w.type AS workstationType,
                  SUM(CASE WHEN s.status IN ('open','kitchen','pending') AND si.status = 'pending' THEN 1 ELSE 0 END) AS pendingCount,
                  SUM(CASE WHEN s.status IN ('open','kitchen','pending') AND si.status = 'accepted' THEN 1 ELSE 0 END) AS acceptedCount,
                  SUM(CASE WHEN s.status IN ('open','kitchen','pending') AND si.status = 'ready' THEN 1 ELSE 0 END) AS readyCount,
                  MIN(CASE WHEN s.status IN ('open','kitchen','pending') AND si.status IN ('pending','accepted') THEN si.ordered_at END) AS oldestOrderedAt,
                  AVG(
                    CASE
                      WHEN si.ordered_at IS NOT NULL
                       AND si.ready_at IS NOT NULL
                       AND si.ordered_at >= (NOW() - INTERVAL '2 hours')
                      THEN EXTRACT(EPOCH FROM (si.ready_at - si.ordered_at))
                      ELSE NULL
                    END
                  ) AS avgPrepSecondsLast2h
                FROM workstations w
                LEFT JOIN sale_items si
                  ON si.workstation_id = w.id
                LEFT JOIN sales s
                  ON s.id = si.sale_id
                 AND s.tenant_id = w.tenant_id
                WHERE w.tenant_id = ?
                  AND w.status = 'active'
                GROUP BY w.id
                ORDER BY (
                  SUM(CASE WHEN s.status IN ('open','kitchen','pending') AND si.status = 'pending' THEN 1 ELSE 0 END)
                  + SUM(CASE WHEN s.status IN ('open','kitchen','pending') AND si.status = 'accepted' THEN 1 ELSE 0 END)
                ) DESC, w.name ASC
              `
            : `
                SELECT
                  w.id AS workstationId,
                  w.name AS workstationName,
                  w.type AS workstationType,
                  SUM(CASE WHEN s.status IN ('open','kitchen','pending') AND si.status = 'pending' THEN 1 ELSE 0 END) AS pendingCount,
                  SUM(CASE WHEN s.status IN ('open','kitchen','pending') AND si.status = 'accepted' THEN 1 ELSE 0 END) AS acceptedCount,
                  SUM(CASE WHEN s.status IN ('open','kitchen','pending') AND si.status = 'ready' THEN 1 ELSE 0 END) AS readyCount,
                  MIN(CASE WHEN s.status IN ('open','kitchen','pending') AND si.status IN ('pending','accepted') THEN si.ordered_at END) AS oldestOrderedAt,
                  AVG(
                    CASE
                      WHEN si.ordered_at IS NOT NULL
                       AND si.ready_at IS NOT NULL
                       AND si.ordered_at >= (NOW() - INTERVAL 2 HOUR)
                      THEN TIMESTAMPDIFF(SECOND, si.ordered_at, si.ready_at)
                      ELSE NULL
                    END
                  ) AS avgPrepSecondsLast2h
                FROM workstations w
                LEFT JOIN sale_items si
                  ON si.workstation_id = w.id
                LEFT JOIN sales s
                  ON s.id = si.sale_id
                 AND s.tenant_id = w.tenant_id
                WHERE w.tenant_id = ?
                  AND w.status = 'active'
                GROUP BY w.id
                ORDER BY (
                  SUM(CASE WHEN s.status IN ('open','kitchen','pending') AND si.status = 'pending' THEN 1 ELSE 0 END)
                  + SUM(CASE WHEN s.status IN ('open','kitchen','pending') AND si.status = 'accepted' THEN 1 ELSE 0 END)
                ) DESC, w.name ASC
              `,
          [tenantId]
        );

        restaurant = {
          tables: {
            activeTableCount: toNumber(activeTablesCountRows?.[0]?.activeTableCount),
            openTableCount: tableRows.length,
            openTables: tableRows.map((t: any) => ({
              tableNumber: String(t.tableNumber),
              activeOrders: toNumber(t.activeOrders),
              oldestOrderAt: t.oldestOrderAt,
              activeOrderValue: toNumber(t.activeOrderValue),
            })),
          },
          staffPerformance: staffRows.map((s: any) => ({
            staffId: String(s.staffId),
            staffName: String(s.staffName || ""),
            staffRole: String(s.staffRole || ""),
            completedCount: toNumber(s.completedCount),
            completedRevenue: toNumber(s.completedRevenue),
            activeOrders: toNumber(s.activeOrders),
            lastSaleAt: s.lastSaleAt,
          })),
          workstationQueues: workstationRows.map((w: any) => {
            const oldestOrderedAt = w.oldestOrderedAt;
            const oldestAgeSeconds = oldestOrderedAt
              ? Math.max(0, Math.floor((Date.now() - new Date(oldestOrderedAt).getTime()) / 1000))
              : 0;
            const pendingCount = toNumber(w.pendingCount);
            const acceptedCount = toNumber(w.acceptedCount);
            const readyCount = toNumber(w.readyCount);
            return {
              workstationId: String(w.workstationId),
              workstationName: String(w.workstationName || ""),
              workstationType: String(w.workstationType || ""),
              pendingCount,
              acceptedCount,
              readyCount,
              queueCount: pendingCount + acceptedCount,
              oldestOrderedAt,
              oldestAgeSeconds,
              avgPrepSecondsLast2h: toNumber(w.avgPrepSecondsLast2h),
            };
          }),
        };
      }

      res.json({
        tenantId,
        isRestaurantMode,
        serverTime: new Date().toISOString(),
        retail: {
          openRegisterCount: registers.length,
          registers,
        },
        totals: {
          activeOrdersCount: toNumber(salesSummary.activeOrdersCount),
          openTabsCount: toNumber(salesSummary.openTabsCount),
          lastHour: {
            completedCount: toNumber(salesSummary.lastHourCompletedCount),
            completedRevenue: toNumber(salesSummary.lastHourCompletedRevenue),
          },
          today: {
            completedCount: toNumber(salesSummary.todayCompletedCount),
            completedRevenue: toNumber(salesSummary.todayCompletedRevenue),
          },
        },
        restaurant,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/messages", requireAuth, async (req, res) => {
    try {
      const { channel, limit } = req.query;
      let data;
      if (channel) {
        data = await getMessagesByChannel(req.params.tenantId, channel as string, limit ? parseInt(limit as string) : 100);
      } else {
        data = await getMessagesByTenant(req.params.tenantId, limit ? parseInt(limit as string) : 100);
      }
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/messages", requireAuth, async (req, res) => {
    try {
      const data = await createMessage(req.params.tenantId, req.body);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/table-sections", requireAuth, async (req, res) => {
    try {
      const data = await getTableSectionsByTenant(req.params.tenantId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/table-sections", requireAuth, validateSchema(TableSectionSchema), async (req, res) => {
    try {
      const data = await createTableSection(req.params.tenantId, req.body);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/table-sections/:id", requireAuth, validateSchema(TableSectionSchema), async (req, res) => {
    try {
      const data = await updateTableSection(req.params.tenantId, req.params.id, req.body);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/mariadb/tenants/:tenantId/table-sections/:id", requireAuth, async (req, res) => {
    try {
      await deleteTableSection(req.params.tenantId, req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/restaurant-tables", requireAuth, async (req, res) => {
    try {
      const data = await getRestaurantTablesByTenant(req.params.tenantId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/restaurant-tables", requireAuth, validateSchema(RestaurantTableSchema), async (req, res) => {
    try {
      const data = await createRestaurantTable(req.params.tenantId, req.body);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/restaurant-tables/:id", requireAuth, validateSchema(RestaurantTableSchema), async (req, res) => {
    try {
      const data = await updateRestaurantTable(req.params.tenantId, req.params.id, req.body);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/mariadb/tenants/:tenantId/restaurant-tables/:id", requireAuth, async (req, res) => {
    try {
      await deleteRestaurantTable(req.params.tenantId, req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/messages/:id/read", requireAuth, async (req, res) => {
    try {
      await markMessageRead(req.params.tenantId, req.params.id, req.body.userId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/setup", requireAuth, async (req, res) => {
    try {
      const data = await setupTenant(req.body);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/seed-products", requireAuth, async (req, res) => {
    try {
      await seedProducts(req.params.tenantId, req.body.products);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/demo-seed/:mode", requireAuth, async (req, res) => {
    try {
      const mode = req.params.mode === "restaurant" ? "restaurant" : "retail";
      await seedDemoData(req.params.tenantId, mode);
      res.json({ success: true, mode });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/mariadb/tenants/:tenantId/demo-seed", requireAuth, async (req, res) => {
    try {
      await clearSeededDemoData(req.params.tenantId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/customers/by-email", optionalAuth, async (req, res) => {
    try {
      const email = req.query.email as string;
      if (!email) return res.status(400).json({ error: "Email is required" });
      const rows = await query("SELECT * FROM customers WHERE email = ?", [email]);
      if (rows.length === 0) return res.json(null);
      const r = rows[0] as any;
      const customer = {
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        address: r.address,
        notes: r.notes,
        loyaltyPoints: r.loyalty_points,
        walletBalance: r.wallet_balance,
        uid: r.uid,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      };
      res.json({ customer, tenantId: r.tenant_id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/products", requireAuth, validateSchema(ProductSchema), async (req, res) => {
    try {
      const data = await createProduct(req.params.tenantId, req.body);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/products/:id", requireAuth, validateSchema(ProductSchema), async (req, res) => {
    try {
      const data = await updateProduct(req.params.tenantId, req.params.id, req.body);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/mariadb/tenants/:tenantId/products/:id", requireAuth, async (req, res) => {
    try {
      await deleteProduct(req.params.tenantId, req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/customers", requireAuth, validateSchema(CustomerSchema), async (req, res) => {
    try {
      const data = await createCustomer(req.params.tenantId, req.body);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/customers/:id", requireAuth, validateSchema(CustomerUpdateSchema), async (req, res) => {
    try {
      const data = await updateCustomer(req.params.tenantId, req.params.id, req.body);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/mariadb/tenants/:tenantId/customers/:id", requireAuth, async (req, res) => {
    try {
      await deleteCustomer(req.params.tenantId, req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/staff", requireAuth, validateSchema(StaffSchema), async (req, res) => {
    try {
      const data = await createStaff(req.params.tenantId, req.body);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/staff/:id", requireAuth, validateSchema(StaffUpdateSchema), async (req, res) => {
    try {
      const data = await updateStaff(req.params.tenantId, req.params.id, req.body);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/mariadb/tenants/:tenantId/staff/:id", requireAuth, async (req, res) => {
    try {
      await deleteStaff(req.params.tenantId, req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/workstations", requireAuth, validateSchema(WorkstationSchema), async (req, res) => {
    try {
      const data = await createWorkstation(req.params.tenantId, req.body);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/mariadb/tenants/:tenantId/workstations/:id", requireAuth, async (req, res) => {
    try {
      await deleteWorkstation(req.params.tenantId, req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/mariadb/tenants/:tenantId/sales", requireAuth, async (req, res) => {
    try {
      await clearAllSales(req.params.tenantId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/customer-payout-requests", requireAuth, async (req, res) => {
    try {
      const data = await createCustomerPayoutRequest(req.params.tenantId, req.body);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/cash-sessions", optionalAuth, async (req, res) => {
    try {
      const staffId = req.query.staffId as string;
      if (staffId) {
        const r: any = await getOpenCashSessionByStaff(req.params.tenantId, staffId);
        if (!r) return res.json(null);
        return res.json(cashSessionResponse(r));
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const rows = await query(
        "SELECT * FROM cash_sessions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?",
        [req.params.tenantId, limit]
      );

      const sessions = rows.map(cashSessionResponse);
      res.json(sessions);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/cash-sessions/:id/movements", requireAuth, async (req, res) => {
    try {
      const rows = await query(
        `SELECT
          id,
          tenant_id AS tenantId,
          cash_session_id AS sessionId,
          type,
          direction,
          amount,
          sale_id AS saleId,
          payment_id AS paymentId,
          staff_id AS staffId,
          staff_name AS staffName,
          created_by AS createdBy,
          note,
          created_at AS timestamp
        FROM cash_movements
        WHERE tenant_id = ? AND cash_session_id = ?
        ORDER BY created_at ASC`,
        [req.params.tenantId, req.params.id]
      );
      res.json(rows.map((r: any) => ({ ...r, amount: Number(r.amount || 0) })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/cash-sessions", requireAuth, async (req, res) => {
    try {
      const activeRegisterRows = await query<any>(
        "SELECT COUNT(*) AS active_count FROM cash_sessions WHERE tenant_id = ? AND status = 'open'",
        [req.params.tenantId]
      );
      const activeRegisters = Number(activeRegisterRows[0]?.active_count || 0);
      const cfg = await getAppConfigByTenant(req.params.tenantId);
      const hostedPackage = getHostedPackage(cfg?.business?.packageTier || process.env.JPOS_HOSTED_PACKAGE_TIER || "free");
      const hostedLimitReached = !licence.shouldEnforceLicence() && hostedPackage.maxRegisters !== -1 && activeRegisters >= hostedPackage.maxRegisters;
      if (!licence.checkRegisterLimit(activeRegisters) || hostedLimitReached) {
        const info = licence.getLicenceInfo();
        return res.status(403).json({
          error: "Register limit reached",
          package: info.payload?.tier || hostedPackage.id,
          limit: info.payload?.maxRegisters ?? hostedPackage.maxRegisters,
          upgrade: "Contact support to upgrade your licence",
        });
      }

      const id = `cs_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      await query(
        `INSERT INTO cash_sessions (
          id, tenant_id, staff_id, staff_name, opened_at, opening_float, opening_breakdown,
          expected_cash, status, review_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          id,
          req.params.tenantId,
          req.body.staffId,
          req.body.staffName || '',
          req.body.openedAt ? new Date(req.body.openedAt) : new Date(),
          req.body.openingFloat || 0,
          JSON.stringify(req.body.openingBreakdown || {}),
          req.body.expectedCash || 0,
          req.body.status || 'open',
          'in_progress',
        ]
      );
      if (Number(req.body.openingFloat || 0) > 0) {
        await recordCashMovement(req.params.tenantId, {
          cashSessionId: id,
          type: "opening_float",
          direction: "in",
          amount: Number(req.body.openingFloat || 0),
          staffId: req.body.staffId,
          staffName: req.body.staffName || "",
          createdBy: req.user?.staffId,
          note: "Opening float counted",
        });
      }
      res.json({ id, ...req.body, reviewStatus: 'in_progress' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/cash-sessions/:id/movements", requireAuth, async (req, res) => {
    try {
      const movement = await recordCashMovement(req.params.tenantId, {
        cashSessionId: req.params.id,
        type: req.body.type,
        direction: req.body.direction,
        amount: req.body.amount,
        saleId: req.body.saleId,
        paymentId: req.body.paymentId,
        staffId: req.body.staffId,
        staffName: req.body.staffName,
        createdBy: req.user?.staffId,
        note: req.body.note,
      });
      res.json(movement);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/cash-sessions/:id", requireAuth, async (req, res) => {
    try {
      const updates = req.body;
      if (
        ["reviewed", "reconciled", "disputed"].includes(updates.reviewStatus) &&
        !canManageCash(req.user?.role)
      ) {
        return res.status(403).json({ error: "Only managers and admins can finalize cash reviews" });
      }
      const isSubmittingCashUp = updates.status === "closed" || updates.reviewStatus === "submitted";
      let walletTipsDelta = 0;
      let walletTipsStaffId: string | null = null;
      if (isSubmittingCashUp) {
        const closedAt = updates.closedAt ? new Date(updates.closedAt) : new Date();
        const tipSummary = await getSessionRecordedTips(req.params.tenantId, req.params.id, closedAt);
        if (tipSummary) {
          const difference = updates.difference !== undefined
            ? toMoneyNumber(updates.difference)
            : toMoneyNumber(updates.actualCash) - toMoneyNumber(updates.expectedCash);
          const recordedTips = tipSummary.recordedTips;
          const netTips = Math.max(0, recordedTips + Math.min(0, difference));

          updates.accumulatedTips = recordedTips;
          updates.netTips = netTips;

          if (tipSummary.currentStatus !== "closed" && netTips > 0) {
            walletTipsDelta = netTips;
            walletTipsStaffId = tipSummary.staffId;
          }
        }
      }
      const fields: string[] = [];
      const values: any[] = [];

      if (updates.submittedAt !== undefined) { fields.push("submitted_at = ?"); values.push(updates.submittedAt ? new Date(updates.submittedAt) : null); }
      if (updates.reviewedAt !== undefined) { fields.push("reviewed_at = ?"); values.push(updates.reviewedAt ? new Date(updates.reviewedAt) : null); }
      if (updates.reviewedBy !== undefined) { fields.push("reviewed_by = ?"); values.push(updates.reviewedBy || null); }
      if (updates.reconciledAt !== undefined) { fields.push("reconciled_at = ?"); values.push(updates.reconciledAt ? new Date(updates.reconciledAt) : null); }
      if (updates.reconciledBy !== undefined) { fields.push("reconciled_by = ?"); values.push(updates.reconciledBy || null); }
      if (updates.closedAt !== undefined) { fields.push("closed_at = ?"); values.push(updates.closedAt ? new Date(updates.closedAt) : null); }
      if (updates.actualCash !== undefined) { fields.push("actual_cash = ?"); values.push(updates.actualCash); }
      if (updates.openingBreakdown !== undefined) { fields.push("opening_breakdown = ?"); values.push(JSON.stringify(updates.openingBreakdown || {})); }
      if (updates.closingBreakdown !== undefined) { fields.push("closing_breakdown = ?"); values.push(JSON.stringify(updates.closingBreakdown || {})); }
      if (updates.difference !== undefined) { fields.push("difference = ?"); values.push(updates.difference); }
      if (updates.accumulatedTips !== undefined) { fields.push("accumulated_tips = ?"); values.push(updates.accumulatedTips); }
      if (updates.netTips !== undefined) { fields.push("net_tips = ?"); values.push(updates.netTips); }
      if (updates.status !== undefined) { fields.push("status = ?"); values.push(updates.status); }
      if (updates.reviewStatus !== undefined) { fields.push("review_status = ?"); values.push(updates.reviewStatus); }
      if (updates.notes !== undefined) { fields.push("notes = ?"); values.push(updates.notes); }
      if (updates.managerNotes !== undefined) { fields.push("manager_notes = ?"); values.push(updates.managerNotes); }
      if (updates.varianceReason !== undefined) { fields.push("variance_reason = ?"); values.push(updates.varianceReason); }
      if (updates.expectedCash !== undefined) { fields.push("expected_cash = ?"); values.push(updates.expectedCash); }
      if (updates.expectedCashDelta !== undefined) { fields.push("expected_cash = expected_cash + ?"); values.push(updates.expectedCashDelta); }
      if (updates.tipsDelta !== undefined) { fields.push("accumulated_tips = accumulated_tips + ?"); values.push(updates.tipsDelta); }

      if (fields.length > 0 || walletTipsDelta > 0) {
        const conn = await getConnection();
        try {
          await conn.beginTransaction();
          if (fields.length > 0) {
            fields.push("updated_at = NOW()");
            values.push(req.params.id, req.params.tenantId);
            await conn.query(`UPDATE cash_sessions SET ${fields.join(", ")} WHERE id = ? AND tenant_id = ?`, values);
          }
          if (walletTipsDelta > 0) {
            await conn.query(
              `UPDATE staff SET wallet_balance = COALESCE(wallet_balance, 0) + ?, updated_at = NOW() WHERE tenant_id = ? AND id = ?`,
              [walletTipsDelta, req.params.tenantId, walletTipsStaffId]
            );
          }
          await conn.commit();
        } catch (err) {
          await conn.rollback();
          throw err;
        } finally {
          conn.release();
        }
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/cash-sessions/:id/review", requireAuth, async (req, res) => {
    try {
      if (!canManageCash(req.user?.role)) {
        return res.status(403).json({ error: "Only managers and admins can review cash ups" });
      }
      const reviewStatus = req.body.reviewStatus || "reviewed";
      if (!["reviewed", "reconciled", "disputed"].includes(reviewStatus)) {
        return res.status(400).json({ error: "Invalid review status" });
      }

      const fields = [
        "review_status = ?",
        "reviewed_at = NOW()",
        "reviewed_by = ?",
        "manager_notes = ?",
        "variance_reason = ?",
        "updated_at = NOW()",
      ];
      const values: any[] = [
        reviewStatus,
        req.user?.staffId || null,
        req.body.managerNotes || null,
        req.body.varianceReason || null,
      ];

      if (reviewStatus === "reconciled") {
        fields.splice(3, 0, "reconciled_at = NOW()", "reconciled_by = ?");
        values.splice(2, 0, req.user?.staffId || null);
      }

      values.push(req.params.id, req.params.tenantId);
      await query(`UPDATE cash_sessions SET ${fields.join(", ")} WHERE id = ? AND tenant_id = ?`, values);
      res.json({ success: true, reviewStatus });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/payout-requests", requireAuth, async (req, res) => {
    try {
      const requests = await getPayoutRequestsByTenant(req.params.tenantId);
      res.json(requests);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/customer-payout-requests", requireAuth, async (req, res) => {
    try {
      const requests = await getCustomerPayoutRequestsByTenant(req.params.tenantId);
      res.json(requests);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/payout-requests", requireAuth, async (req, res) => {
    try {
      const request = await createPayoutRequest(req.params.tenantId, req.body);
      res.json(request);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/payout-requests/:id", requireAuth, async (req, res) => {
    try {
      const request = await updatePayoutRequest(req.params.tenantId, req.params.id, req.body);
      res.json(request);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/customer-payout-requests/:id", requireAuth, async (req, res) => {
    try {
      const request = await updateCustomerPayoutRequest(req.params.tenantId, req.params.id, req.body);
      res.json(request);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Bulk Items & Inventory Expansion
  // ─────────────────────────────────────────────────────────────────────────

  app.get("/api/mariadb/tenants/:tenantId/bulk-items", requireAuth, async (req, res) => {
    try {
      const items = await getBulkItems(req.params.tenantId);
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/bulk-items", requireAuth, async (req, res) => {
    try {
      const item = await createBulkItem(req.params.tenantId, req.body);
      res.json(item);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/bulk-items/:id", requireAuth, async (req, res) => {
    try {
      await updateBulkItem(req.params.tenantId, req.params.id, req.body);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/mariadb/tenants/:tenantId/bulk-items/:id", requireAuth, async (req, res) => {
    try {
      await deleteBulkItem(req.params.tenantId, req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/products/:productId/recipe", requireAuth, async (req, res) => {
    try {
      const recipe = await getProductRecipe(req.params.productId);
      res.json(recipe);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/products/:productId/recipe", requireAuth, async (req, res) => {
    try {
      await updateProductRecipe(req.params.productId, req.body);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/products/:productId/modifiers", requireAuth, async (req, res) => {
    try {
      const mods = await getProductModifiers(req.params.productId);
      res.json(mods);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/products/:productId/modifiers", requireAuth, async (req, res) => {
    try {
      const id = await createModifierGroup(req.params.productId, req.body);
      res.json({ id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/modifiers/:modifierId/options", requireAuth, async (req, res) => {
    try {
      await updateModifierOptions(req.params.modifierId, req.body);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/mariadb/modifiers/:modifierId", requireAuth, async (req, res) => {
    try {
      await deleteModifierGroup(req.params.modifierId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/payfast/notify", async (req, res) => {
    try {
      const { m_payment_id, pf_payment_id, payment_status, signature, ...otherData } = req.body;
      const calculatedSignature = generatePayFastSignature({ m_payment_id, pf_payment_id, payment_status, ...otherData }, PAYFAST_PASSPHRASE);

      if (signature !== calculatedSignature) {
        console.warn("Invalid PayFast signature");
        return res.status(400).send("Invalid signature");
      }

      if (payment_status === "COMPLETE") {
        console.log("Payment completed:", pf_payment_id);
      }

      res.status(200).send("OK");
    } catch (err: any) {
      console.error("PayFast webhook error:", err);
      res.status(500).send("Internal Server Error");
    }
  });

  if (!isProduction && !isTest) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        allowedHosts: true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (isProduction) {
    const rawBasePath = process.env.BASE_PATH || process.env.VITE_BASE_PATH || '/';
    const basePath =
      rawBasePath && rawBasePath !== '/'
        ? `/${rawBasePath.replace(/^\/+|\/+$/g, '')}`
        : '';

    const distDir = path.resolve(__dirname, '..', 'dist');
    const staticMountPath = basePath || '/';

    app.use(staticMountPath, express.static(distDir));

    if (basePath) {
      app.get('/', (req, res) => {
        res.redirect(302, `${basePath}/`);
      });
    }

    app.get(staticMountPath === '/' ? '*' : `${staticMountPath}/*`, (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(path.join(distDir, 'index.html'), (err) => {
        if (err) {
          console.error("sendFile error:", err);
          if (!res.headersSent) {
            res.status(500).send(`Error loading index.html from ${distDir}`);
          }
        }
      });
    });
  }

  // Centralized error handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error("Server error:", err.message);
    
    if (res.headersSent) {
      return next(err);
    }
    
    res.status(500).json({
      error: isProduction ? "Internal server error" : err.message,
      ...(isTest ? { stack: err.stack } : {})
    });
  });

  return app;
}

export async function startServer() {
  const app = await createApp();
  const PORT = Number(process.env.PORT || 8080);
  
  // Create HTTP server and attach Socket.IO
  const httpServer = http.createServer(app);
  setupSocketIO(httpServer);
  
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`${isPostgres() ? "Postgres" : "MariaDB"}-connected POS system ready`);
    console.log(`Socket.IO server initialized`);
    console.log(`__dirname is: ${__dirname}`);
    console.log(`distDir is: ${path.resolve(__dirname, '..', 'dist')}`);
  });
  
  return { app, httpServer };
}

function setupRoutes(app: any, io: any) {
  // Routes are defined in createApp for backward compatibility
  // This function is a placeholder for future refactoring
}

export { setupRoutes };
