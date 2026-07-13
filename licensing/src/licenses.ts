import type { Env } from "./env.js";
import { encryptSecret, generateLicenseKey, keyHash, randomId } from "./crypto.js";

export interface LicenseRow {
  key_hash: string;
  license_id: string;
  product: string;
  edition: string;
  version_scope: string;
  status: string;
  device_limit: number;
  email: string | null;
  paddle_txn_id: string | null;
  key_cipher: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

export const LicenseStatus = {
  active: "active",
  refunded: "refunded",
  revoked: "revoked",
} as const;

export async function getLicenseByKeyHash(env: Env, kh: string): Promise<LicenseRow | null> {
  return env.DB.prepare("SELECT * FROM licenses WHERE key_hash = ?").bind(kh).first<LicenseRow>();
}

export async function getLicensesByEmail(env: Env, email: string): Promise<LicenseRow[]> {
  const res = await env.DB.prepare("SELECT * FROM licenses WHERE email = ? AND status = 'active'")
    .bind(email.trim().toLowerCase())
    .all<LicenseRow>();
  return res.results ?? [];
}

export async function getLicenseByTxn(env: Env, paddleTxnId: string): Promise<LicenseRow | null> {
  return env.DB.prepare("SELECT * FROM licenses WHERE paddle_txn_id = ?").bind(paddleTxnId).first<LicenseRow>();
}

export async function getLicensesByUser(env: Env, userId: string): Promise<LicenseRow[]> {
  const res = await env.DB.prepare("SELECT * FROM licenses WHERE user_id = ? ORDER BY created_at DESC")
    .bind(userId)
    .all<LicenseRow>();
  return res.results ?? [];
}

/**
 * Provision a new license for a completed purchase. Returns the RAW license key
 * (to email to the buyer) and the stored row. The raw key is never persisted —
 * only its keyed hash.
 */
export async function provisionLicense(
  env: Env,
  opts: { email: string | null; paddleTxnId: string | null; userId?: string | null },
): Promise<{ licenseKey: string; row: LicenseRow }> {
  const licenseKey = generateLicenseKey();
  const kh = await keyHash(env.LICENSE_KEY_PEPPER, licenseKey);
  const keyCipher = await encryptSecret(env.LICENSE_KEY_PEPPER, licenseKey);
  const now = new Date().toISOString();
  const deviceLimit = Number.parseInt(env.DEVICE_LIMIT ?? "3", 10) || 3;
  const row: LicenseRow = {
    key_hash: kh,
    license_id: randomId("lic"),
    product: env.PRODUCT_ID,
    edition: env.EDITION,
    version_scope: env.VERSION_SCOPE,
    status: LicenseStatus.active,
    device_limit: deviceLimit,
    email: opts.email ? opts.email.trim().toLowerCase() : null,
    paddle_txn_id: opts.paddleTxnId,
    key_cipher: keyCipher,
    user_id: opts.userId ?? null,
    created_at: now,
    updated_at: now,
  };
  await env.DB.prepare(
    `INSERT INTO licenses (key_hash, license_id, product, edition, version_scope, status, device_limit, email, paddle_txn_id, key_cipher, user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      row.key_hash,
      row.license_id,
      row.product,
      row.edition,
      row.version_scope,
      row.status,
      row.device_limit,
      row.email,
      row.paddle_txn_id,
      row.key_cipher,
      row.user_id,
      row.created_at,
      row.updated_at,
    )
    .run();
  return { licenseKey, row };
}

/** Set a license's status (e.g. refunded/revoked from a webhook). Idempotent. */
export async function setLicenseStatusByTxn(env: Env, paddleTxnId: string, status: string): Promise<void> {
  await env.DB.prepare("UPDATE licenses SET status = ?, updated_at = ? WHERE paddle_txn_id = ?")
    .bind(status, new Date().toISOString(), paddleTxnId)
    .run();
}

export async function recordPayment(
  env: Env,
  p: { id: string; keyHash: string | null; email: string | null; amount: string | null; currency: string | null; status: string },
): Promise<void> {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO payments (id, key_hash, email, amount, currency, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(p.id, p.keyHash, p.email, p.amount, p.currency, p.status, new Date().toISOString())
    .run();
}
