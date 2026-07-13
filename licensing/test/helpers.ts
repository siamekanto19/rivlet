import { env } from "cloudflare:test";
import schema from "../migrations/0001_init.sql?raw";
import schema2 from "../migrations/0002_key_cipher.sql?raw";
import schema3 from "../migrations/0003_user_accounts.sql?raw";
import keys from "./keys.json";

function statementsFrom(sql: string): string[] {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Apply the D1 schema (all migrations in order) to the test database. */
export async function applyMigration(): Promise<void> {
  for (const stmt of [...statementsFrom(schema), ...statementsFrom(schema2), ...statementsFrom(schema3)]) {
    await env.DB.prepare(stmt).run();
  }
}

const decoder = new TextDecoder();

function b64urlToBytes(b64url: string): Uint8Array {
  const norm = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = norm + "=".repeat((4 - (norm.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function rawB64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Verify a certificate token's Ed25519 signature and return its claims. */
export async function verifyToken(token: string): Promise<Record<string, unknown>> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const pub = await crypto.subtle.importKey(
    "raw",
    rawB64ToBytes(keys.publicRaw),
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  const signingInput = new TextEncoder().encode(parts[0] + "." + parts[1]);
  const ok = await crypto.subtle.verify("Ed25519", pub, b64urlToBytes(parts[2]), signingInput);
  if (!ok) throw new Error("signature invalid");
  return JSON.parse(decoder.decode(b64urlToBytes(parts[1]))) as Record<string, unknown>;
}

/** Build a valid Paddle-Signature header for a raw body. */
export async function paddleSignature(secret: string, rawBody: string): Promise<string> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}:${rawBody}`));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `ts=${ts};h1=${hex}`;
}
