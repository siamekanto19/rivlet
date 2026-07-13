# Grabify licensing — contract & design

This is the reference for Grabify's monetization system. **Track 1 (desktop
entitlement layer) is implemented and tested**; the Cloudflare backend (Track 2)
must conform to the certificate format and endpoint contract defined here.

## Overview

- **Grabify Pro Lifetime**, one-time purchase, sold via **Paddle** (merchant of
  record). $12.99 (launch $9.99 for the first 14 days).
- The desktop app holds only an **Ed25519 public key** and verifies a signed
  **entitlement certificate** entirely offline. It can never mint one.
- **3 device activations.** No account required for Free or initial activation.
- Offline validity **90 days** (`refreshBy`) + **30-day grace**, then new actions
  revert to Free while stored settings/queues are preserved.

## Where it lives (desktop, Go + Vue)

| Piece | Path |
|---|---|
| Policy (the single source of truth for every limit) | `backend/license/policy.go` |
| Entitlement cert: sign / verify / evaluate | `backend/license/entitlement.go` |
| Trusted public keys (baked + env/ldflags override) | `backend/license/keys.go` |
| Local state store (device id, token, key) | `backend/license/store.go` |
| Backend API client (activate/refresh/…) | `backend/license/client.go` |
| License manager (ties it together) | `backend/license/manager.go` |
| Engine enforcement (all gates) | `backend/manager.go`, `backend/video.go` |
| Wails API surface | `license_api.go` |
| Dev signing tool | `cmd/grabify-licgen/` |
| Vue service / store / UI | `frontend/src/services/license.ts`, `frontend/src/stores/license.ts`, `frontend/src/components/settings/LicenseSettings.vue`, `frontend/src/components/dialogs/UpgradeDialog.vue` |

## Enforcement points (enforced in Go, not the UI)

Every gate reads `Manager.policy()` live, so a lapse re-clamps new actions
automatically. Free / Pro:

- **Active downloads** 3 / 16 — `scheduler()`
- **Connections per download** 4 / 16 — `downloadHTTP()` (clamps `segmentCount`)
- **Custom queues** off / on — `SettingsPage.addQueue` prompts upgrade
- **Scheduling & completion actions** off / on — `scheduler()`, `completionPolicyLocked()`
- **Per-download / per-queue bandwidth** off / on — `throttle()`
- **Custom proxy** off / on — `configureHTTPClient()`
- **Host profiles (user rules)** off / on — `connectionsForHost()`
- **Stored HTTP credentials** off / on — `Add()` (one-off auth still works)
- **Video resolution** ≤720p / unlimited, format choice off / on, concurrent
  fragments off / on — `downloadVideo()`
- **Devices** 0 / 3

Tests: `backend/enforcement_test.go` (incl. an end-to-end proof that Free caps
parallel connections at 4 while Pro exceeds it), `backend/license/*_test.go`.

## Certificate format

Compact JWS-style token: `base64url(header).base64url(payload).base64url(sig)`,
`alg=EdDSA` (Ed25519), signed over `header.payload` (raw-url base64, no padding).
The Worker MUST produce byte-identical encoding (WebCrypto `Ed25519` sign).

Header: `{"alg":"EdDSA","kid":"grabify-prod-1"}`

Payload (`Entitlement`, see `entitlement.go`):

```json
{
  "v": 1,
  "licenseId": "lic_...",
  "product": "grabify-pro-lifetime",
  "tier": "pro",
  "edition": "lifetime",
  "versionScope": "1.x",
  "deviceId": "dev-<hex>",
  "deviceName": "Alice-PC",
  "deviceLimit": 3,
  "status": "active",          // active | refunded | revoked
  "issuedAt":  "RFC3339",
  "refreshBy": "RFC3339",       // issuedAt + 90d
  "graceDays": 30
}
```

Client evaluation (`Entitlement.Evaluate`): device must match this install;
`refunded`/`revoked` → Free; `now <= refreshBy` → Pro; within grace → Pro (warn);
past grace → Free.

## Backend endpoint contract (Track 2 must implement)

Base URL from `GRABIFY_LICENSE_API` (default `https://api.grabify.app`). All
POST, JSON. Errors: non-2xx with `{"error":{"code","message"}}`. Known codes in
`client.go` (`device_limit_reached`, `license_not_found`, `license_revoked`,
`device_not_found`, `rate_limited`).

- `POST /v1/activate` `{licenseKey, deviceId, deviceName}` → `{token, devices[]}`
- `POST /v1/refresh` `{licenseKey, deviceId}` → `{token}`
- `POST /v1/deactivate` `{licenseKey, deviceId, targetDeviceId}` → `{}`
- `POST /v1/devices` `{licenseKey, deviceId}` → `{devices[]}`
- `POST /v1/recover` `{email}` → `{}` (never reveals whether the email exists)
- `POST /v1/webhooks/paddle` — Paddle signature-verified; idempotent on event id.

`device` = `{deviceId, name, activatedAt, lastSeenAt?}`.

Planned storage: D1 tables `licenses`, `activations`, `payments`,
`webhook_events`; one **Durable Object per license** serializes
activation/deactivation to guarantee the 3-device cap.

## Deployment status

- **Deployed:** Worker at `https://grabify-licensing.siamekanto.workers.dev`
  (Cloudflare account siamekanto360@gmail.com), with D1 `grabify-licensing`
  (id `1ed3f3b6-…`, schema applied) and the `LicenseDurableObject` bound.
- **Secrets set:** `CERT_SIGNING_KEY` (production Ed25519 private, pkcs8),
  `LICENSE_KEY_PEPPER` (random). The matching public key is baked into
  `backend/license/keys.go` and `defaultAPIBase` points at the Worker.
- **Deferred to Track 4:** `PADDLE_WEBHOOK_SECRET` (webhook returns 401 until
  set — no provisioning yet), `EMAIL_API_KEY` (key-delivery email is skipped),
  and a custom domain (`api.grabify.app`) in front of the workers.dev URL.
- Verified live: `/health`, `activate` (unknown key → 404), `recover` (200),
  webhook (bad sig → 401). Full provision→activate cycle is covered by the
  workerd test suite; the prod signing key and baked public key are a matched
  pair by construction.

## Keys & secrets

- **Production Ed25519 keypair** was generated during deploy: private half →
  Cloudflare Worker secret `CERT_SIGNING_KEY`; public half →
  `productionPublicKeyB64` in `keys.go` (kid `grabify-prod-1`). Rotate by
  shipping a build that trusts both old and new keys, or override at build time
  with `-ldflags "-X idm-next/backend/license.productionPublicKeyB64=..."`.
- If `productionPublicKeyB64` is ever empty, the app trusts no prod key and
  stays Free-only (correct fail-closed default).
- **Local testing today:** `go run ./cmd/grabify-licgen keygen`, set
  `GRABIFY_LICENSE_PUBKEY=<public>` in the app's env (trusted under kid
  `grabify-dev`), then `go run ./cmd/grabify-licgen sign -priv <private>
  -device <id from the License page>` and drop the token into
  `%APPDATA%/Grabby/license.json` → `token`.
- Worker-only secrets (Track 2/4): Paddle API key, Paddle webhook secret, cert
  signing key, email API key, key pepper. Never in the client.
