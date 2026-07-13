-- Accounts: purchases are made by a logged-in user (identity managed by Clerk).
-- We store only the Clerk user id on each license so the dashboard can show the
-- buyer their key and devices. No passwords/PII are stored here — Clerk owns
-- authentication.
ALTER TABLE licenses ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_licenses_user ON licenses(user_id);
