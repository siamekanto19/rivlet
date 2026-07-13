// Paddle (Billing) webhook verification and event extraction.
// Signature header format: "ts=<unix>;h1=<hex hmac>", where the HMAC-SHA256 is
// taken over `${ts}:${rawBody}` with the notification's secret key.
// https://developer.paddle.com/webhooks/signature-verification

import { hmacSha256, bytesToHex, timingSafeEqual } from "./crypto.js";

const encoder = new TextEncoder();

// Reject signatures whose timestamp is more than this many seconds from now.
const TOLERANCE_SECONDS = 5 * 60;

export async function verifyPaddleSignature(
  secret: string,
  signatureHeader: string | null,
  rawBody: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!secret || !signatureHeader) return false;
  const parts = Object.fromEntries(
    signatureHeader.split(";").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    }),
  );
  const ts = parts["ts"];
  const h1 = parts["h1"];
  if (!ts || !h1) return false;
  const tsNum = Number.parseInt(ts, 10);
  if (!Number.isFinite(tsNum) || Math.abs(nowSeconds - tsNum) > TOLERANCE_SECONDS) return false;

  const expected = bytesToHex(await hmacSha256(secret, `${ts}:${rawBody}`));
  return timingSafeEqual(encoder.encode(expected), encoder.encode(h1));
}

export interface PaddleEvent {
  eventId: string;
  type: string;
  data: Record<string, unknown>;
}

export function parseEvent(rawBody: string): PaddleEvent | null {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return null;
  }
  const eventId = (obj["event_id"] ?? obj["notification_id"]) as string | undefined;
  const type = obj["event_type"] as string | undefined;
  const data = (obj["data"] ?? {}) as Record<string, unknown>;
  if (!eventId || !type) return null;
  return { eventId, type, data };
}

/** Best-effort extraction of the buyer email from a transaction event payload. */
export function extractEmail(data: Record<string, unknown>): string | null {
  const custom = data["custom_data"] as Record<string, unknown> | undefined;
  const fromCustom = custom?.["email"];
  if (typeof fromCustom === "string" && fromCustom.includes("@")) return fromCustom;
  const customer = data["customer"] as Record<string, unknown> | undefined;
  const fromCustomer = customer?.["email"];
  if (typeof fromCustomer === "string" && fromCustomer.includes("@")) return fromCustomer;
  const top = data["email"];
  if (typeof top === "string" && top.includes("@")) return top;
  return null;
}

/** The account (Clerk) user id passed through checkout custom_data, if any. */
export function extractUserId(data: Record<string, unknown>): string | null {
  const custom = data["custom_data"] as Record<string, unknown> | undefined;
  const uid = custom?.["user_id"];
  return typeof uid === "string" && uid.trim() !== "" ? uid : null;
}

/** The transaction id a webhook refers to (differs by event shape). */
export function extractTransactionId(type: string, data: Record<string, unknown>): string | null {
  if (type.startsWith("adjustment")) {
    const t = data["transaction_id"];
    return typeof t === "string" ? t : null;
  }
  const id = data["id"];
  return typeof id === "string" ? id : null;
}

/** Classify the event into the licensing action it implies. */
export type PaddleAction = "provision" | "revoke" | "ignore";

export function classify(type: string, data: Record<string, unknown>): PaddleAction {
  switch (type) {
    case "transaction.completed":
    case "transaction.paid":
      return "provision";
    case "adjustment.created": {
      const action = data["action"];
      return action === "refund" || action === "chargeback" ? "revoke" : "ignore";
    }
    default:
      return "ignore";
  }
}
