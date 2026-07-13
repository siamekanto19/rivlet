import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
import { readFileSync } from "node:fs";

// Shared test keypair (also used by the Go cross-compat check). The Worker signs
// with the pkcs8 private key; tests verify with the raw public key.
const keys = JSON.parse(readFileSync(new URL("./test/keys.json", import.meta.url), "utf8"));

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          // Test values for the secrets/vars the Worker reads. CERT_KID is set to
          // the dev kid so the same tokens verify in the Go client during the
          // cross-compat test.
          bindings: {
            CERT_KID: "rivlet-dev",
            CERT_SIGNING_KEY: keys.privatePkcs8,
            LICENSE_KEY_PEPPER: "test-pepper",
            PADDLE_WEBHOOK_SECRET: "test-webhook-secret",
            EMAIL_API_KEY: "",
          },
        },
      },
    },
  },
});
