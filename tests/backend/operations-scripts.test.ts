import fs from "fs";
import path from "path";
import { describe, expect, it, vi } from "vitest";

import {
  REQUIRED_SCHEMA_CHECKS,
  buildColumnLookupQuery,
  summarizeSchemaVerification,
  verifyRequiredSchema,
} from "../../scripts/verify-production-schema.ts";
import {
  TEST_TENANT_SUMMARY_TABLES,
  ensureTestTenant,
  parseSeedArgs,
} from "../../scripts/seed-test-tenant.ts";
import {
  parseEndpointArgs,
  summarizeEndpointVerification,
  supportsModernTlsProtocol,
  verifyProductionEndpoint,
} from "../../scripts/verify-production-endpoint.ts";

describe("operations scripts and runbooks", () => {
  it("covers production migration checks for auth, audit, stock, AI, payment, integration, and hardware tables", () => {
    const checks = new Map(REQUIRED_SCHEMA_CHECKS.map((check) => [check.table, check.columns]));

    expect(checks.get("staff")).toEqual(
      expect.arrayContaining(["password_hash", "security_pin_hash", "two_factor_enabled"])
    );
    expect(checks.get("audit_events")).toEqual(expect.arrayContaining(["tenant_id", "action", "details"]));
    expect(checks.get("stock_movements")).toEqual(expect.arrayContaining(["reason_code", "location_id"]));
    expect(checks.get("sale_payments")).toEqual(
      expect.arrayContaining(["provider_device_id", "provider_reference", "authorization_code", "provider_status", "qr_payload"])
    );
    expect(checks.get("refresh_token_sessions")).toEqual(expect.arrayContaining(["token_hash", "revoked_at"]));
    expect(checks.get("integration_api_keys")).toEqual(expect.arrayContaining(["key_hash", "scopes"]));
    expect(checks.get("integration_webhook_events")).toEqual(expect.arrayContaining(["source", "idempotency_key", "status"]));
    expect(checks.get("hardware_devices")).toEqual(expect.arrayContaining(["device_type", "connection_type", "connection_config"]));
    expect(checks.get("hardware_device_events")).toEqual(expect.arrayContaining(["device_id", "event_type", "request_payload"]));
    expect(checks.get("realtime_pubsub_events")).toEqual(expect.arrayContaining(["instance_id", "channel", "event_name", "expires_at"]));
    expect(checks.get("stock_batches")).toEqual(expect.arrayContaining(["batch_number", "remaining_quantity", "location_id"]));
    expect(checks.get("ai_agent_runs")).toEqual(expect.arrayContaining(["requires_human_approval", "full_autopilot"]));
    expect(checks.get("ai_agent_run_steps")).toEqual(expect.arrayContaining(["step_id", "approved", "payload", "result"]));
  });

  it("builds information_schema column lookups scoped to current_schema()", () => {
    const lookup = buildColumnLookupQuery("staff", "password_hash");

    expect(lookup.sql).toContain("information_schema.columns");
    expect(lookup.sql).toContain("current_schema()");
    expect(lookup.params).toEqual(["staff", "password_hash"]);
  });

  it("reports missing production schema items with table and column precision", async () => {
    const missingTable = "hardware_devices";
    const missingColumn = "staff.password_hash";

    const result = await verifyRequiredSchema(
      async (sql, params = []) => {
        if (sql.includes("tables")) {
          return params[0] === missingTable ? [] : [{ tableName: params[0] }];
        }
        const key = `${params[0]}.${params[1]}`;
        return key === missingColumn ? [] : [{ columnName: params[1] }];
      },
      "2026-06-05T00:00:00.000Z"
    );

    expect(result.ok).toBe(false);
    expect(result.missingTables).toContain(missingTable);
    expect(result.missingColumns).toContainEqual({ table: "staff", column: "password_hash" });
    expect(summarizeSchemaVerification(result)).toContain("hardware_devices");
    expect(summarizeSchemaVerification(result)).toContain("staff.password_hash");
  });

  it("creates a test tenant/app settings shell before delegating to the demo seed path", async () => {
    const calls: Array<{ sql: string; params: any[] }> = [];
    await ensureTestTenant(
      async (sql, params = []) => {
        calls.push({ sql, params });
        return [];
      },
      { tenantId: "test_tenant", tenantName: "Test Tenant", mode: "restaurant" }
    );

    expect(calls[0].sql).toContain("INSERT INTO tenants");
    expect(calls[0].sql).toContain("ON CONFLICT (id) DO UPDATE");
    expect(calls[0].params).toEqual(["test_tenant", "Test Tenant"]);
    expect(calls[1].sql).toContain("INSERT INTO app_settings");
    expect(calls[1].params[0]).toBe("test_tenant");
    expect(calls[1].params[1]).toContain('"testTenant":true');
    expect(calls[1].params[1]).toContain('"isRestaurantMode":true');
  });

  it("parses seed command arguments for restaurant and retail test tenants", () => {
    expect(parseSeedArgs(["--tenant", "stage_tenant", "--mode", "retail", "--clear-first"])).toMatchObject({
      tenantId: "stage_tenant",
      mode: "retail",
      clearFirst: true,
      skipInit: false,
    });
    expect(() => parseSeedArgs(["--mode", "warehouse"])).toThrow(/Unsupported seed mode/);
    expect(TEST_TENANT_SUMMARY_TABLES).toEqual(
      expect.arrayContaining(["staff", "customers", "products", "sales", "restaurant_tables"])
    );
  });

  it("verifies production endpoint TLS, security headers, and health checks", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/health")) {
        return new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response("<html>MasePOS</html>", {
        status: 200,
        headers: {
          "strict-transport-security": "max-age=31536000; includeSubDomains",
          "x-frame-options": "DENY",
          "x-content-type-options": "nosniff",
          "content-security-policy": "default-src 'self'",
          "referrer-policy": "strict-origin-when-cross-origin",
        },
      });
    });

    const result = await verifyProductionEndpoint(new URL("https://masepos.test"), {
      checkedAt: "2026-06-05T00:00:00.000Z",
      fetchImpl: fetchMock as unknown as typeof fetch,
      tlsProbe: async () => ({
        authorized: true,
        authorizationError: null,
        protocol: "TLSv1.3",
        cipher: "TLS_AES_256_GCM_SHA384",
        validFrom: "Jun 01 00:00:00 2026 GMT",
        validTo: "Sep 01 00:00:00 2026 GMT",
        subjectAltName: "DNS:masepos.test",
      }),
    });

    expect(result.ok).toBe(true);
    expect(result.tls?.protocol).toBe("TLSv1.3");
    expect(result.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining(["https-url", "tls-authorized", "header:strict-transport-security", "api-health"])
    );
    expect(summarizeEndpointVerification(result)).toContain("passed");
  });

  it("reports endpoint validation failures with actionable check names", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/health")) {
        return new Response(JSON.stringify({ status: "down" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("<html>MasePOS</html>", { status: 200 });
    });

    const result = await verifyProductionEndpoint(new URL("http://masepos.test"), {
      checkedAt: "2026-06-05T00:00:00.000Z",
      fetchImpl: fetchMock as unknown as typeof fetch,
      tlsProbe: async () => {
        throw new Error("should not run for http");
      },
    });

    expect(result.ok).toBe(false);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "https-url", ok: false }),
        expect.objectContaining({ name: "header:strict-transport-security", ok: false }),
        expect.objectContaining({ name: "api-health", ok: false }),
      ])
    );
    expect(summarizeEndpointVerification(result)).toContain("https-url");
    expect(supportsModernTlsProtocol("TLSv1.1")).toBe(false);
    expect(parseEndpointArgs(["--url", "https://masepos.co.za", "--timeout-ms=5000"])).toMatchObject({
      url: "https://masepos.co.za",
      timeoutMs: 5000,
    });
  });

  it("exposes package commands and documents rollback plus archived migration-note rules", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    const rollbackDoc = fs.readFileSync(path.join(process.cwd(), "docs", "operational-rollback-notes.md"), "utf8");
    const archiveDoc = fs.readFileSync(path.join(process.cwd(), "docs", "migration-note-archive.md"), "utf8");
    const seedScript = fs.readFileSync(path.join(process.cwd(), "scripts", "seed-test-tenant.ts"), "utf8");

    expect(packageJson.scripts["ops:verify-schema"]).toBe("tsx scripts/verify-production-schema.ts");
    expect(packageJson.scripts["ops:verify-endpoint"]).toBe("tsx scripts/verify-production-endpoint.ts");
    expect(packageJson.scripts["seed:test-tenant"]).toBe("tsx scripts/seed-test-tenant.ts");
    expect(rollbackDoc).toContain("npm run ops:verify-schema");
    expect(rollbackDoc).toContain("database backup");
    expect(rollbackDoc).toContain("npm run seed:test-tenant -- --tenant test_tenant --mode restaurant --clear-first");
    expect(archiveDoc).toContain("Older MariaDB/Nginx migration notes");
    expect(archiveDoc).toContain("archival unless they are re-verified against the current codebase");
    expect(seedScript).toContain("seedDemoData");
    expect(seedScript).toContain("clearSeededDemoData");
  });
});
