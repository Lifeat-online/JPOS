import crypto from "crypto";
import { Router } from "express";
import { Request } from "express";
import { requireAuth } from "../auth-middleware.js";
import { getAppConfigByTenant } from "../db-adapter.js";
import { sensitiveRouteRateLimit } from "./_helpers.js";

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
    res.status(500).json({ error: err.message });
  }
});

payfastRouter.post("/notify", sensitiveRouteRateLimit, async (req, res) => {
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
