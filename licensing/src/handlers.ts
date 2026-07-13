import type { Env } from "./env.js";
import { intVar } from "./env.js";
import { ApiError, ErrorCodes, json, readJson } from "./http.js";
import { decryptSecret, keyHash } from "./crypto.js";
import {
  getLicenseByKeyHash,
  getLicenseByTxn,
  getLicensesByEmail,
  getLicensesByUser,
  provisionLicense,
  recordPayment,
  setLicenseStatusByTxn,
  LicenseStatus,
  type LicenseRow,
} from "./licenses.js";
import { verifyClerkToken } from "./clerk.js";
import { buildEntitlement, importSigningKey, signEntitlement } from "./cert.js";
import { sendRecoveryEmail } from "./email.js";
import { classify, extractEmail, extractTransactionId, extractUserId, parseEvent, verifyPaddleSignature } from "./paddle.js";

function requireString(v: unknown, field: string): string {
  if (typeof v !== "string" || v.trim() === "") {
    throw new ApiError(400, ErrorCodes.badRequest, `${field} is required`);
  }
  return v.trim();
}

async function loadLicense(env: Env, licenseKey: string): Promise<{ kh: string; lic: LicenseRow }> {
  const kh = await keyHash(env.LICENSE_KEY_PEPPER, licenseKey);
  const lic = await getLicenseByKeyHash(env, kh);
  if (!lic) {
    throw new ApiError(404, ErrorCodes.licenseNotFound, "that license key was not found");
  }
  return { kh, lic };
}

async function issueCertificate(env: Env, lic: LicenseRow, deviceId: string, deviceName?: string): Promise<string> {
  const ent = buildEntitlement({
    licenseId: lic.license_id,
    product: lic.product,
    edition: lic.edition,
    versionScope: lic.version_scope,
    deviceId,
    deviceName,
    deviceLimit: lic.device_limit,
    status: lic.status,
    now: new Date(),
    offlineDays: intVar(env.OFFLINE_DAYS, 90),
    graceDays: intVar(env.GRACE_DAYS, 30),
  });
  const key = await importSigningKey(env.CERT_SIGNING_KEY);
  return signEntitlement(key, env.CERT_KID, ent);
}

function licenseDO(env: Env, licenseId: string) {
  return env.LICENSE_DO.get(env.LICENSE_DO.idFromName(licenseId));
}

interface ActivateBody {
  licenseKey?: string;
  deviceId?: string;
  deviceName?: string;
}

export async function handleActivate(env: Env, request: Request): Promise<Response> {
  const body = await readJson<ActivateBody>(request);
  const licenseKey = requireString(body.licenseKey, "licenseKey");
  const deviceId = requireString(body.deviceId, "deviceId");
  const deviceName = typeof body.deviceName === "string" ? body.deviceName : "";

  const { kh, lic } = await loadLicense(env, licenseKey);
  if (lic.status !== LicenseStatus.active) {
    throw new ApiError(403, ErrorCodes.licenseRevoked, "this license is no longer active");
  }
  const result = await licenseDO(env, lic.license_id).activate(kh, deviceId, deviceName, lic.device_limit);
  if (!result.ok) {
    throw new ApiError(
      409,
      ErrorCodes.deviceLimitReached,
      `this license is already active on ${lic.device_limit} devices — deactivate one to continue`,
    );
  }
  const token = await issueCertificate(env, lic, deviceId, deviceName);
  return json({ token, devices: result.devices });
}

interface RefreshBody {
  licenseKey?: string;
  deviceId?: string;
}

export async function handleRefresh(env: Env, request: Request): Promise<Response> {
  const body = await readJson<RefreshBody>(request);
  const licenseKey = requireString(body.licenseKey, "licenseKey");
  const deviceId = requireString(body.deviceId, "deviceId");

  const { kh, lic } = await loadLicense(env, licenseKey);
  // A revoked/refunded license still gets a (revoked) certificate so the client
  // transitions cleanly to Free on its next validation, per the entitlement rules.
  if (lic.status === LicenseStatus.active) {
    const result = await licenseDO(env, lic.license_id).activate(kh, deviceId, "", lic.device_limit);
    if (!result.ok) {
      throw new ApiError(
        409,
        ErrorCodes.deviceLimitReached,
        "this device is no longer activated and the license is at its device limit",
      );
    }
  }
  const token = await issueCertificate(env, lic, deviceId);
  return json({ token });
}

