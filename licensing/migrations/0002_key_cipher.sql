-- Store the license key encrypted at rest so it can be delivered to the buyer
-- after purchase (shown on the success screen and emailed). The key is still
-- never stored in plaintext: key_cipher holds AES-GCM(iv||ciphertext) using a
-- key derived from LICENSE_KEY_PEPPER. Lookups for activation still use key_hash.
ALTER TABLE licenses ADD COLUMN key_cipher TEXT;
