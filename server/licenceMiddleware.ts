import { Request, Response, NextFunction } from "express";
import fs from "fs";
import http from "http";
import https from "https";
import os from "os";
import path from "path";
import { LicenceFeature, LicencePayload, verifyLicenceKey } from "./licenceKey.js";

const DEFAULT_LICENCE_SERVER_URL = "https://masepos.co.za";
const LICENCE_SERVER_URL = (process.env.JPOS_LICENCE_SERVER || DEFAULT_LICENCE_SERVER_URL).replace(/\/+$/, "");
const LICENCE_KEY = process.env.LICENCE_KEY || "";
const LICENCE_SECRET = process.env.LICENCE_SECRET || "";
const GRACE_PERIOD_DAYS = Number(process.env.JPOS_LICENCE_GRACE_DAYS || 7);
const REVALIDATE_INTERVAL = Number(process.env.JPOS_LICENCE_RECHECK_MS || 24 * 60 * 60 * 1000);
const CACHE_FILE = process.env.JPOS_LICENCE_CACHE_FILE || path.join(os.tmpdir(), ".jpos_licence_cache");
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

interface LicenceState {
  enabled: boolean;
  valid: boolean;
  payload: LicencePayload | null;
  lastOnlineCheck: number;
  lastOnlineSuccess: number;
  lockedOut: boolean;
  reason: string;
}

let intervalHandle: NodeJS.Timeout | null = null;

const state: LicenceState = {
  enabled: false,
  valid: false,
  payload: null,
  lastOnlineCheck: 0,
  lastOnlineSuccess: 0,
  lockedOut: false,
  reason: "Licence enforcement is not enabled",
};

export function shouldEnforceLicence(): boolean {
  if (process.env.JPOS_HOSTED === "true") return false;
  return process.env.JPOS_REQUIRE_LICENCE === "true" || Boolean(LICENCE_KEY);
}

export async function initialiseLicence(): Promise<void> {
  state.enabled = shouldEnforceLicence();
  if (!state.enabled) {
    return;
  }

  console.log("[Licence] Initialising self-hosted licence checks...");

  if (!LICENCE_KEY) {
    lockOut("No LICENCE_KEY set. Set LICENCE_KEY in the customer environment.");
    return;
  }

  const offlineResult = verifyLicenceKey(LICENCE_KEY, LICENCE_SECRET);
  if (!offlineResult.valid || !offlineResult.payload) {
    lockOut(`Invalid licence key: ${offlineResult.error || "unknown error"}`);
    return;
  }

  state.payload = offlineResult.payload;
  state.valid = true;
  state.lockedOut = false;
  state.reason = "Offline licence check passed";
  loadCache();
  await performOnlineCheck();

  if (!intervalHandle) {
    intervalHandle = setInterval(() => {
      performOnlineCheck().catch((err) => {
        console.warn("[Licence] Scheduled online check failed:", err?.message || err);
      });
    }, REVALIDATE_INTERVAL);
    intervalHandle.unref?.();
  }

  if (!state.lockedOut && state.payload) {
    console.log(`[Licence] Valid for "${state.payload.tenantName}" (${state.payload.tier})`);
  }
}

export function getLicenceInfo() {
  return {
    enabled: state.enabled,
    valid: state.valid && !state.lockedOut,
    lockedOut: state.lockedOut,
    reason: state.reason,
    lastOnlineCheck: state.lastOnlineCheck,
    lastOnlineSuccess: state.lastOnlineSuccess,
    payload: state.payload,
  };
}

export function requireValidLicence(req: Request, res: Response, next: NextFunction): void {
  if (!state.enabled || !state.lockedOut || !WRITE_METHODS.has(req.method) || isLicenceAllowlisted(req.path)) {
    next();
    return;
  }

  res.status(402).json({
    error: "Licence invalid",
    reason: state.reason,
    mode: "read_only",
    contact: "contact@lifeat.online",
  });
}

export function checkFeature(feature: LicenceFeature) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!state.enabled) {
      next();
      return;
    }

    if (!state.payload?.features.includes(feature)) {
      res.status(403).json({
        error: "Feature not available on your licence",
        feature,
        upgrade: "Contact support to upgrade your licence",
      });
      return;
    }

    next();
  };
}

export function checkRegisterLimit(currentActiveRegisters: number): boolean {
  if (!state.enabled) return true;
  if (!state.payload) return false;
  if (state.payload.maxRegisters === -1) return true;
  return currentActiveRegisters < state.payload.maxRegisters;
}

async function performOnlineCheck(): Promise<void> {
  if (!state.payload) return;

  state.lastOnlineCheck = Date.now();

  try {
    const result = await fetchRevocationStatus(state.payload.licenceId);
    if (!result.valid) {
      lockOut(result.reason || "Licence revoked");
      return;
    }

    state.lastOnlineSuccess = Date.now();
    state.valid = true;
    state.lockedOut = false;
    state.reason = "Licence online validation passed";
    saveCache();
  } catch (err) {
    console.warn("[Licence] Online validation unavailable:", (err as Error).message);
    applyGracePeriod();
  }
}

function applyGracePeriod(): void {
  const elapsed = Date.now() - state.lastOnlineSuccess;
  const graceMs = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

  if (state.lastOnlineSuccess === 0) {
    lockOut(`Cannot verify licence online. Ensure this server can reach ${LICENCE_SERVER_URL}.`);
    return;
  }

  if (elapsed > graceMs) {
    lockOut(`Licence server unreachable for more than ${GRACE_PERIOD_DAYS} days.`);
    return;
  }

  const daysLeft = Math.max(0, Math.ceil((graceMs - elapsed) / (24 * 60 * 60 * 1000)));
  state.valid = true;
  state.lockedOut = false;
  state.reason = `Licence grace period active: ${daysLeft} day(s) remaining`;
}

function fetchRevocationStatus(licenceId: string): Promise<{ valid: boolean; reason?: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`/api/licence/validate/${encodeURIComponent(licenceId)}`, LICENCE_SERVER_URL);
    const client = url.protocol === "http:" ? http : https;
    const req = client.get(url, { timeout: 10000 }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error("Invalid response from licence server"));
        }
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error("Licence validation timed out"));
    });
    req.on("error", reject);
  });
}

function saveCache(): void {
  try {
    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify({
        licenceId: state.payload?.licenceId,
        lastOnlineSuccess: state.lastOnlineSuccess,
      })
    );
  } catch {
    // Cache persistence is best-effort only.
  }
}

function loadCache(): void {
  try {
    const cached = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    if (cached.licenceId === state.payload?.licenceId && Number.isFinite(cached.lastOnlineSuccess)) {
      state.lastOnlineSuccess = cached.lastOnlineSuccess;
    }
  } catch {
    // No cache yet.
  }
}

function lockOut(reason: string): void {
  state.valid = false;
  state.lockedOut = true;
  state.reason = reason;
  console.error(`[Licence] Locked: ${reason}`);
}

function isLicenceAllowlisted(pathname: string): boolean {
  return (
    pathname === "/health" ||
    pathname === "/licence/info" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/licence/validate/")
  );
}
