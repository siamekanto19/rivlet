-- Rivlet licensing schema.
--
-- License keys are NEVER stored in plaintext. Each row is keyed by
-- key_hash = base64(HMAC-SHA256(LICENSE_KEY_PEPPER, licenseKey)); the raw key is
-- emailed to the buyer at purchase and only ever seen again when the client
-- presents it (we re-hash to look up). A leaked DB dump yields no usable keys.

CREATE TABLE IF NOT EXISTS licenses (
  key_hash      TEXT PRIMARY KEY,
  license_id    TEXT NOT NULL UNIQUE,   -- stable id embedded in the certificate
  product       TEXT NOT NULL,
  edition       TEXT NOT NULL DEFAULT 'lifetime',
  version_scope TEXT NOT NULL DEFAULT '1.x',
  status        TEXT NOT NULL DEFAULT 'active',  -- active | refunded | revoked
  device_limit  INTEGER NOT NULL DEFAULT 3,
  email         TEXT,                   -- buyer email, for delivery + recovery
  paddle_txn_id TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_licenses_email ON licenses(email);

-- Device activations. Written only through a license's Durable Object, which
-- serializes access so the device limit is enforced atomically.
CREATE TABLE IF NOT EXISTS activations (
  key_hash     TEXT NOT NULL,
  device_id    TEXT NOT NULL,
  name         TEXT,
  activated_at TEXT NOT NULL,
  last_seen_at TEXT,
  PRIMARY KEY (key_hash, device_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id         TEXT PRIMARY KEY,         -- Paddle transaction id
  key_hash   TEXT,
  email      TEXT,
  amount     TEXT,
  currency   TEXT,
  status     TEXT,
  created_at TEXT NOT NULL
);

-- Idempotency ledger for Paddle webhooks: an event id is processed at most once.
CREATE TABLE IF NOT EXISTS webhook_events (
  event_id    TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  received_at TEXT NOT NULL
);
