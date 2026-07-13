// Crypto helpers shared across the Worker. All use WebCrypto / standard globals
// available in both workerd and Node 20+ (so the same code is unit-tested in
// Node and runs unchanged in production).

const encoder = new TextEncoder();

/** Standard base64 (with padding) of bytes. */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** Raw-url base64 (no padding) of bytes — the encoding the certificate uses. */
export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Raw-url base64 (no padding) of a UTF-8 string. */
export function stringToBase64Url(s: string): string {
  return bytesToBase64Url(encoder.encode(s));
}

/** Decode standard or url-safe base64 (padding optional) to bytes. */
export function base64ToBytes(b64: string): Uint8Array {
  const norm = b64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = norm + "=".repeat((4 - (norm.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Constant-time comparison of two byte arrays. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Lowercase hex of bytes. */
export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/** HMAC-SHA256(secret, message) as raw bytes. */
export async function hmacSha256(secret: string, message: string | Uint8Array): Promise<Uint8Array> {
  const key = await hmacKey(secret);
  const data = typeof message === "string" ? encoder.encode(message) : message;
  const sig = await crypto.subtle.sign("HMAC", key, data);
  return new Uint8Array(sig);
}

/**
 * keyHash is the storage identity of a license key: base64(HMAC-SHA256(pepper,
 * key)). The raw key is never stored; lookups re-hash the presented key.
 */
export async function keyHash(pepper: string, licenseKey: string): Promise<string> {
  return bytesToBase64(await hmacSha256(pepper, licenseKey.trim().toUpperCase()));
}

// deriveAesKey derives a 256-bit AES-GCM key from the pepper via HKDF. Used to
// encrypt license keys at rest so they can be revealed to the buyer post-purchase
// without ever storing them in plaintext.
async function deriveAesKey(pepper: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", encoder.encode(pepper), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("grabify-license-key-v1"),
      info: encoder.encode("aes-gcm"),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypt a secret with AES-GCM, returning base64(iv || ciphertext). */
export async function encryptSecret(pepper: string, plaintext: string): Promise<string> {
  const key = await deriveAesKey(pepper);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plaintext)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return bytesToBase64(out);
}

/** Decrypt a base64(iv || ciphertext) produced by encryptSecret. */
export async function decryptSecret(pepper: string, cipherB64: string): Promise<string> {
  const key = await deriveAesKey(pepper);
  const raw = base64ToBytes(cipherB64);
  const iv = raw.slice(0, 12);
  const ct = raw.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// Crockford base32 alphabet (no I, L, O, U) for human-friendly, unambiguous keys.
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Generate a license key like GRBFY-XXXX-XXXX-XXXX from CSPRNG bytes. */
export function generateLicenseKey(): string {
  const groups: string[] = [];
  for (let g = 0; g < 3; g++) {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    let s = "";
    for (let i = 0; i < 4; i++) s += CROCKFORD[bytes[i] & 31];
    groups.push(s);
  }
  return "GRBFY-" + groups.join("-");
}

/** A random opaque id (used for license_id). */
export function randomId(prefix: string): string {
  return prefix + "_" + crypto.randomUUID().replace(/-/g, "");
}
