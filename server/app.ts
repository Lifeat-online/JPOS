import dotenv from "dotenv";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import bodyParser from "body-parser";
import crypto from "crypto";
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

    const repo = "Lifeat-online/Jimmy-s-POS";
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

    res.status(501).json({ error: "Update endpoint not available in test mode." });
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

  app.put("/api/mariadb/tenants/:tenantId/sales/:saleId/items/:itemId", requireAuth, async (req, res) => {
    try {
      await updateSaleItem(req.params.tenantId, req.params.saleId, req.params.itemId, req.body);
      res.json({ success: true });
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
      const staffId = req.query.staffId as string;
      if (staffId) {
        const session = await getOpenCashSessionByStaff(req.params.tenantId, staffId);
        return res.json(session || null);
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
        openingFloat: r.opening_float,
        expectedCash: r.expected_cash,
        actualCash: r.actual_cash,
        difference: r.difference,
        accumulatedTips: r.accumulated_tips,
        netTips: r.net_tips,
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
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (isProduction) {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
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
