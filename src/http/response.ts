import {
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  OushodhError,
  PlanError,
  RateLimitError,
  ServerError,
} from "../errors/index.js";

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
