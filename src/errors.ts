import type { ErrorCode } from "./types.js";

export class OushodhError extends Error {
  override name = "OushodhError";

  constructor(
    message: string,
    readonly status: number | null,
    readonly code: ErrorCode | (string & {}) | null,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class BadRequestError extends OushodhError {
  override name = "BadRequestError";
}

export class AuthenticationError extends OushodhError {
  override name = "AuthenticationError";
}

export class PlanError extends OushodhError {
  override name = "PlanError";
}

export class NotFoundError extends OushodhError {
  override name = "NotFoundError";
}

export class RateLimitError extends OushodhError {
  override name = "RateLimitError";

  constructor(
    message: string,
    status: number,
    code: ErrorCode | (string & {}) | null,
    readonly retryAfter: number | null,
  ) {
    super(message, status, code);
  }
}

export class ServerError extends OushodhError {
  override name = "ServerError";
}

export class ConnectionError extends OushodhError {
  override name = "ConnectionError";

  constructor(message: string, options?: ErrorOptions) {
    super(message, null, null, options);
  }
}

export class TimeoutError extends ConnectionError {
  override name = "TimeoutError";
}

export function errorFor(status: number, body: unknown, retryAfter: number | null): OushodhError {
  const error = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  const code = typeof error?.code === "string" ? error.code : null;
  const message = typeof error?.message === "string" ? error.message : `HTTP ${status}`;

  if (status === 400) {
    return new BadRequestError(message, status, code);
  }

  if (status === 401) {
    return new AuthenticationError(message, status, code);
  }

  if (status === 403) {
    return new PlanError(message, status, code);
  }

  if (status === 404) {
    return new NotFoundError(message, status, code);
  }

  if (status === 429) {
    return new RateLimitError(message, status, code, retryAfter);
  }

  if (status >= 500) {
    return new ServerError(message, status, code);
  }

  return new OushodhError(message, status, code);
}
