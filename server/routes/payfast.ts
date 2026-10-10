import crypto from "crypto";
import { Router } from "express";
import { Request } from "express";
import { requireAuth } from "../auth-middleware.js";
import { getAppConfigByTenant } from "../db-adapter.js";
import { sensitiveRouteRateLimit } from "./_helpers.js";
import { sendRouteError } from "../securityHardening.js";
import { query } from "../db.js";
import { updateSale } from "../db-crud.js";
import { broadcastSalesUpdate } from "../socket.js";
import { recordAuditEventSafe } from "../audit.js";

const PAYFAST_MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID;
const PAYFAST_MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY;
const PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE;
const PAYFAST_SANDBOX = process.env.PAYFAST_SANDBOX === "true";

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

// PayFast signs with PHP urlencode(): spaces become "+" and !'()*~ are escaped.
function phpUrlEncode(value: unknown) {
  return encodeURIComponent(String(value ?? ""))
    .replace(/[!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, "+");
}

function md5(value: string) {
  return crypto.createHash("md5").update(value).digest("hex");
}

function withPassphrase(paramString: string, passphrase?: string | null) {
  return passphrase ? `${paramString}&passphrase=${phpUrlEncode(passphrase.trim())}` : paramString;
}

// Checkout form signature: non-empty fields in the order they are sent.
function generatePayFastSignature(data: Record<string, unknown>, passphrase?: string | null) {
  const paramString = Object.keys(data)
    .filter((key) => key !== "signature" && data[key] !== "")
    .map((key) => `${key}=${phpUrlEncode(data[key])}`)
    .join("&");
  return md5(withPassphrase(paramString, passphrase));
}

// ITN parameter string: every posted field in the order received, up to the signature.
function itnParamString(body: Record<string, unknown>) {
  const parts: string[] = [];
  for (const key of Object.keys(body)) {
    if (key === "signature") break;
    parts.push(`${key}=${phpUrlEncode(body[key])}`);
  }
  return parts.join("&");
}

function signaturesMatch(expected: string, received: string) {
  const a = Buffer.from(expected.toLowerCase());
  const b = Buffer.from(received.toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Server-to-server confirmation that PayFast actually sent this notification.
async function confirmWithPayFast(paramString: string, sandbox: boolean) {
  const host = sandbox ? "sandbox.payfast.co.za" : "www.payfast.co.za";
  try {
    const response = await fetch(`https://${host}/eng/query/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: paramString,
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok && (await response.text()).trim() === "VALID";
  } catch (err) {
    console.warn("PayFast validation request failed:", err);
    return false;
  }
}

const toCents = (value: unknown) => Math.round(Number(value || 0) * 100);

function getPublicBaseUrl(req: Request) {
  const configured = String(process.env.PUBLIC_APP_URL || process.env.APP_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  const forwardedProto = String(req.get("x-forwarded-proto") || "").split(",")[0]?.trim();
  const protocol = forwardedProto || req.protocol || "https";
  const host = req.get("host");
  return host ? `${protocol}://${host}` : "";
}

function safePayFastText(value: unknown, fallback: string, maxLength = 100) {
  const text = String(value || "").trim();
  return (text || fallback).slice(0, maxLength);
}

export const payfastRouter = Router();

payfastRouter.post("/generate", requireAuth, async (req, res) => {
  try {
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: "Valid amount is required" });
      return;
    }
    const config = await getAppConfig(req.user!.tenantId);
    if (!config.merchant_id || !config.merchant_key) {
      res.status(400).json({ error: "PayFast credentials are not configured" });
      return;
    }
    const publicBaseUrl = getPublicBaseUrl(req);
    const fields: Record<string, string> = {
      merchant_id: String(config.merchant_id),
      merchant_key: String(config.merchant_key),
      amount: amount.toFixed(2),
      item_name: safePayFastText(req.body?.item_name || req.body?.itemName, "MasePOS Purchase"),
    };
    const saleId = safePayFastText(req.body?.sale_id || req.body?.saleId, "", 64);
    if (saleId) fields.m_payment_id = saleId;
    if (req.body?.return_url) fields.return_url = String(req.body.return_url);
    if (req.body?.cancel_url) fields.cancel_url = String(req.body.cancel_url);
    if (publicBaseUrl) fields.notify_url = `${publicBaseUrl}/api/payfast/notify`;
    fields.signature = generatePayFastSignature(fields, config.passphrase);
    res.json({
      url: config.sandbox ? "https://sandbox.payfast.co.za/eng/process" : "https://www.payfast.co.za/eng/process",
      fields,
    });
  } catch (err: any) {
    sendRouteError(res, err, req);
  }
});

payfastRouter.post("/notify", sensitiveRouteRateLimit, async (req, res) => {
  // PayFast retries until it gets a 200, so answer 200 for anything already
  // handled and 400 (without detail) for notifications that fail validation.
  try {
    const body: Record<string, unknown> = req.body && typeof req.body === "object" ? req.body : {};
    const saleId = String(body.m_payment_id || "").trim();
    const signature = String(body.signature || "").trim();
    if (!saleId || !signature) return res.status(400).send("Invalid notification");

    const [sale] = await query<any>(
      `SELECT id, tenant_id AS "tenantId", total, status FROM sales WHERE id = $1 LIMIT 1`,
      [saleId],
    );
    if (!sale) return res.status(400).send("Invalid notification");

    const config = await getAppConfig(sale.tenantId);
    const paramString = itnParamString(body);
    const rejection =
      !signaturesMatch(md5(withPassphrase(paramString, config.passphrase)), signature) ? "signature"
      : config.merchant_id && String(body.merchant_id || "") !== String(config.merchant_id) ? "merchant"
      : Math.abs(toCents(body.amount_gross) - toCents(sale.total)) > 1 ? "amount"
      : !(await confirmWithPayFast(paramString, Boolean(config.sandbox))) ? "validation"
      : null;
    if (rejection) {
      console.warn(`PayFast ITN rejected (${rejection}) for sale ${saleId}`);
      await recordAuditEventSafe({
        tenantId: sale.tenantId,
        action: "payfast.itn_rejected",
        entityType: "sale",
        entityId: saleId,
        relatedSaleId: saleId,
        source: "payfast",
        details: { reason: rejection, pfPaymentId: body.pf_payment_id || null, paymentStatus: body.payment_status || null },
      });
      return res.status(400).send("Invalid notification");
    }

    const paymentStatus = String(body.payment_status || "").toUpperCase();
    if (sale.status === "pending" && (paymentStatus === "COMPLETE" || paymentStatus === "CANCELLED" || paymentStatus === "FAILED")) {
      await updateSale(sale.tenantId, saleId, paymentStatus === "COMPLETE"
        ? { status: "completed", paymentMethod: "payfast", payfast_payment_id: String(body.pf_payment_id || "") } as any
        : { status: "failed" } as any);
      const io = req.app.get("io");
      if (io) broadcastSalesUpdate(io, sale.tenantId, saleId);
    }
    res.status(200).send("OK");
  } catch (err: any) {
    console.error("PayFast webhook error:", err);
    res.status(500).send("Internal Server Error");
  }
});
