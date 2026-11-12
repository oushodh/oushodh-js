import { ConnectionError, RateLimitError, ServerError } from "../errors/index.js";

/** Milliseconds to wait before the next try, or `null` when the error must not be retried. */
export function retryDelay(error: unknown, attempt: number, maxRetries: number): number | null {
  if (attempt >= maxRetries) {
    return null;
  }

  if (error instanceof RateLimitError) {
    // quota_exceeded's Retry-After runs to the next month, so waiting is never right.
    if (error.code === "quota_exceeded") {
      return null;
    }

    if (error.retryAfter !== null) {
      return error.retryAfter * 1000;
    }

    return backoff(attempt);
  }

  if (error instanceof ServerError || error instanceof ConnectionError) {
    return backoff(attempt);
  }

  return null;
}

function backoff(attempt: number): number {
  const base = Math.min(8000, 500 * 2 ** attempt);

  return base / 2 + Math.random() * (base / 2);
}
