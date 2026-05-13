import dotenv from "dotenv";
import express from "express";
import path from "path";
import cors from "cors";
import bodyParser from "body-parser";
import crypto from "crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import os from "os";
import { fileURLToPath } from "url";
import { getConnection, isPostgres, query } from "./db.js";
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
} from "./mariadb-crud.js";
import {
  handleLogin,
  handleLogout,
  handleRefreshToken,
  handleGetMe,
  handleSetupPassword,
  hashPassword,
} from "./auth-handler.js";
import { generateAccessToken, generateRefreshToken, requireAuth, optionalAuth, type AuthTokenPayload } from "./auth-middleware.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPDATE_GIT_URL = "https://github.com/Lifeat-online/JPOS.git";
const UPDATE_SSH_URL = "git@github.com:Lifeat-online/JPOS.git";
const UPDATE_REPO = "Lifeat-online/JPOS";
const BUILD_ID = "jpos-update-2026-05-10-1";
const DEV_BOOTSTRAP_EMAIL = "jameskoen78@gmail.com";
const DEV_BOOTSTRAP_TENANT_ID = "default";
const DEV_BOOTSTRAP_TENANT_NAME = "Default Tenant";
const DEV_BOOTSTRAP_STAFF_ID = "admin";
const DEV_BOOTSTRAP_NAME = "Admin";

let RUNTIME_GITHUB_TOKEN: string | null = null;
const SSH_DIR = path.join(os.homedir(), ".ssh");
const SSH_KEY_PATH = path.join(SSH_DIR, "jpos_github_key");
const SSH_KNOWN_HOSTS_PATH = path.join(SSH_DIR, "known_hosts");

function hasSshKeyConfigured() {
  return existsSync(SSH_KEY_PATH);
}

function getEffectiveGithubToken() {
  return RUNTIME_GITHUB_TOKEN || process.env.GITHUB_TOKEN || null;
}

function normalizeRole(role: unknown) {
  return String(role || "").toLowerCase();
}

function canManageUpdates(role: unknown) {
  const r = normalizeRole(role);
  return r === "admin" || r === "dev";
}

function parseVersionSegments(version: string) {
  return version
    .replace(/^[^0-9]*/, "")
    .split(/[\.\-\+]/)
    .map((segment) => Number(segment.replace(/[^0-9]/g, "")) || 0);
}

