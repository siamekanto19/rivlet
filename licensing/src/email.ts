import type { Env } from "./env.js";

// Transactional email for delivering license keys and recovery. Provider is
// Resend-compatible by default (EMAIL_PROVIDER_URL). When EMAIL_API_KEY is not
// configured (local/dev/test) sending is skipped rather than failing the caller,
// so webhook processing and recovery still succeed end-to-end.

async function send(env: Env, to: string, subject: string, text: string): Promise<void> {
  if (!env.EMAIL_API_KEY) {
    console.log(`[email skipped: no EMAIL_API_KEY] to=${to} subject=${subject}`);
    return;
  }
  const resp = await fetch(env.EMAIL_PROVIDER_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.EMAIL_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, text }),
  });
  if (!resp.ok) {
    console.error(`email send failed (${resp.status}): ${await resp.text()}`);
  }
}

export async function sendLicenseKey(env: Env, to: string, licenseKey: string): Promise<void> {
  await send(
    env,
    to,
    "Your Rivlet Pro license key",
    [
      "Thanks for buying Rivlet Pro!",
      "",
      `Your license key: ${licenseKey}`,
      "",
      "To activate: open Rivlet → Settings → License, paste this key, and click Activate.",
      "Your license covers 3 devices. You can manage them any time from the same screen.",
      "",
      "Keep this email — it's the only copy of your key.",
    ].join("\n"),
  );
}

export async function sendRecoveryEmail(env: Env, to: string, keys: string[]): Promise<void> {
  // Note: on recovery we don't have the raw keys (only their hashes are stored),
  // so this path re-sends nothing sensitive by default. It exists so Track 4 can
  // wire a provider that stores/rotates delivery separately if desired. Here we
  // simply confirm the address has a license without leaking the key.
  await send(
    env,
    to,
    "Your Rivlet Pro license",
    keys.length > 0
      ? "We found a Rivlet Pro license for this email. If you've lost your key, reply to this email and we'll help you recover it."
      : "No Rivlet Pro license is associated with this email address.",
  );
}
