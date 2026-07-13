/// <reference types="@cloudflare/vitest-pool-workers" />

import type { Env } from "../src/env.js";

declare module "cloudflare:test" {
  // Make `env` from cloudflare:test carry our Worker's bindings.
  interface ProvidedEnv extends Env {}
}
