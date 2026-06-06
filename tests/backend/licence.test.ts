import { describe, expect, it } from "vitest";
import { generateLicenceKey, hashLicenceKey, LicencePayload, verifyLicenceKey } from "../../server/licenceKey.js";
import { featureSetForPackage, getPackageByTier, hasPackageFeature } from "../../shared/packageCatalog.js";

const secret = "test-licence-secret";

function payload(overrides: Partial<LicencePayload> = {}): LicencePayload {
  return {
    licenceId: "11111111-1111-4111-8111-111111111111",
    tenantName: "Acme Bistro",
    maxRegisters: 15,
    features: ["images", "ai", "analytics", "local_server_sync"],
    issuedAt: Math.floor(Date.now() / 1000) - 60,
    expiresAt: null,
    tier: "business",
    ...overrides,
  };
}

describe("licence keys", () => {
  it("generates self-contained signed JPOS licence keys", () => {
    const key = generateLicenceKey(payload(), secret);
    const result = verifyLicenceKey(key, secret);

    expect(key.startsWith("JPOS-")).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.payload?.tenantName).toBe("Acme Bistro");
    expect(result.payload?.features).toContain("ai");
    expect(result.payload?.features).toContain("local_server_sync");
  });

  it("rejects tampered signatures without throwing", () => {
    const key = generateLicenceKey(payload(), secret);
    const tampered = `${key.slice(0, -3)}abc`;

    expect(verifyLicenceKey(tampered, secret)).toEqual({
      valid: false,
      error: "Invalid key signature",
    });
  });

  it("rejects expired licences", () => {
    const key = generateLicenceKey(payload({ expiresAt: Math.floor(Date.now() / 1000) - 1 }), secret);

    expect(verifyLicenceKey(key, secret)).toEqual({
      valid: false,
      error: "Licence key has expired",
    });
  });

  it("hashes keys for storage without storing the raw key", () => {
    const key = generateLicenceKey(payload(), secret);

    expect(hashLicenceKey(key)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashLicenceKey(key)).not.toContain(key);
  });

  it("maps package tiers to licence limits and feature flags", () => {
    expect(getPackageByTier("free")).toMatchObject({ maxRegisters: 2, maxProducts: 100, maxStaff: 3, priceLabel: "R0" });
    expect(getPackageByTier("starter")).toMatchObject({ maxRegisters: 5, maxProducts: 1000, maxStaff: 15, priceLabel: "R399/mo" });
    expect(getPackageByTier("business")).toMatchObject({ maxRegisters: 15, maxProducts: -1, maxStaff: 50, priceLabel: "R999/mo" });
    expect(getPackageByTier("whitelabel")).toMatchObject({ maxRegisters: -1, maxProducts: -1, maxStaff: -1, priceLabel: "R25,000 once-off" });
    expect(featureSetForPackage("whitelabel", true)).toEqual(
      expect.arrayContaining(["full_branding", "local_server_sync", "updates", "priority_support"])
    );
    expect(featureSetForPackage("business")).toContain("local_server_sync");
    expect(hasPackageFeature(["full_branding"], "own_logo")).toBe(true);
    expect(hasPackageFeature(["jpos_branding"], "images")).toBe(false);
  });
});
