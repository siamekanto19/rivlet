import type { LicenseDurableObject } from "./license-do.js";

export interface Env {
  // Bindings
  DB: D1Database;
  LICENSE_DO: DurableObjectNamespace<LicenseDurableObject>;

  // Non-secret vars (wrangler.jsonc)
  CERT_KID: string;
  PRODUCT_ID: string;
  EDITION: string;
  VERSION_SCOPE: string;
  DEVICE_LIMIT: string;
  OFFLINE_DAYS: string;
  GRACE_DAYS: string;
  EMAIL_FROM: string;
  EMAIL_PROVIDER_URL: string;
  CLERK_ISSUER: string; // e.g. https://<slug>.clerk.accounts.dev — for verifying session tokens

  // Secrets (wrangler secret put)
  PADDLE_WEBHOOK_SECRET: string;
  CERT_SIGNING_KEY: string; // Ed25519 private key, pkcs8, base64
  LICENSE_KEY_PEPPER: string;
  EMAIL_API_KEY: string;
}

export function intVar(v: string | undefined, fallback: number): number {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