function compareVersions(a: string, b: string) {
  const ap = parseVersionSegments(a);
  const bp = parseVersionSegments(b);
  const max = Math.max(ap.length, bp.length);
  for (let i = 0; i < max; i += 1) {
    const av = ap[i] ?? 0;
    const bv = bp[i] ?? 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

function runGit(
  projectRoot: string,
  args: string[],
  opts?: { ssh?: boolean; token?: string | null }
) {
  const env = { ...process.env } as Record<string, string | undefined>;
  const token = opts?.token ?? null;
  const useSsh = opts?.ssh === true;

  const finalArgs = [...args];
  if (!useSsh && token) {
    const basic = Buffer.from(`x-access-token:${token}`, "utf8").toString("base64");
    finalArgs.unshift("http.extraheader=AUTHORIZATION: basic " + basic);
    finalArgs.unshift("-c");
  }

  if (useSsh) {
    env.GIT_SSH_COMMAND =
      `ssh -i ${SSH_KEY_PATH} -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${SSH_KNOWN_HOSTS_PATH}`;
  }

  const result = spawnSync("git", finalArgs, { cwd: projectRoot, encoding: "utf8", env });
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
}

function listRemoteTags(projectRoot: string, remoteUrl: string, opts?: { ssh?: boolean; token?: string | null }) {
  const res = runGit(projectRoot, ["ls-remote", "--tags", "--refs", remoteUrl], opts);
  if (!res.ok) return { ok: false as const, tags: [] as string[], output: res.output };
  const tags = res.output
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/)[1] || "")
    .filter((ref) => ref.startsWith("refs/tags/"))
    .map((ref) => ref.replace("refs/tags/", ""));
  return { ok: true as const, tags, output: res.output };
}

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
    res.setHeader("X-JPOS-Build", BUILD_ID);
    res.setHeader("X-JPOS-Update-Repo", UPDATE_REPO);
    res.setHeader("X-JPOS-Update-Git", UPDATE_GIT_URL);
    res.json({ status: "ok" });
  });

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

  app.post("/api/dev/bootstrap-login", async (req, res) => {
    const conn = await getConnection();
    try {
      await conn.beginTransaction();

      const passwordHash = await hashPassword("devpassword");
      const pg = isPostgres();

      await conn.execute(
        pg
          ? `INSERT INTO tenants (id, name, created_at, updated_at)
             VALUES (?, ?, NOW(), NOW())
             ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()`
          : `INSERT INTO tenants (id, name, created_at, updated_at)
             VALUES (?, ?, NOW(), NOW())
             ON DUPLICATE KEY UPDATE name = VALUES(name), updated_at = NOW()`,
        [DEV_BOOTSTRAP_TENANT_ID, DEV_BOOTSTRAP_TENANT_NAME]
      );

      await conn.execute(
        pg
          ? `INSERT INTO app_settings (tenant_id, setup_completed, business, created_at, updated_at)
             VALUES (?, 1, ?, NOW(), NOW())
             ON CONFLICT (tenant_id) DO UPDATE SET setup_completed = 1, business = EXCLUDED.business, updated_at = NOW()`
          : `INSERT INTO app_settings (tenant_id, setup_completed, business, created_at, updated_at)
             VALUES (?, 1, ?, NOW(), NOW())
             ON DUPLICATE KEY UPDATE setup_completed = 1, updated_at = NOW()`,
        [DEV_BOOTSTRAP_TENANT_ID, JSON.stringify({ name: DEV_BOOTSTRAP_TENANT_NAME })]
      );

      await conn.execute(
        pg
          ? `INSERT INTO users (uid, tenant_id, email, name, created_at, updated_at)
             VALUES (?, ?, ?, ?, NOW(), NOW())
             ON CONFLICT (uid) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, email = EXCLUDED.email, name = EXCLUDED.name, updated_at = NOW()`
          : `INSERT INTO users (uid, tenant_id, email, name, created_at, updated_at)
             VALUES (?, ?, ?, ?, NOW(), NOW())
             ON DUPLICATE KEY UPDATE tenant_id = VALUES(tenant_id), email = VALUES(email), name = VALUES(name), updated_at = NOW()`,
        [DEV_BOOTSTRAP_STAFF_ID, DEV_BOOTSTRAP_TENANT_ID, DEV_BOOTSTRAP_EMAIL, DEV_BOOTSTRAP_NAME]
      );

      await conn.execute(
        pg
          ? `INSERT INTO staff (id, tenant_id, name, role, email, password_hash, status, created_at, updated_at)
             VALUES (?, ?, ?, 'dev', ?, ?, 'active', NOW(), NOW())
             ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, name = EXCLUDED.name, role = 'dev', email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, status = 'active', updated_at = NOW()`
          : `INSERT INTO staff (id, tenant_id, name, role, email, password_hash, status, created_at, updated_at)
             VALUES (?, ?, ?, 'dev', ?, ?, 'active', NOW(), NOW())
             ON DUPLICATE KEY UPDATE tenant_id = VALUES(tenant_id), name = VALUES(name), role = 'dev', email = VALUES(email), password_hash = VALUES(password_hash), status = 'active', updated_at = NOW()`,
        [DEV_BOOTSTRAP_STAFF_ID, DEV_BOOTSTRAP_TENANT_ID, DEV_BOOTSTRAP_NAME, DEV_BOOTSTRAP_EMAIL, passwordHash]
      );

      const [workstationCountRows] = await conn.execute<{ c: number }>(
        `SELECT COUNT(*) AS c FROM workstations WHERE tenant_id = ?`,
        [DEV_BOOTSTRAP_TENANT_ID]
      );
      const workstationCount = Number(workstationCountRows?.[0]?.c || 0);
      if (workstationCount === 0) {
        await conn.execute(
          `INSERT INTO workstations (id, tenant_id, name, type, status, created_at, updated_at)
           VALUES (?, ?, 'Kitchen', 'kitchen', 'active', NOW(), NOW())`,
          ["ws_default_kitchen", DEV_BOOTSTRAP_TENANT_ID]
        );
      }

      await conn.commit();

      const payload: AuthTokenPayload = {
        uid: DEV_BOOTSTRAP_STAFF_ID,
        email: DEV_BOOTSTRAP_EMAIL,
        name: DEV_BOOTSTRAP_NAME,
        tenantId: DEV_BOOTSTRAP_TENANT_ID,
        role: "dev",
        staffId: DEV_BOOTSTRAP_STAFF_ID,
      };

      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);

      return res.json({
        accessToken,
        refreshToken,
        user: {
          id: DEV_BOOTSTRAP_STAFF_ID,
          email: DEV_BOOTSTRAP_EMAIL,
          name: DEV_BOOTSTRAP_NAME,
          role: "dev",
          tenantId: DEV_BOOTSTRAP_TENANT_ID,
          tenantName: DEV_BOOTSTRAP_TENANT_NAME,
        },
      });
    } catch (err: any) {
      try {
        await conn.rollback();
      } catch {}
      return res.status(500).json({ error: err?.message || "Bootstrap login failed" });
    } finally {
      conn.release();
    }
  });

  app.post("/api/auth/login", handleLogin);
  app.post("/api/auth/logout", handleLogout);
  app.post("/api/auth/refresh", handleRefreshToken);
  app.get("/api/auth/me", requireAuth, handleGetMe);
  app.post("/api/auth/setup-password", requireAuth, handleSetupPassword);

  app.get("/api/dev/git-auth/status", requireAuth, async (req, res) => {
    if (!canManageUpdates(req.user?.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const hasSsh = hasSshKeyConfigured();
    const hasToken = !!getEffectiveGithubToken();
    const hasKnownHosts = existsSync(SSH_KNOWN_HOSTS_PATH);
    let publicKey: string | null = null;
    if (hasSsh) {
      const pub = spawnSync("ssh-keygen", ["-y", "-f", SSH_KEY_PATH], { encoding: "utf8" });
      const pubOut = `${pub.stdout || ""}`.trim();
      if (!pub.error && pub.status === 0 && pubOut) publicKey = pubOut;
    }
    return res.json({ hasSsh, hasToken, hasKnownHosts, sshKeyPath: hasSsh ? SSH_KEY_PATH : null, publicKey });
  });

  app.post("/api/dev/git-auth/token", requireAuth, async (req, res) => {
    if (!canManageUpdates(req.user?.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    RUNTIME_GITHUB_TOKEN = token.length > 0 ? token : null;
    return res.json({ success: true, hasToken: !!RUNTIME_GITHUB_TOKEN });
  });

  app.post("/api/dev/git-auth/ssh", requireAuth, async (req, res) => {
    if (!canManageUpdates(req.user?.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const privateKey = typeof req.body?.privateKey === "string" ? req.body.privateKey.trim() : "";
    const knownHosts = typeof req.body?.knownHosts === "string" ? req.body.knownHosts.trim() : "";

    try {
      mkdirSync(SSH_DIR, { recursive: true });
    } catch {}

    if (!privateKey) {
      try {
        rmSync(SSH_KEY_PATH, { force: true });
      } catch {}
      return res.json({ success: true, hasSsh: false });
    }

    try {
      writeFileSync(SSH_KEY_PATH, privateKey.endsWith("\n") ? privateKey : `${privateKey}\n`, { encoding: "utf8" });
      chmodSync(SSH_KEY_PATH, 0o600);

      const pub = spawnSync("ssh-keygen", ["-y", "-f", SSH_KEY_PATH], { encoding: "utf8" });
      const pubOut = `${pub.stdout || ""}`.trim();
      const pubErr = `${pub.stderr || ""}`.trim();
      if (pub.error || pub.status !== 0 || !pubOut) {
        try {
          rmSync(SSH_KEY_PATH, { force: true });
        } catch {}
        return res.status(400).json({ error: pubErr || "Invalid SSH private key." });
      }

      if (knownHosts) {
        writeFileSync(SSH_KNOWN_HOSTS_PATH, knownHosts.endsWith("\n") ? knownHosts : `${knownHosts}\n`, { encoding: "utf8" });
      } else {
        const scan = spawnSync("ssh-keyscan", ["github.com"], { encoding: "utf8" });
        const out = `${scan.stdout || ""}${scan.stderr || ""}`.trim();
        if (!scan.error && scan.status === 0 && out) {
          writeFileSync(SSH_KNOWN_HOSTS_PATH, out.endsWith("\n") ? out : `${out}\n`, { encoding: "utf8" });
        }
      }

      try {
        chmodSync(SSH_KNOWN_HOSTS_PATH, 0o644);
      } catch {}

      return res.json({
        success: true,
        hasSsh: true,
        hasKnownHosts: existsSync(SSH_KNOWN_HOSTS_PATH),
        publicKey: pubOut,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Failed to save SSH key." });
    }
  });

  app.post("/api/dev/git-auth/ssh/generate", requireAuth, async (req, res) => {
    if (!canManageUpdates(req.user?.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const force = req.body?.force === true;

    try {
      mkdirSync(SSH_DIR, { recursive: true });
    } catch {}

    if (existsSync(SSH_KEY_PATH) && !force) {
      return res.status(409).json({ error: "SSH key already exists." });
    }

    if (force) {
      try {
        rmSync(SSH_KEY_PATH, { force: true });
      } catch {}
    }

    const gen = spawnSync("ssh-keygen", ["-t", "ed25519", "-N", "", "-f", SSH_KEY_PATH, "-C", "jpos-updater"], { encoding: "utf8" });
    if (gen.error || gen.status !== 0) {
      const out = `${gen.stdout || ""}${gen.stderr || ""}`.trim();
      return res.status(500).json({ error: out || "Failed to generate SSH key." });
    }

    try {
      chmodSync(SSH_KEY_PATH, 0o600);
    } catch {}

    const pub = spawnSync("ssh-keygen", ["-y", "-f", SSH_KEY_PATH], { encoding: "utf8" });
    const pubOut = `${pub.stdout || ""}`.trim();
    if (pub.error || pub.status !== 0 || !pubOut) {
      try {
        rmSync(SSH_KEY_PATH, { force: true });
      } catch {}
      const out = `${pub.stdout || ""}${pub.stderr || ""}`.trim();
      return res.status(500).json({ error: out || "Failed to derive public key." });
    }

    if (!existsSync(SSH_KNOWN_HOSTS_PATH)) {
      const scan = spawnSync("ssh-keyscan", ["github.com"], { encoding: "utf8" });
      const out = `${scan.stdout || ""}${scan.stderr || ""}`.trim();
      if (!scan.error && scan.status === 0 && out) {
        try {
          writeFileSync(SSH_KNOWN_HOSTS_PATH, out.endsWith("\n") ? out : `${out}\n`, { encoding: "utf8" });
          chmodSync(SSH_KNOWN_HOSTS_PATH, 0o644);
        } catch {}
      }
    }

    return res.json({
      success: true,
      publicKey: pubOut,
      hasKnownHosts: existsSync(SSH_KNOWN_HOSTS_PATH),
    });
  });

  app.post("/api/dev/git-auth/test", requireAuth, async (req, res) => {
    if (!canManageUpdates(req.user?.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const projectRoot = path.resolve(__dirname, "..");
    const token = getEffectiveGithubToken();
    const hasSsh = hasSshKeyConfigured();

    const results: any[] = [];

    if (hasSsh) {
      const r = runGit(projectRoot, ["ls-remote", "--heads", UPDATE_SSH_URL], { ssh: true });
      results.push({ method: "ssh", ok: r.ok, output: r.ok ? "ok" : r.output });
    }

    if (token) {
      const r = runGit(projectRoot, ["ls-remote", "--heads", UPDATE_GIT_URL], { token });
      results.push({ method: "token", ok: r.ok, output: r.ok ? "ok" : r.output });
    } else {
      const r = runGit(projectRoot, ["ls-remote", "--heads", UPDATE_GIT_URL]);
      results.push({ method: "https", ok: r.ok, output: r.ok ? "ok" : r.output });
    }

    return res.json({ success: true, results });
  });

  app.get("/api/dev/check-updates", optionalAuth, async (req, res) => {
    const repo = UPDATE_REPO;
    const githubToken = getEffectiveGithubToken();
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
        const projectRoot = path.resolve(__dirname, "..");
        const primary = req.query?.primary === "token" ? "token" : "ssh";
        const methods = primary === "ssh" ? ["ssh", "https"] : ["https", "ssh"];
        const token = githubToken;

        for (const m of methods) {
          if (m === "ssh" && hasSshKeyConfigured()) {
            const tags = listRemoteTags(projectRoot, UPDATE_SSH_URL, { ssh: true });
            if (tags.ok && tags.tags.length > 0) {
              const latest = tags.tags.sort((a, b) => compareVersions(b, a))[0];
              return res.json({
                latestVersion: latest,
                latestUrl: `https://github.com/${repo}/releases/tag/${latest}`,
                notes: "",
                publishedAt: null,
                source: "git-ssh",
              });
            }
          }

          if (m === "https") {
            const tags = listRemoteTags(projectRoot, UPDATE_GIT_URL, { token });
            if (tags.ok && tags.tags.length > 0) {
              const latest = tags.tags.sort((a, b) => compareVersions(b, a))[0];
              return res.json({
                latestVersion: latest,
                latestUrl: `https://github.com/${repo}/releases/tag/${latest}`,
                notes: "",
                publishedAt: null,
                source: token ? "git-token" : "git-https",
              });
            }
          }
        }

        return res.json({ error: responseText || "Failed to check for updates.", upstreamStatus: githubResponse.status });
      }

      const latestData = JSON.parse(responseText);
      return res.json({
        latestVersion: latestData.tag_name,
        latestUrl: latestData.html_url,
        notes: latestData.body || '',
        publishedAt: latestData.published_at,
        source: "github-release",
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to check for updates" });
    }
  });

  app.post("/api/dev/update", optionalAuth, async (req, res) => {
    if (isTest) {
      return res.status(501).json({ error: "Update endpoint not available in test mode." });
    }

    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Updates disabled in production" });
    }

    const projectRoot = path.resolve(__dirname, "..");
    const gitDir = path.join(projectRoot, ".git");
    if (!existsSync(gitDir)) {
      return res.status(400).json({ error: "Project is not a git repository (.git not found)." });
    }

    const token = getEffectiveGithubToken();
    const hasSsh = hasSshKeyConfigured();
    const primary = typeof req.body?.primary === "string" && req.body.primary === "token" ? "token" : "ssh";
    const methods = primary === "ssh" ? ["ssh", "https"] : ["https", "ssh"];

    const attempt = (method: "ssh" | "https") => {
      const steps: string[] = [];
      const record = (cmd: string, output: string) => {
        steps.push(`$ git ${cmd}${output ? `\n${output}` : ""}`.trim());
      };

      const auth =
        method === "ssh"
          ? ({ ssh: true } as const)
          : token
            ? ({ token } as const)
            : ({} as const);

      const remoteUrl = method === "ssh" ? UPDATE_SSH_URL : UPDATE_GIT_URL;

      const setOrigin = runGit(projectRoot, ["remote", "set-url", "origin", remoteUrl], auth);
      record(`remote set-url origin ${method === "ssh" ? "ssh" : "https"}`, setOrigin.output);
      if (!setOrigin.ok) {
        const addOrigin = runGit(projectRoot, ["remote", "add", "origin", remoteUrl], auth);
        record(`remote add origin ${method === "ssh" ? "ssh" : "https"}`, addOrigin.output);
        if (!addOrigin.ok) return { ok: false as const, steps, error: "Failed to set origin remote URL." };
      }

      const fetchOrigin = runGit(projectRoot, ["fetch", "--prune", "origin"], auth);
      record("fetch --prune origin", fetchOrigin.output);
      if (!fetchOrigin.ok) return { ok: false as const, steps, error: "Git fetch failed." };

      const branch = runGit(projectRoot, ["branch", "--show-current"], auth);
      record("branch --show-current", branch.output);

      const currentBranch = branch.ok ? branch.output.trim() : "";
      if (currentBranch) {
        const upstream = runGit(projectRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], auth);
        record("rev-parse --abbrev-ref --symbolic-full-name @{u}", upstream.output);
        if (!upstream.ok) {
          const setUpstream = runGit(projectRoot, ["branch", "--set-upstream-to", `origin/${currentBranch}`, currentBranch], auth);
          record(`branch --set-upstream-to origin/${currentBranch} ${currentBranch}`, setUpstream.output);
          if (!setUpstream.ok) return { ok: false as const, steps, error: "Failed to set upstream branch." };
        }
      }

      const pull = runGit(projectRoot, ["pull", "--ff-only"], auth);
      record("pull --ff-only", pull.output);
      if (!pull.ok) return { ok: false as const, steps, error: "Git pull failed." };

      return { ok: true as const, steps };
    };

    const failures: any[] = [];

    for (const m of methods) {
      if (m === "ssh" && !hasSsh) continue;
      const r = attempt(m as "ssh" | "https");
      if (r.ok) return res.json({ success: true, method: m, output: r.steps.join("\n\n") });
      failures.push({ method: m, error: (r as any).error || "failed", output: r.steps.join("\n\n") });
    }

    return res.status(500).json({
      success: false,
      error: "Update failed using available authentication methods.",
      failures,
    });
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
                ORDER BY (pendingCount + acceptedCount) DESC, w.name ASC
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

  return app;
}

  export async function startServer() {
    const app = await createApp();
    const PORT = Number(process.env.PORT || 8080);
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
      console.log(`MariaDB-connected POS system ready`);
      console.log(`__dirname is: ${__dirname}`);
      console.log(`distDir is: ${path.resolve(__dirname, '..', 'dist')}`);
    });
  }