interface DeactivateBody {
  licenseKey?: string;
  deviceId?: string;
  targetDeviceId?: string;
}

export async function handleDeactivate(env: Env, request: Request): Promise<Response> {
  const body = await readJson<DeactivateBody>(request);
  const licenseKey = requireString(body.licenseKey, "licenseKey");
  const deviceId = requireString(body.deviceId, "deviceId");
  const target = typeof body.targetDeviceId === "string" && body.targetDeviceId.trim() ? body.targetDeviceId.trim() : deviceId;

  const { kh, lic } = await loadLicense(env, licenseKey);
  const result = await licenseDO(env, lic.license_id).deactivate(kh, target);
  if (!result.ok) {
    throw new ApiError(404, ErrorCodes.deviceNotFound, "that device is not activated on this license");
  }
  return json({ devices: result.devices });
}

interface DevicesBody {
  licenseKey?: string;
  deviceId?: string;
}

export async function handleDevices(env: Env, request: Request): Promise<Response> {
  const body = await readJson<DevicesBody>(request);
  const licenseKey = requireString(body.licenseKey, "licenseKey");
  const { kh, lic } = await loadLicense(env, licenseKey);
  const devices = await licenseDO(env, lic.license_id).devices(kh);
  return json({ devices });
}

interface RecoverBody {
  email?: string;
}

export async function handleRecover(env: Env, request: Request): Promise<Response> {
  const body = await readJson<RecoverBody>(request);
  const email = typeof body.email === "string" ? body.email.trim() : "";
  // Always return success without revealing whether the address has a license.
  if (email.includes("@")) {
    const rows = await getLicensesByEmail(env, email);
    await sendRecoveryEmail(env, email, rows.map((r) => r.license_id));
  }
  return json({ ok: true });
}

interface OrderBody {
  transactionId?: string;
}

// handleOrder lets the checkout success page retrieve the license key for a
// just-completed Paddle transaction. The Paddle transaction id (a high-entropy
// value delivered only to the buyer's browser on checkout.completed) is the
// bearer credential. Returns {status:"pending"} while the provisioning webhook
// hasn't run yet, so the client can poll. Browser-called → served with CORS.
export async function handleOrder(env: Env, request: Request): Promise<Response> {
  const body = await readJson<OrderBody>(request);
  const transactionId = requireString(body.transactionId, "transactionId");

  const lic = await getLicenseByTxn(env, transactionId);
  if (!lic) {
    return json({ status: "pending" });
  }
  if (lic.status !== LicenseStatus.active) {
    return json({ status: "revoked" });
  }
  let licenseKey = "";
  if (lic.key_cipher) {
    try {
      licenseKey = await decryptSecret(env.LICENSE_KEY_PEPPER, lic.key_cipher);
    } catch {
      /* fall through with empty key */
    }
  }
  if (!licenseKey) {
    // Provisioned before encrypted-key storage existed; the buyer must use the
    // emailed key / recovery.
    return json({ status: "ready", licenseKey: "", product: lic.product, edition: lic.edition, email: lic.email });
  }
  return json({ status: "ready", licenseKey, product: lic.product, edition: lic.edition, email: lic.email });
}

// --- account (Clerk-authenticated) ---------------------------------------

