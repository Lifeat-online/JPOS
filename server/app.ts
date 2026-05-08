import dotenv from "dotenv";
import express from "express";
import path from "path";
import cors from "cors";
import bodyParser from "body-parser";
import crypto from "crypto";
import { existsSync } from "fs";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { query } from "./db.ts";
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
} from "./mariadb-adapter.ts";
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
} from "./mariadb-crud.ts";
import {
  handleLogin,
  handleLogout,
  handleRefreshToken,
  handleGetMe,
  handleSetupPassword,
} from "./auth-handler.ts";
import { requireAuth, optionalAuth } from "./auth-middleware.ts";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPDATE_GIT_URL = "https://github.com/Lifeat-online/JPOS.git";
const UPDATE_REPO = "Lifeat-online/JPOS";

let PAYFAST_MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID || "10000100";
let PAYFAST_MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY || "46f0cd694581a";
let PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE || "jt7v60h69n8a1";
let PAYFAST_SANDBOX = process.env.PAYFAST_SANDBOX === "true";

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

export async function createApp() {
  const app = express();
  const isProduction = process.env.NODE_ENV === "production";
  const isTest = process.env.VITEST === "1" || process.env.NODE_ENV === "test";

  app.use(cors());
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/auth/login", handleLogin);
  app.post("/api/auth/logout", handleLogout);
  app.post("/api/auth/refresh", handleRefreshToken);
  app.get("/api/auth/me", requireAuth, handleGetMe);
  app.post("/api/auth/setup-password", requireAuth, handleSetupPassword);

  app.get("/api/dev/check-updates", async (req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Update checks are disabled in production." });
    }

    const repo = UPDATE_REPO;
    const githubToken = process.env.GITHUB_TOKEN || null;
    const url = `https://api.github.com/repos/${repo}/releases/latest`;

    try {
      const headers: any = {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "JimmyPOS-DevDashboard",
      };

      if (githubToken) {
        headers.Authorization = `token ${githubToken}`;
      }

      const githubResponse = await fetch(url, { headers });

      const responseText = await githubResponse.text();

      if (!githubResponse.ok) {
        if (githubResponse.status === 404) {
          const tagsUrl = `https://api.github.com/repos/${repo}/tags`;
          const tagsResponse = await fetch(tagsUrl, { headers });

          if (tagsResponse.ok) {
            const tagsText = await tagsResponse.text();
            try {
              const tags = JSON.parse(tagsText);
              if (Array.isArray(tags) && tags.length > 0) {
                return res.json({
                  latestVersion: tags[0].name,
                  latestUrl: tags[0].zipball_url || `https://github.com/${repo}/releases/tag/${tags[0].name}`,
                  notes: '',
                  publishedAt: null,
                });
              }
            } catch (parseErr) {
              // Tags endpoint parse failed
            }
          }

          return res.status(404).json({ error: "Repository not found or no releases available." });
        }

        return res.status(githubResponse.status).json({ error: responseText });
      }

      const latestData = JSON.parse(responseText);
      return res.json({
        latestVersion: latestData.tag_name,
        latestUrl: latestData.html_url,
        notes: latestData.body || '',
        publishedAt: latestData.published_at,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to check for updates" });
    }
  });

  app.post("/api/dev/update", async (req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Updates are disabled in production." });
    }

    if (isTest) {
      return res.status(501).json({ error: "Update endpoint not available in test mode." });
    }

    const projectRoot = path.resolve(__dirname, "..");
    const gitDir = path.join(projectRoot, ".git");
    if (!existsSync(gitDir)) {
      return res.status(400).json({ error: "Project is not a git repository (.git not found)." });
    }

    const runGit = (args: string[]) => {
      const result = spawnSync("git", args, { cwd: projectRoot, encoding: "utf8" });
      const stdout = typeof result.stdout === "string" ? result.stdout : "";
      const stderr = typeof result.stderr === "string" ? result.stderr : "";
      const output = `${stdout}${stderr}`.trim();

      if (result.error) {
        return { ok: false as const, status: null as number | null, output: output || result.error.message };
      }
      if (typeof result.status === "number" && result.status !== 0) {
        return { ok: false as const, status: result.status, output };
      }
      return { ok: true as const, status: 0, output };
    };

    const steps: string[] = [];
    const record = (cmd: string, output: string) => {
      steps.push(`$ git ${cmd}${output ? `\n${output}` : ""}`.trim());
    };

    try {
      const getOrigin = runGit(["remote", "get-url", "origin"]);
      record("remote get-url origin", getOrigin.output);

      if (!getOrigin.ok) {
        const addOrigin = runGit(["remote", "add", "origin", UPDATE_GIT_URL]);
        record(`remote add origin ${UPDATE_GIT_URL}`, addOrigin.output);
        if (!addOrigin.ok) {
          return res.status(500).json({ success: false, error: "Failed to add origin remote.", output: steps.join("\n\n") });
        }
      } else {
        const setOrigin = runGit(["remote", "set-url", "origin", UPDATE_GIT_URL]);
        record(`remote set-url origin ${UPDATE_GIT_URL}`, setOrigin.output);
        if (!setOrigin.ok) {
          return res.status(500).json({ success: false, error: "Failed to set origin remote URL.", output: steps.join("\n\n") });
        }
      }

      const fetchAll = runGit(["fetch", "--all", "--prune"]);
      record("fetch --all --prune", fetchAll.output);
      if (!fetchAll.ok) {
        return res.status(500).json({ success: false, error: "Git fetch failed.", output: steps.join("\n\n") });
      }

      const branch = runGit(["branch", "--show-current"]);
      record("branch --show-current", branch.output);

      if (branch.ok && branch.output) {
        const upstream = runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
        record("rev-parse --abbrev-ref --symbolic-full-name @{u}", upstream.output);
        if (!upstream.ok) {
          const setUpstream = runGit(["branch", "--set-upstream-to", `origin/${branch.output}`, branch.output]);
          record(`branch --set-upstream-to origin/${branch.output} ${branch.output}`, setUpstream.output);
          if (!setUpstream.ok) {
            return res.status(500).json({ success: false, error: "Failed to set upstream branch.", output: steps.join("\n\n") });
          }
        }
      }

      const pull = runGit(["pull", "--ff-only"]);
      record("pull --ff-only", pull.output);
      if (!pull.ok) {
        return res.status(500).json({ success: false, error: "Git pull failed.", output: steps.join("\n\n") });
      }

      return res.json({ success: true, output: steps.join("\n\n") });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err?.message || "Update failed.",
        output: steps.join("\n\n"),
      });
    }
  });

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

  app.post("/api/mariadb/tenants/:tenantId/sales", requireAuth, async (req, res) => {
    try {
      const sale = await createSale(req.params.tenantId, req.body);
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
      const status = req.body?.status;
      if (typeof status !== "string" || status.trim().length === 0) {
        res.status(400).json({ error: "Missing status" });
        return;
      }
      const sale = await updateSaleStatus(req.params.tenantId, req.params.saleId, status as any);
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

      const salesSummaryRows = await query<any>(
        `
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
              s.table_number AS tableNumber,
              COUNT(*) AS activeOrders,
              MIN(s.created_at) AS oldestOrderAt,
              SUM(s.total) AS activeOrderValue
            FROM sales s
            WHERE s.tenant_id = ?
              AND s.table_number IS NOT NULL
              AND s.table_number <> ''
              AND s.status IN ('open','kitchen','pending')
            GROUP BY s.table_number
            ORDER BY oldestOrderAt ASC
          `,
          [tenantId]
        );

        const activeTablesCountRows = await query<any>(
          `SELECT COUNT(*) AS activeTableCount FROM restaurant_tables WHERE tenant_id = ? AND status = 'active'`,
          [tenantId]
        );

        const staffRows = await query<any>(
          `
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
          `
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
            ORDER BY (pendingCount + acceptedCount) DESC, w.name ASC
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

  app.post("/api/mariadb/tenants/:tenantId/table-sections", requireAuth, async (req, res) => {
    try {
      const data = await createTableSection(req.params.tenantId, req.body);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/table-sections/:id", requireAuth, async (req, res) => {
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

  app.post("/api/mariadb/tenants/:tenantId/restaurant-tables", requireAuth, async (req, res) => {
    try {
      const data = await createRestaurantTable(req.params.tenantId, req.body);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/restaurant-tables/:id", requireAuth, async (req, res) => {
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

  app.get("/api/mariadb/customers/by-email", optionalAuth, async (req, res) => {
    try {
      const email = req.query.email as string;
      if (!email) return res.status(400).json({ error: "Email is required" });
      const rows = await query("SELECT * FROM customers WHERE email = ?", [email]);
      if (rows.length === 0) return res.json(null);
      res.json({ customer: rows[0], tenantId: rows[0].tenant_id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/products", requireAuth, async (req, res) => {
    try {
      const data = await createProduct(req.params.tenantId, req.body);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/products/:id", requireAuth, async (req, res) => {
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

  app.post("/api/mariadb/tenants/:tenantId/customers", requireAuth, async (req, res) => {
    try {
      const data = await createCustomer(req.params.tenantId, req.body);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/customers/:id", requireAuth, async (req, res) => {
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

  app.post("/api/mariadb/tenants/:tenantId/staff", requireAuth, async (req, res) => {
    try {
      const data = await createStaff(req.params.tenantId, req.body);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/staff/:id", requireAuth, async (req, res) => {
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

  app.post("/api/mariadb/tenants/:tenantId/workstations", requireAuth, async (req, res) => {
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
      const toNumber = (value: unknown): number => {
        if (typeof value === "number") return Number.isFinite(value) ? value : 0;
        if (typeof value === "string") {
          const parsed = parseFloat(value);
          return Number.isFinite(parsed) ? parsed : 0;
        }
        return 0;
      };

      const staffId = req.query.staffId as string;
      if (staffId) {
        const r: any = await getOpenCashSessionByStaff(req.params.tenantId, staffId);
        if (!r) return res.json(null);
        return res.json({
          id: r.id,
          tenantId: r.tenant_id,
          staffId: r.staff_id,
          staffName: r.staff_name,
          openedAt: r.opened_at,
          closedAt: r.closed_at,
          openingFloat: toNumber(r.opening_float),
          expectedCash: toNumber(r.expected_cash),
          actualCash: toNumber(r.actual_cash),
          difference: toNumber(r.difference),
          accumulatedTips: toNumber(r.accumulated_tips),
          netTips: toNumber(r.net_tips),
          status: r.status,
          notes: r.notes,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        });
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const rows = await query(
        "SELECT * FROM cash_sessions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?",
        [req.params.tenantId, limit]
      );

      const sessions = rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        staffId: r.staff_id,
        staffName: r.staff_name,
        openedAt: r.opened_at,
        closedAt: r.closed_at,
        openingFloat: toNumber(r.opening_float),
        expectedCash: toNumber(r.expected_cash),
        actualCash: toNumber(r.actual_cash),
        difference: toNumber(r.difference),
        accumulatedTips: toNumber(r.accumulated_tips),
        netTips: toNumber(r.net_tips),
        status: r.status,
        notes: r.notes,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
      res.json(sessions);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/cash-sessions", requireAuth, async (req, res) => {
    try {
      const id = `cs_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      await query(
        `INSERT INTO cash_sessions (
          id, tenant_id, staff_id, staff_name, opening_float, expected_cash, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          id,
          req.params.tenantId,
          req.body.staffId,
          req.body.staffName || '',
          req.body.openingFloat || 0,
          req.body.expectedCash || 0,
          req.body.status || 'open',
        ]
      );
      res.json({ id, ...req.body });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/cash-sessions/:id", requireAuth, async (req, res) => {
    try {
      const updates = req.body;
      const fields: string[] = [];
      const values: any[] = [];

      if (updates.closedAt !== undefined) { fields.push("closed_at = ?"); values.push(updates.closedAt ? new Date(updates.closedAt) : null); }
      if (updates.actualCash !== undefined) { fields.push("actual_cash = ?"); values.push(updates.actualCash); }
      if (updates.difference !== undefined) { fields.push("difference = ?"); values.push(updates.difference); }
      if (updates.accumulatedTips !== undefined) { fields.push("accumulated_tips = ?"); values.push(updates.accumulatedTips); }
      if (updates.netTips !== undefined) { fields.push("net_tips = ?"); values.push(updates.netTips); }
      if (updates.status !== undefined) { fields.push("status = ?"); values.push(updates.status); }
      if (updates.notes !== undefined) { fields.push("notes = ?"); values.push(updates.notes); }
      if (updates.expectedCash !== undefined) { fields.push("expected_cash = ?"); values.push(updates.expectedCash); }

      if (fields.length > 0) {
        fields.push("updated_at = NOW()");
        values.push(req.params.id, req.params.tenantId);
        await query(`UPDATE cash_sessions SET ${fields.join(", ")} WHERE id = ? AND tenant_id = ?`, values);
      }
      res.json({ success: true });
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
      server: { middlewareMode: true },
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
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  return app;
}

export async function startServer() {
  const app = await createApp();
  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`MariaDB-connected POS system ready`);
  });
}
