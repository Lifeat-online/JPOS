import crypto from "crypto";
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const DEFAULT_PERIOD_SECONDS = 30;
const DEFAULT_DIGITS = 6;
export function isPrivilegedTwoFactorRole(role: unknown) {
    const normalized = String(role || "").trim().toLowerCase();
    return normalized === "admin" || normalized === "manager" || normalized === "dev";
}
export function generateTotpSecret(bytes = 20) {
    return base32Encode(crypto.randomBytes(bytes));
}
export function buildTotpUri(input: {
    issuer?: string;
    accountName: string;
    secret: string;
}) {
    const issuer = input.issuer || "MasePOS";
    const label = `${issuer}:${input.accountName}`;
    const params = new URLSearchParams({
        secret: input.secret,
        issuer,
        algorithm: "SHA1",
        digits: String(DEFAULT_DIGITS),
        period: String(DEFAULT_PERIOD_SECONDS),
    });
    return `otpauth://totp/${encodeURIComponent(label)}$1${params.toString()}`;
}
export function verifyTotpCode(secret: string | null | undefined, code: unknown, now = Date.now()) {
    const normalizedSecret = normalizeSecret(secret);
    const normalizedCode = String(code || "").replace(/\s+/g, "");
    if (!normalizedSecret || !/^\d{6}$/.test(normalizedCode))
        return false;
    const counter = Math.floor(now / 1000 / DEFAULT_PERIOD_SECONDS);
    for (const offset of [-1, 0, 1]) {
        if (totpAtCounter(normalizedSecret, counter + offset) === normalizedCode)
            return true;
    }
    return false;
}
export function totpForTest(secret: string, now = Date.now()) {
    return totpAtCounter(normalizeSecret(secret), Math.floor(now / 1000 / DEFAULT_PERIOD_SECONDS));
}
function normalizeSecret(secret: string | null | undefined) {
    return String(secret || "").replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
}
function base32Encode(buffer: Buffer) {
    let bits = "";
    for (const byte of buffer)
        bits += byte.toString(2).padStart(8, "0");
    let output = "";
    for (let index = 0; index < bits.length; index += 5) {
        const chunk = bits.slice(index, index + 5).padEnd(5, "0");
        output += BASE32_ALPHABET[Number.parseInt(chunk, 2)];
    }
    return output;
}
function base32Decode(secret: string) {
    let bits = "";
    for (const char of normalizeSecret(secret)) {
        const value = BASE32_ALPHABET.indexOf(char);
        if (value === -1)
            throw new Error("Invalid TOTP secret");
        bits += value.toString(2).padStart(5, "0");
    }
    const bytes: number[] = [];
    for (let index = 0; index + 8 <= bits.length; index += 8) {
        bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
    }
    return Buffer.from(bytes);
}
function totpAtCounter(secret: string, counter: number) {
    const key = base32Decode(secret);
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    counterBuffer.writeUInt32BE(counter >>> 0, 4);
    const digest = crypto.createHmac("sha1", key).update(counterBuffer).digest();
    const offset = digest[digest.length - 1] & 0xf;
    const code = ((digest[offset] & 0x7f) << 24)
        | ((digest[offset + 1] & 0xff) << 16)
        | ((digest[offset + 2] & 0xff) << 8)
        | (digest[offset + 3] & 0xff);
    return String(code % 10 ** DEFAULT_DIGITS).padStart(DEFAULT_DIGITS, "0");
}
