// Entitlement certificate signer. Produces the compact
// base64url(header).base64url(payload).base64url(sig) token that the Go desktop
// client verifies offline (see backend/license/entitlement.go). The encoding
// here MUST stay byte-compatible with that verifier:
//   - header  = {"alg":"EdDSA","kid":<kid>}
//   - payload = the Entitlement claims (field names match the Go json tags)
//   - sig     = Ed25519 over ASCII(base64url(header) + "." + base64url(payload))
// all base64url without padding.

import { base64ToBytes, stringToBase64Url, bytesToBase64Url } from "./crypto.js";

export interface Entitlement {
  v: number;
  licenseId: string;
  product: string;
  tier: string; // "pro"
  edition: string;
  versionScope: string;
  deviceId: string;
  deviceName?: string;
  deviceLimit: number;
  status: string; // "active" | "refunded" | "revoked"
  issuedAt: string; // RFC3339
  refreshBy: string; // RFC3339
  graceDays: number;
}

const ENTITLEMENT_VERSION = 1;

/** Import an Ed25519 signing key from a base64 pkcs8 (DER) private key. */
export async function importSigningKey(pkcs8Base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    base64ToBytes(pkcs8Base64),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
}

/** Sign an entitlement, returning the compact certificate token. */
export async function signEntitlement(
  key: CryptoKey,
  kid: string,
  ent: Entitlement,
): Promise<string> {
  if (!ent.v) ent.v = ENTITLEMENT_VERSION;
  const header = stringToBase64Url(JSON.stringify({ alg: "EdDSA", kid }));
  const payload = stringToBase64Url(JSON.stringify(ent));
  const signingInput = header + "." + payload;
  const sig = await crypto.subtle.sign(
    "Ed25519",
    key,
    new TextEncoder().encode(signingInput),
  );
  return signingInput + "." + bytesToBase64Url(new Uint8Array(sig));
}

/** Build an entitlement from a license row and the target device/window. */
export function buildEntitlement(input: {
  licenseId: string;
  product: string;
  edition: string;
  versionScope: string;
  deviceId: string;
  deviceName?: string;
  deviceLimit: number;
  status: string;
  now: Date;
  offlineDays: number;
  graceDays: number;
}): Entitlement {
  const refreshBy = new Date(input.now.getTime() + input.offlineDays * 86400000);
  return {
    v: ENTITLEMENT_VERSION,
    licenseId: input.licenseId,
    product: input.product,
    tier: "pro",
    edition: input.edition,
    versionScope: input.versionScope,
    deviceId: input.deviceId,
    deviceName: input.deviceName,
    deviceLimit: input.deviceLimit,
    status: input.status,
    issuedAt: rfc3339(input.now),
    refreshBy: rfc3339(refreshBy),
    graceDays: input.graceDays,
  };
}

/** RFC3339 with a trailing Z, matching Go's time.RFC3339 UTC output. */
function rfc3339(d: Date): string {
  return d.toISOString().replace(/\.\d+Z$/, "Z");
}
