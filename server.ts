import dotenv from "dotenv";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import bodyParser from "body-parser";
import crypto from "crypto";
import { fileURLToPath } from "url";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { query } from "./server/db.ts";
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
} from "./server/mariadb-adapter.ts";
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
  createSale,
  updateSaleStatus,
  getSaleById,
} from "./server/mariadb-crud.ts";
import {
  handleLogin,
  handleLogout,
  handleRefreshToken,
  handleGetMe,
  handleSetupPassword,
} from "./server/auth-handler.ts";
import { requireAuth, optionalAuth } from "./server/auth-middleware.ts";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// PayFast Logic
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
        sandbox: config.payfastSandbox !== undefined ? config.payfastSandbox : PAYFAST_SANDBOX
      };
    }
  } catch (err) {
    console.error("Error fetching config from database:", err);
  }
  return {
    merchant_id: PAYFAST_MERCHANT_ID,
    merchant_key: PAYFAST_MERCHANT_KEY,
    passphrase: PAYFAST_PASSPHRASE,
    sandbox: PAYFAST_SANDBOX
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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Auth Routes
  app.post("/api/auth/login", handleLogin);
  app.post("/api/auth/logout", handleLogout);
  app.post("/api/auth/refresh", handleRefreshToken);
  app.get("/api/auth/me", requireAuth, handleGetMe);
  app.post("/api/auth/setup-password", requireAuth, handleSetupPassword);

  const execFileAsync = promisify(execFile);

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

      const contentType = githubResponse.headers.get('content-type') || '';
      const responseText = await githubResponse.text();

      if (!githubResponse.ok) {
        if (githubResponse.status === 404) {
          // Try fallback to tags endpoint
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
              // Tags endpoint also failed parsing
            }
          }

          return res.status(404).json({ error: "Repository not found or no releases available." });
        }

        return res.status(githubResponse.status).json({ error: responseText });
      }

      let latestData;
      try {
        latestData = JSON.parse(responseText);
      } catch (parseErr) {
        return res.status(500).json({ error: "Failed to parse GitHub response" });
      }

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

    try {
      const { stdout, stderr } = await execFileAsync('git', ['pull'], { cwd: __dirname });

      return res.json({
        success: true,
        output: stdout + (stderr ? "\n" + stderr : ""),
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: "Update command failed.",
        output: err.stdout || '',
        details: err.message,
      });
    }
  });

  // MariaDB API Routes
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
      const sales = await getActiveSalesByTenant(req.params.tenantId);
      res.json(sales);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/cash-sessions", optionalAuth, async (req, res) => {
    try {
      const staffId = req.query.staffId as string;
      if (!staffId) {
        return res.status(400).json({ error: "staffId query parameter is required" });
      }
      const session = await getOpenCashSessionByStaff(req.params.tenantId, staffId);
      res.json(session || null);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PayFast webhook
  app.post("/api/payfast/notify", async (req, res) => {
    try {
      const {
        m_payment_id,
        pf_payment_id,
        payment_status,
        signature,
        ...otherData
      } = req.body;

      // Verify signature
      const calculatedSignature = generatePayFastSignature(
        { m_payment_id, pf_payment_id, payment_status, ...otherData },
        PAYFAST_PASSPHRASE
      );

      if (signature !== calculatedSignature) {
        console.warn("Invalid PayFast signature");
        return res.status(400).send("Invalid signature");
      }

      if (payment_status === "COMPLETE") {
        // Update sale status in database
        // This would need the tenantId - you might need to store it in m_payment_id or lookup by pf_payment_id
        console.log("Payment completed:", pf_payment_id);
      }

      res.status(200).send("OK");
    } catch (err: any) {
      console.error("PayFast webhook error:", err);
      res.status(500).send("Internal Server Error");
    }
  });

  // Vite dev server integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer(app, {
      server: { middlewareMode: true },
    });
    
    app.use(vite.middlewares);
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`MariaDB-connected POS system ready`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
