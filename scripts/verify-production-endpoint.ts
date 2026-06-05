import tls from "node:tls";
import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";

export type TlsProbeResult = {
  authorized: boolean;
  authorizationError: string | null;
  protocol: string | null;
  cipher: string | null;
  validFrom: string | null;
  validTo: string | null;
  subjectAltName: string | null;
};

export type EndpointCheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

export type EndpointVerificationResult = {
  url: string;
  checkedAt: string;
  ok: boolean;
  tls: TlsProbeResult | null;
  checks: EndpointCheckResult[];
};

export type EndpointVerifierOptions = {
  timeoutMs?: number;
  allowHttp?: boolean;
  fetchImpl?: typeof fetch;
  tlsProbe?: (url: URL, timeoutMs: number) => Promise<TlsProbeResult>;
  checkedAt?: string;
};

const REQUIRED_HEADERS = [
  "strict-transport-security",
  "x-frame-options",
  "x-content-type-options",
  "content-security-policy",
  "referrer-policy",
];

function addCheck(checks: EndpointCheckResult[], name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
}

export function parseEndpointArgs(argv: string[]) {
  const options: { url?: string; timeoutMs?: number; allowHttp?: boolean } = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--url" && argv[i + 1]) {
      options.url = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--url=")) {
      options.url = arg.slice("--url=".length);
    } else if (arg === "--timeout-ms" && argv[i + 1]) {
      options.timeoutMs = Number(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith("--timeout-ms=")) {
      options.timeoutMs = Number(arg.slice("--timeout-ms=".length));
    } else if (arg === "--allow-http") {
      options.allowHttp = true;
    }
  }
  return options;
}

export function normalizeProductionUrl(input: string | undefined) {
  const raw = String(input || "").trim().replace(/\/+$/, "");
  if (!raw) {
    throw new Error("Set PRODUCTION_BASE_URL or pass --url https://example.com");
  }
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  return new URL(withProtocol);
}

export function supportsModernTlsProtocol(protocol: string | null) {
  return protocol === "TLSv1.2" || protocol === "TLSv1.3";
}

export async function probeTls(url: URL, timeoutMs: number): Promise<TlsProbeResult> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: url.hostname,
      port: Number(url.port || 443),
      servername: url.hostname,
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
    });

    const timer = setTimeout(() => {
      socket.destroy(new Error(`TLS probe timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.once("secureConnect", () => {
      clearTimeout(timer);
      const cert = socket.getPeerCertificate();
      const cipher = socket.getCipher();
      const result: TlsProbeResult = {
        authorized: socket.authorized,
        authorizationError: socket.authorizationError ? String(socket.authorizationError) : null,
        protocol: socket.getProtocol(),
        cipher: cipher?.name || null,
        validFrom: cert?.valid_from || null,
        validTo: cert?.valid_to || null,
        subjectAltName: typeof cert?.subjectaltname === "string" ? cert.subjectaltname : null,
      };
      socket.end();
      resolve(result);
    });

    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function fetchWithTimeout(fetchImpl: typeof fetch, url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "application/json,text/html;q=0.9,*/*;q=0.8" },
    });
  } finally {
    clearTimeout(timer);
  }
}

function sameOriginPath(baseUrl: URL, pathname: string) {
  const next = new URL(baseUrl.toString());
  next.pathname = pathname;
  next.search = "";
  next.hash = "";
  return next.toString();
}

async function parseHealth(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;
  try {
    return await response.json() as { status?: string };
  } catch {
    return null;
  }
}

export async function verifyProductionEndpoint(
  baseUrl: URL,
  options: EndpointVerifierOptions = {}
): Promise<EndpointVerificationResult> {
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : 10000;
  const fetchImpl = options.fetchImpl || fetch;
  const tlsProbe = options.tlsProbe || probeTls;
  const checks: EndpointCheckResult[] = [];
  let tlsResult: TlsProbeResult | null = null;

  addCheck(checks, "https-url", options.allowHttp || baseUrl.protocol === "https:", `scheme=${baseUrl.protocol.replace(":", "")}`);

  if (baseUrl.protocol === "https:") {
    try {
      tlsResult = await tlsProbe(baseUrl, timeoutMs);
      addCheck(checks, "tls-authorized", tlsResult.authorized, tlsResult.authorizationError || "certificate authorized");
      addCheck(checks, "tls-protocol", supportsModernTlsProtocol(tlsResult.protocol), tlsResult.protocol || "unknown protocol");
      addCheck(checks, "tls-certificate-date", Boolean(tlsResult.validTo), tlsResult.validTo ? `valid to ${tlsResult.validTo}` : "missing certificate validity");
    } catch (error) {
      addCheck(checks, "tls-probe", false, error instanceof Error ? error.message : String(error));
    }
  }

  try {
    const appResponse = await fetchWithTimeout(fetchImpl, baseUrl.toString(), timeoutMs);
    addCheck(checks, "app-response", appResponse.status >= 200 && appResponse.status < 400, `status=${appResponse.status}`);
    for (const header of REQUIRED_HEADERS) {
      addCheck(checks, `header:${header}`, appResponse.headers.has(header), appResponse.headers.get(header) || "missing");
    }
  } catch (error) {
    addCheck(checks, "app-response", false, error instanceof Error ? error.message : String(error));
  }

  try {
    const healthUrl = sameOriginPath(baseUrl, "/api/health");
    const healthResponse = await fetchWithTimeout(fetchImpl, healthUrl, timeoutMs);
    const body = await parseHealth(healthResponse);
    const healthy = healthResponse.status === 200 && body?.status === "ok";
    addCheck(checks, "api-health", healthy, `status=${healthResponse.status}; body.status=${body?.status || "unknown"}`);
  } catch (error) {
    addCheck(checks, "api-health", false, error instanceof Error ? error.message : String(error));
  }

  return {
    url: baseUrl.toString(),
    checkedAt: options.checkedAt || new Date().toISOString(),
    ok: checks.every((check) => check.ok),
    tls: tlsResult,
    checks,
  };
}

export function summarizeEndpointVerification(result: EndpointVerificationResult) {
  if (result.ok) {
    return `Production endpoint verification passed for ${result.url}: ${result.checks.length} checks passed.`;
  }
  const failed = result.checks
    .filter((check) => !check.ok)
    .map((check) => `${check.name} (${check.detail})`)
    .join("; ");
  return `Production endpoint verification failed for ${result.url}: ${failed}.`;
}

export function isDirectRun(metaUrl: string, argv: string[]) {
  return Boolean(argv[1]) && fileURLToPath(metaUrl) === path.resolve(argv[1]);
}

export async function runEndpointVerificationCli() {
  dotenv.config({ override: false });
  const args = parseEndpointArgs(process.argv.slice(2));
  const url = normalizeProductionUrl(args.url || process.env.PRODUCTION_BASE_URL || process.env.PUBLIC_APP_URL);
  const result = await verifyProductionEndpoint(url, {
    timeoutMs: args.timeoutMs,
    allowHttp: args.allowHttp,
  });
  console.log(JSON.stringify(result, null, 2));
  const summary = summarizeEndpointVerification(result);
  if (!result.ok) {
    console.error(summary);
    process.exitCode = 1;
    return;
  }
  console.log(summary);
}

if (isDirectRun(import.meta.url, process.argv)) {
  runEndpointVerificationCli().catch((err) => {
    console.error("Production endpoint verification failed:", err);
    process.exit(1);
  });
}
