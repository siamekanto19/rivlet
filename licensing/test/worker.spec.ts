import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { applyMigration, paddleSignature, verifyToken } from "./helpers.js";
import { provisionLicense, getLicensesByUser } from "../src/licenses.js";

const BASE = "https://licensing.test";

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return SELF.fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function seedLicense(opts: { email?: string; txn?: string } = {}) {
  return provisionLicense(env, { email: opts.email ?? "buyer@example.com", paddleTxnId: opts.txn ?? "txn_seed" });
}

beforeEach(async () => {
  await applyMigration();
});

describe("activation", () => {
  it("issues a verifiable Pro certificate bound to the device", async () => {
    const { licenseKey } = await seedLicense();
    const res = await post("/v1/activate", { licenseKey, deviceId: "dev-1", deviceName: "Alice PC" });
    expect(res.status).toBe(200);
    const { token, devices } = (await res.json()) as { token: string; devices: unknown[] };
    expect(devices).toHaveLength(1);

    const claims = await verifyToken(token);
    expect(claims.tier).toBe("pro");
    expect(claims.deviceId).toBe("dev-1");
    expect(claims.status).toBe("active");
    expect(claims.deviceLimit).toBe(3);
    expect(typeof claims.refreshBy).toBe("string");
  });

  it("enforces the 3-device limit but allows re-activating a known device", async () => {
    const { licenseKey } = await seedLicense();
    for (const id of ["dev-1", "dev-2", "dev-3"]) {
      const r = await post("/v1/activate", { licenseKey, deviceId: id, deviceName: id });
      expect(r.status).toBe(200);
    }
    // Re-activating an existing device is idempotent (no new slot).
    const again = await post("/v1/activate", { licenseKey, deviceId: "dev-2", deviceName: "dev-2" });
    expect(again.status).toBe(200);

    // A fourth distinct device is rejected.
    const fourth = await post("/v1/activate", { licenseKey, deviceId: "dev-4", deviceName: "dev-4" });
    expect(fourth.status).toBe(409);
    expect(((await fourth.json()) as { error: { code: string } }).error.code).toBe("device_limit_reached");
  });

  it("frees a slot on deactivation so a new device can activate", async () => {
    const { licenseKey } = await seedLicense();
    for (const id of ["dev-1", "dev-2", "dev-3"]) {
      await post("/v1/activate", { licenseKey, deviceId: id, deviceName: id });
    }
    const deact = await post("/v1/deactivate", { licenseKey, deviceId: "dev-1", targetDeviceId: "dev-1" });
    expect(deact.status).toBe(200);

    const fourth = await post("/v1/activate", { licenseKey, deviceId: "dev-4", deviceName: "dev-4" });
    expect(fourth.status).toBe(200);
  });

  it("rejects an unknown license key", async () => {
    const res = await post("/v1/activate", { licenseKey: "RVLT-0000-0000-0000", deviceId: "dev-1" });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("license_not_found");
  });
});

describe("refresh & devices", () => {
  it("refresh returns a fresh certificate", async () => {
    const { licenseKey } = await seedLicense();
    await post("/v1/activate", { licenseKey, deviceId: "dev-1", deviceName: "PC" });
    const res = await post("/v1/refresh", { licenseKey, deviceId: "dev-1" });
    expect(res.status).toBe(200);
    const { token } = (await res.json()) as { token: string };
    expect((await verifyToken(token)).deviceId).toBe("dev-1");
  });

  it("lists activated devices, marking none client-side (server view)", async () => {
    const { licenseKey } = await seedLicense();
    await post("/v1/activate", { licenseKey, deviceId: "dev-1", deviceName: "PC1" });
    await post("/v1/activate", { licenseKey, deviceId: "dev-2", deviceName: "PC2" });
    const res = await post("/v1/devices", { licenseKey, deviceId: "dev-1" });
    const { devices } = (await res.json()) as { devices: { deviceId: string }[] };
    expect(devices.map((d) => d.deviceId).sort()).toEqual(["dev-1", "dev-2"]);
  });
});

