import { describe, expect, it } from "vitest";
import { generateLicenceKey, hashLicenceKey, LicencePayload, verifyLicenceKey } from "../../server/licenceKey.js";

const secret = "test-licence-secret";

function payload(overrides: Partial<LicencePayload> = {}): LicencePayload {
  return {
    licenceId: "11111111-1111-4111-8111-111111111111",
    tenantName: "Acme Bistro",
    maxRegisters: 15,
    features: ["images", "ai", "analytics"],
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
});
