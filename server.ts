import dotenv from "dotenv";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import bodyParser from "body-parser";
import crypto from "crypto";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { fileURLToPath } from "url";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Firebase Config
let firebaseConfig: any = {};
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (err) {
  console.error("Critical: Could not load firebase-applet-config.json", err);
}

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    admin.initializeApp(); // Use environment defaults for maximum compatibility in AI Studio
  } catch (err) {
    console.error("Firebase Admin initialization failed:", err);
  }
}

// Get Firestore instance
// In modular admin SDK, getFirestore takes (databaseId) or (app, databaseId)
const db = firebaseConfig.firestoreDatabaseId 
  ? getFirestore(firebaseConfig.firestoreDatabaseId)
  : getFirestore();

// PayFast Logic
let PAYFAST_MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID || "10000100";
let PAYFAST_MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY || "46f0cd694581a";
let PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE || "jt7v60h69n8a1";
let PAYFAST_SANDBOX = process.env.PAYFAST_SANDBOX === "true";

async function getAppConfig() {
  try {
    const configDoc = await db.doc('config/primary').get();
    if (configDoc.exists) {
      const data = configDoc.data();
      return {
        merchant_id: data?.payfastMerchantId || PAYFAST_MERCHANT_ID,
        merchant_key: data?.payfastMerchantKey || PAYFAST_MERCHANT_KEY,
        passphrase: data?.payfastPassphrase || PAYFAST_PASSPHRASE,
        sandbox: data?.payfastSandbox !== undefined ? data?.payfastSandbox : PAYFAST_SANDBOX
      };
    }
  } catch (err) {
    console.error("Error fetching config from Firestore:", err);
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
                  repoUrl: `https://github.com/${repo}`,
                });
              }
            } catch (parseErr) {
              // Tags endpoint also failed parsing
            }
          }

          return res.status(404).json({
            error: githubToken
              ? `Repository not found on GitHub: ${repo}\n\nVerify the repository name and ensure your GitHub token has access.`
              : `Repository not found on GitHub: ${repo}\n\nFor private repositories, set the GITHUB_TOKEN environment variable with a personal access token (repo scope).`,
            repo,
          });
        }

        if (githubResponse.status === 403) {
          const json = (() => {
            try {
              return JSON.parse(responseText);
            } catch {
              return {};
            }
          })();

          if (json.message?.includes('API rate limit')) {
            return res.status(429).json({
              error: "GitHub API rate limit exceeded. Please try again later.",
              details: "Rate limit: 60 requests per hour for unauthenticated, 5000 for authenticated",
            });
          }

          if (json.message?.includes('token')) {
            return res.status(403).json({
              error: "GitHub token is invalid or expired. Check your GITHUB_TOKEN environment variable.",
              details: json.message,
            });
          }

          return res.status(403).json({
            error: "Access denied. Check GitHub token permissions (repo scope required).",
            details: json.message || "403 Forbidden",
          });
        }

        return res.status(githubResponse.status).json({
          error: `GitHub API error: ${githubResponse.status}`,
          details: responseText.substring(0, 200),
        });
      }

      if (!contentType.includes('application/json')) {
        return res.status(502).json({
          error: "Invalid response from GitHub API (not JSON)",
          contentType,
        });
      }

      try {
        const json = JSON.parse(responseText);
        return res.json({
          latestVersion: json.tag_name || json.name || null,
          latestUrl: json.html_url || `https://github.com/${repo}`,
          notes: json.body || '',
          publishedAt: json.published_at || json.created_at || null,
          repoUrl: `https://github.com/${repo}`,
        });
      } catch (parseErr) {
        return res.status(502).json({
          error: "Failed to parse GitHub API response",
          details: responseText.substring(0, 200),
        });
      }
    } catch (err) {
      console.error("Update check error:", err);
      return res.status(500).json({
        error: "Unable to check GitHub updates.",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post("/api/dev/update", async (req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Update actions are disabled in production." });
    }

    try {
      const { stdout, stderr } = await execFileAsync("git", ["pull", "--ff-only"], {
        cwd: process.cwd(),
      });

      return res.json({
        success: true,
        output: stdout.toString().trim(),
        error: stderr.toString().trim(),
      });
    } catch (err) {
      const error = err as any;
      return res.status(500).json({
        success: false,
        error: error.message || "Git update failed.",
        output: error.stdout ? error.stdout.toString().trim() : '',
        details: error.stderr ? error.stderr.toString().trim() : '',
      });
    }
  });

  // Generate PayFast Payment Data
  app.post("/api/payfast/generate", async (req, res) => {
    const { amount, item_name, sale_id, return_url, cancel_url } = req.body;
    
    const config = await getAppConfig();
    const APP_URL = process.env.APP_URL || "http://localhost:3000";
    const notify_url = `${APP_URL}/api/payfast/notify`;
    const PAYFAST_URL = config.sandbox ? "https://sandbox.payfast.co.za/eng/process" : "https://www.payfast.co.za/eng/process";

    const data: any = {
      merchant_id: config.merchant_id,
      merchant_key: config.merchant_key,
      return_url,
      cancel_url,
      notify_url,
      amount: parseFloat(amount).toFixed(2),
      item_name,
      m_payment_id: sale_id,
    };

    data.signature = generatePayFastSignature(data, config.passphrase);

    res.json({
      url: PAYFAST_URL,
      fields: data
    });
  });

  // PayFast Notify Webhook (ITN)
  app.post("/api/payfast/notify", async (req, res) => {
    console.log("PayFast Notify Received:", req.body);
    
    const submittedSignature = req.body.signature;
    if (!submittedSignature) {
       return res.status(400).send("Bad Request: Missing Signature");
    }
    
    const config = await getAppConfig();
    const dataObj = { ...req.body };
    delete dataObj.signature;

    const expectedSignature = generatePayFastSignature(dataObj, config.passphrase);

    if (submittedSignature !== expectedSignature) {
       console.error("Signature Mismatch!", { expected: expectedSignature, received: submittedSignature });
       return res.status(400).send("Bad Request: Invalid Signature");
    }

    const { m_payment_id, payment_status, pf_payment_id } = req.body;

    if (payment_status === "COMPLETE") {
      try {
        const saleRef = db.doc(`sales/${m_payment_id}`);
        await saleRef.update({
          status: "completed",
          payfast_payment_id: pf_payment_id,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`Sale ${m_payment_id} marked as completed.`);
      } catch (error) {
        console.error("Error updating sale status:", error);
      }
    }

    res.status(200).send("OK");
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