describe("order key retrieval", () => {
  it("returns the license key for a completed transaction (for the success page)", async () => {
    const { licenseKey } = await seedLicense({ txn: "txn_order_1" });
    const res = await post("/v1/order", { transactionId: "txn_order_1" });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string; licenseKey: string };
    expect(data.status).toBe("ready");
    expect(data.licenseKey).toBe(licenseKey); // decrypts back to the exact issued key
    // CORS so the browser success page can call it.
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("returns pending when the provisioning webhook hasn't run yet", async () => {
    const res = await post("/v1/order", { transactionId: "txn_not_yet" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe("pending");
  });
});

describe("account (user-scoped)", () => {
  it("links a license to the buyer's user id and lists it per user", async () => {
    await provisionLicense(env, { email: "owner@example.com", paddleTxnId: "txn_u1", userId: "user_abc" });
    const rows = await getLicensesByUser(env, "user_abc");
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe("user_abc");
    expect(rows[0].key_cipher).toBeTruthy();
    // another user sees nothing
    expect(await getLicensesByUser(env, "user_other")).toHaveLength(0);
  });

  it("links via the Paddle webhook custom_data.user_id", async () => {
    const body = JSON.stringify({
      event_id: "evt_user_link",
      event_type: "transaction.completed",
      data: { id: "txn_link_1", custom_data: { user_id: "user_link", email: "link@example.com" } },
    });
    const sig = await paddleSignature("test-webhook-secret", body);
    await SELF.fetch(`${BASE}/v1/webhooks/paddle`, { method: "POST", headers: { "Paddle-Signature": sig, "content-type": "application/json" }, body });
    const rows = await getLicensesByUser(env, "user_link");
    expect(rows).toHaveLength(1);
    expect(rows[0].paddle_txn_id).toBe("txn_link_1");
  });
});

describe("recovery", () => {
  it("always returns ok without revealing existence", async () => {
    const res = await post("/v1/recover", { email: "nobody@example.com" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
  });
});

describe("paddle webhooks", () => {
  it("provisions a license on transaction.completed and is idempotent", async () => {
    const body = JSON.stringify({
      event_id: "evt_1",
      event_type: "transaction.completed",
      data: { id: "txn_100", custom_data: { email: "new@example.com" } },
    });
    const sig = await paddleSignature("test-webhook-secret", body);
    const res = await SELF.fetch(`${BASE}/v1/webhooks/paddle`, {
      method: "POST",
      headers: { "Paddle-Signature": sig, "content-type": "application/json" },
      body,
    });
    expect(res.status).toBe(200);

    const count1 = await env.DB.prepare("SELECT COUNT(*) AS n FROM licenses WHERE email = ?")
      .bind("new@example.com")
      .first<{ n: number }>();
    expect(count1?.n).toBe(1);

    // Replaying the same event id must not create a second license.
    const sig2 = await paddleSignature("test-webhook-secret", body);
    const replay = await SELF.fetch(`${BASE}/v1/webhooks/paddle`, {
      method: "POST",
      headers: { "Paddle-Signature": sig2, "content-type": "application/json" },
      body,
    });
    expect(((await replay.json()) as { duplicate?: boolean }).duplicate).toBe(true);
    const count2 = await env.DB.prepare("SELECT COUNT(*) AS n FROM licenses WHERE email = ?")
      .bind("new@example.com")
      .first<{ n: number }>();
    expect(count2?.n).toBe(1);
  });

  it("provisions only one license per transaction (completed + paid fire for the same purchase)", async () => {
    const send = async (eventId: string, type: string) => {
      const body = JSON.stringify({ event_id: eventId, event_type: type, data: { id: "txn_dedupe_1", custom_data: { email: "dup@example.com" } } });
      const sig = await paddleSignature("test-webhook-secret", body);
      return SELF.fetch(`${BASE}/v1/webhooks/paddle`, { method: "POST", headers: { "Paddle-Signature": sig, "content-type": "application/json" }, body });
    };
    await send("evt_c", "transaction.completed");
    await send("evt_p", "transaction.paid");
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM licenses WHERE paddle_txn_id = ?")
      .bind("txn_dedupe_1")
      .first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it("rejects an invalid signature", async () => {
    const body = JSON.stringify({ event_id: "evt_x", event_type: "transaction.completed", data: {} });
    const res = await SELF.fetch(`${BASE}/v1/webhooks/paddle`, {
      method: "POST",
      headers: { "Paddle-Signature": "ts=123;h1=deadbeef", "content-type": "application/json" },
      body,
    });
    expect(res.status).toBe(401);
  });

  it("revokes on refund: activation blocked, refresh yields a refunded certificate", async () => {
    const { licenseKey } = await seedLicense({ txn: "txn_refundme" });
    await post("/v1/activate", { licenseKey, deviceId: "dev-1", deviceName: "PC" });

    const body = JSON.stringify({
      event_id: "evt_refund",
      event_type: "adjustment.created",
      data: { action: "refund", transaction_id: "txn_refundme" },
    });
    const sig = await paddleSignature("test-webhook-secret", body);
    await SELF.fetch(`${BASE}/v1/webhooks/paddle`, {
      method: "POST",
      headers: { "Paddle-Signature": sig, "content-type": "application/json" },
      body,
    });

    const act = await post("/v1/activate", { licenseKey, deviceId: "dev-2", deviceName: "PC2" });
    expect(act.status).toBe(403);

    const refresh = await post("/v1/refresh", { licenseKey, deviceId: "dev-1" });
    expect(refresh.status).toBe(200);
    const { token } = (await refresh.json()) as { token: string };
    expect((await verifyToken(token)).status).toBe("refunded");
  });
});
