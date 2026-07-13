import type { Env } from "./env.js";
import { base64ToBytes } from "./crypto.js";
import { ApiError, ErrorCodes } from "./http.js";

// Verifies Clerk session tokens (RS256 JWTs) using Clerk's public JWKS. No
// secret key is needed — the JWKS is public and the token's `sub` is the Clerk
// user id we key licenses on. The frontend supplies the user's email at checkout,
// so no Clerk backend API call is required here.

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

async function getJwks(issuer: string): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys;
  const res = await fetch(`${issuer}/.well-known/jwks.json`);
  if (!res.ok) throw new ApiError(503, ErrorCodes.serverError, "could not fetch auth keys");
  const data = (await res.json()) as { keys?: Jwk[] };
  jwksCache = { keys: data.keys ?? [], fetchedAt: Date.now() };
  return jwksCache.keys;
}

const decoder = new TextDecoder();
function decodeJson(part: string): Record<string, unknown> {
  return JSON.parse(decoder.decode(base64ToBytes(part))) as Record<string, unknown>;
}

/**
 * Verify a Clerk session JWT and return its subject (Clerk user id). Throws
 * ApiError(401) if the token is missing, malformed, expired, or not signed by a
 * current Clerk key for the configured issuer.
 */
export async function verifyClerkToken(env: Env, token: string): Promise<{ userId: string }> {
  const unauthorized = (msg: string) => new ApiError(401, ErrorCodes.unauthorized, msg);
  const parts = token.split(".");
  if (parts.length !== 3) throw unauthorized("invalid session token");

  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try {
    header = decodeJson(parts[0]);
    claims = decodeJson(parts[1]);
  } catch {
    throw unauthorized("invalid session token");
  }
  if (header.alg !== "RS256") throw unauthorized("unsupported token algorithm");
  if (!env.CLERK_ISSUER) throw new ApiError(503, ErrorCodes.serverError, "auth is not configured");

  const jwks = await getJwks(env.CLERK_ISSUER);
  const jwk = jwks.find((k) => k.kid === (header.kid as string));
  if (!jwk) throw unauthorized("unknown signing key");

  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64ToBytes(parts[2]),
    new TextEncoder().encode(parts[0] + "." + parts[1]),
  );
  if (!ok) throw unauthorized("invalid token signature");

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp === "number" && now > claims.exp + 5) throw unauthorized("session expired");
  if (typeof claims.nbf === "number" && now < claims.nbf - 5) throw unauthorized("session not yet valid");
  if (claims.iss && claims.iss !== env.CLERK_ISSUER) throw unauthorized("wrong token issuer");
  if (typeof claims.sub !== "string" || !claims.sub) throw unauthorized("token missing subject");
  return { userId: claims.sub };
}
