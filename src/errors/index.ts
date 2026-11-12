export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "plan_expired"
  | "plan_limit"
  | "not_found"
  | "rate_limited"
  | "quota_exceeded"
  | "internal";

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
