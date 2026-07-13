import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env.js";

export interface DeviceRecord {
  deviceId: string;
  name: string;
  activatedAt: string;
  lastSeenAt?: string;
}

export type ActivateResult =
  | { ok: true; devices: DeviceRecord[] }
  | { ok: false; code: "device_limit_reached" };

export type DeactivateResult =
  | { ok: true; devices: DeviceRecord[] }
  | { ok: false; code: "device_not_found" };

/**
 * One instance per license (addressed by license_id). Because all of a
 * license's activate/deactivate calls route to this single instance AND are run
 * through an in-instance serialization chain, the read-count-then-write sequence
 * is atomic: the device limit can never be exceeded by concurrent requests.
 *
 * Activations are stored in D1 (the queryable projection); this object is the
 * sole writer, so no cross-request race is possible.
 */
export class LicenseDurableObject extends DurableObject<Env> {
  // Serializes mutating operations within this instance.
  private chain: Promise<unknown> = Promise.resolve();

  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async list(keyHash: string): Promise<DeviceRecord[]> {
    const res = await this.env.DB.prepare(
      "SELECT device_id, name, activated_at, last_seen_at FROM activations WHERE key_hash = ? ORDER BY activated_at",
    )
      .bind(keyHash)
      .all<{ device_id: string; name: string | null; activated_at: string; last_seen_at: string | null }>();
    return (res.results ?? []).map((r) => ({
      deviceId: r.device_id,
      name: r.name ?? "",
      activatedAt: r.activated_at,
      lastSeenAt: r.last_seen_at ?? undefined,
    }));
  }

  /** Bind (or refresh) a device slot, enforcing the limit. Idempotent per device. */
  async activate(keyHash: string, deviceId: string, deviceName: string, limit: number): Promise<ActivateResult> {
    return this.serialize(async () => {
      const now = new Date().toISOString();
      const devices = await this.list(keyHash);
      const existing = devices.find((d) => d.deviceId === deviceId);
      if (existing) {
        await this.env.DB.prepare(
          "UPDATE activations SET name = ?, last_seen_at = ? WHERE key_hash = ? AND device_id = ?",
        )
          .bind(deviceName || existing.name, now, keyHash, deviceId)
          .run();
        return { ok: true, devices: await this.list(keyHash) };
      }
      if (devices.length >= limit) {
        return { ok: false, code: "device_limit_reached" };
      }
      await this.env.DB.prepare(
        "INSERT INTO activations (key_hash, device_id, name, activated_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
      )
        .bind(keyHash, deviceId, deviceName, now, now)
        .run();
      return { ok: true, devices: await this.list(keyHash) };
    });
  }

  /** Release a device slot. targetDeviceId may be any device on the license. */
  async deactivate(keyHash: string, targetDeviceId: string): Promise<DeactivateResult> {
    return this.serialize(async () => {
      const result = await this.env.DB.prepare(
        "DELETE FROM activations WHERE key_hash = ? AND device_id = ?",
      )
        .bind(keyHash, targetDeviceId)
        .run();
      const changes = result.meta?.changes ?? 0;
      if (changes === 0) {
        return { ok: false, code: "device_not_found" };
      }
      return { ok: true, devices: await this.list(keyHash) };
    });
  }

  async devices(keyHash: string): Promise<DeviceRecord[]> {
    return this.list(keyHash);
  }
}
