# Grabify licensing backend

Cloudflare Worker that provisions and validates **Grabify Pro** licenses:
Paddle webhooks → license provisioning, and device activation → signed offline
entitlement certificates the desktop app verifies. See the repo-root
[`LICENSING.md`](../LICENSING.md) for the certificate format and endpoint
contract this Worker implements.

## Layout

- `src/index.ts` — router + Worker entry (exports the Durable Object)
- `src/handlers.ts` — `/v1/{activate,refresh,deactivate,devices,recover}` + Paddle webhook
- `src/license-do.ts` — one Durable Object per license; serializes device slots (3-device cap)
- `src/cert.ts` — Ed25519 entitlement signer (byte-compatible with the Go verifier)
- `src/paddle.ts` — webhook signature verification + event classification
- `src/licenses.ts`, `src/crypto.ts`, `src/email.ts`, `src/env.ts`, `src/http.ts`
- `migrations/0001_init.sql` — D1 schema (`licenses`, `activations`, `payments`, `webhook_events`)

## Develop & test (no Cloudflare account needed)

```bash
npm install
npm test              # vitest in workerd: full activate/limit/refresh/webhook flows + cert verify
npm run dev           # wrangler dev (local D1 + DO via miniflare)
```

`npm test` runs entirely locally in workerd with an in-memory D1 and Durable
Objects. Test secrets live in `vitest.config.ts`; the signing key is the
disposable pair in `test/keys.json` (test-only — never used in production).

The cert format is proven byte-compatible with the Go client by signing with
this Worker's code and verifying in Go (see the repo `LICENSING.md`).

## Deploy (Track 4 — needs the Cloudflare account)

```bash
wrangler login
wrangler d1 create grabify-licensing          # paste database_id into wrangler.jsonc
wrangler d1 migrations apply grabify-licensing --remote
npm run keygen                                # generate the production cert keypair
wrangler secret put CERT_SIGNING_KEY          # pkcs8 private from keygen
wrangler secret put PADDLE_WEBHOOK_SECRET
wrangler secret put LICENSE_KEY_PEPPER
wrangler secret put EMAIL_API_KEY
wrangler deploy
```

Then paste the keygen **public** key into `backend/license/keys.go`
(`productionPublicKeyB64`) and point the desktop app at the Worker with
`GRABIFY_LICENSE_API` (or update `defaultAPIBase`).
