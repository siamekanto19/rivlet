// JSON response helpers and the structured error envelope the Go client expects:
//   { "error": { "code": "...", "message": "..." } }
// The `code` values are stable and matched against constants in the desktop
// client (backend/license/client.go).

export const ErrorCodes = {
  badRequest: "bad_request",
  licenseNotFound: "license_not_found",
  licenseRevoked: "license_revoked",
  deviceLimitReached: "device_limit_reached",
  deviceNotFound: "device_not_found",
  rateLimited: "rate_limited",
  invalidSignature: "invalid_signature",
  unauthorized: "unauthorized",
  serverError: "server_error",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class ApiError extends Error {
  code: ErrorCode;
  status: number;
  constructor(status: number, code: ErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return json({ error: { code: err.code, message: err.message } }, err.status);
  }
  return json(
    { error: { code: ErrorCodes.serverError, message: "internal error" } },
    500,
  );
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError(400, ErrorCodes.badRequest, "invalid JSON body");
  }
}
