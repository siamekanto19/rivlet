import type { Env } from "./env.js";
import { errorResponse, json, ApiError, ErrorCodes } from "./http.js";
import {
  handleActivate,
  handleRefresh,
  handleDeactivate,
  handleDevices,
  handleRecover,
  handleOrder,
  handleAccount,
  handleAccountDeactivate,
  handleWebhook,
} from "./handlers.js";

export { LicenseDurableObject } from "./license-do.js";

type Handler = (env: Env, request: Request) => Promise<Response>;

const routes: Record<string, Handler> = {
  "POST /v1/activate": handleActivate,
  "POST /v1/refresh": handleRefresh,
  "POST /v1/deactivate": handleDeactivate,
  "POST /v1/devices": handleDevices,
  "POST /v1/recover": handleRecover,
  "POST /v1/order": handleOrder,
  "GET /v1/account": handleAccount,
  "POST /v1/account/deactivate": handleAccountDeactivate,
  "POST /v1/webhooks/paddle": handleWebhook,
};

// Endpoints called from the browser (checkout success page + dashboard) need
// CORS. The desktop app calls the others from Go, which doesn't require it.
const browserPaths = new Set(["/v1/order", "/v1/account", "/v1/account/deactivate"]);
const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-max-age": "86400",
};

function withCors(resp: Response): Response {
  const out = new Response(resp.body, resp);
  for (const [k, v] of Object.entries(CORS_HEADERS)) out.headers.set(k, v);
  return out;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return json({ ok: true, service: "grabify-licensing" });
    }
    // CORS preflight for browser-called endpoints.
    if (request.method === "OPTIONS" && browserPaths.has(url.pathname)) {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const route = routes[`${request.method} ${url.pathname}`];
    if (!route) {
      return errorResponse(new ApiError(404, ErrorCodes.badRequest, "not found"));
    }
    const cors = browserPaths.has(url.pathname);
    try {
      const resp = await route(env, request);
      return cors ? withCors(resp) : resp;
    } catch (err) {
      if (!(err instanceof ApiError)) {
        console.error("unhandled error:", err);
      }
      const resp = errorResponse(err);
      return cors ? withCors(resp) : resp;
    }
  },
} satisfies ExportedHandler<Env>;