async function requireClerkUser(env: Env, request: Request): Promise<string> {
  const auth = request.headers.get("Authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new ApiError(401, ErrorCodes.unauthorized, "sign in to view your account");
  const { userId } = await verifyClerkToken(env, match[1].trim());
  return userId;
}

async function licenseView(env: Env, lic: LicenseRow) {
  let licenseKey = "";
  if (lic.key_cipher) {
    try {
      licenseKey = await decryptSecret(env.LICENSE_KEY_PEPPER, lic.key_cipher);
    } catch {
      /* leave empty */
    }
  }
  let devices: unknown[] = [];
  try {
    devices = await licenseDO(env, lic.license_id).devices(lic.key_hash);
  } catch {
    /* devices unavailable */
  }
  return {
    licenseId: lic.license_id,
    product: lic.product,
    edition: lic.edition,
    versionScope: lic.version_scope,
    status: lic.status,
    deviceLimit: lic.device_limit,
    createdAt: lic.created_at,
    licenseKey,
    devices,
  };
}

// GET /v1/account — the signed-in user's licenses (key + devices) for the dashboard.
export async function handleAccount(env: Env, request: Request): Promise<Response> {
  const userId = await requireClerkUser(env, request);
  const rows = await getLicensesByUser(env, userId);
  const licenses = await Promise.all(rows.map((r) => licenseView(env, r)));
  return json({ licenses });
}

// POST /v1/account/deactivate — release a device slot from the dashboard.
export async function handleAccountDeactivate(env: Env, request: Request): Promise<Response> {
  const userId = await requireClerkUser(env, request);
  const body = await readJson<{ licenseId?: string; deviceId?: string }>(request);
  const licenseId = requireString(body.licenseId, "licenseId");
  const deviceId = requireString(body.deviceId, "deviceId");

  const rows = await getLicensesByUser(env, userId);
  const lic = rows.find((r) => r.license_id === licenseId);
  if (!lic) {
    throw new ApiError(404, ErrorCodes.licenseNotFound, "license not found");
  }
  const result = await licenseDO(env, lic.license_id).deactivate(lic.key_hash, deviceId);
  if (!result.ok) {
    throw new ApiError(404, ErrorCodes.deviceNotFound, "that device is not activated");
  }
  return json({ devices: result.devices });
}

export async function handleWebhook(env: Env, request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("Paddle-Signature");
  const valid = await verifyPaddleSignature(env.PADDLE_WEBHOOK_SECRET, signature, rawBody);
  if (!valid) {
    throw new ApiError(401, ErrorCodes.invalidSignature, "invalid webhook signature");
  }
  const event = parseEvent(rawBody);
  if (!event) {
    throw new ApiError(400, ErrorCodes.badRequest, "unparseable event");
  }

  // Idempotency: process each event id at most once.
  const insert = await env.DB.prepare(
    "INSERT OR IGNORE INTO webhook_events (event_id, type, received_at) VALUES (?, ?, ?)",
  )
    .bind(event.eventId, event.type, new Date().toISOString())
    .run();
  if ((insert.meta?.changes ?? 0) === 0) {
    return json({ ok: true, duplicate: true });
  }

  const action = classify(event.type, event.data);
  if (action === "provision") {
    const email = extractEmail(event.data);
    const txnId = extractTransactionId(event.type, event.data);
    const userId = extractUserId(event.data); // Clerk user id, from checkout custom_data
    // One license per transaction. Paddle fires BOTH transaction.completed and
    // transaction.paid for a one-time purchase (distinct event ids, so the
    // event-id ledger doesn't dedupe them) — provision only if this transaction
    // hasn't already been fulfilled. The buyer retrieves the key from their
    // dashboard (no email delivery).
    const existing = txnId ? await getLicenseByTxn(env, txnId) : null;
    if (!existing) {
      const { row } = await provisionLicense(env, { email, paddleTxnId: txnId, userId });
      await recordPayment(env, {
        id: txnId ?? event.eventId,
        keyHash: row.key_hash,
        email,
        amount: null,
        currency: null,
        status: "completed",
      });
    }
  } else if (action === "revoke") {
    const txnId = extractTransactionId(event.type, event.data);
    if (txnId) {
      await setLicenseStatusByTxn(env, txnId, LicenseStatus.refunded);
    }
  }
  return json({ ok: true });
}
