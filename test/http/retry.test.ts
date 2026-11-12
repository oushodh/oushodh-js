import { describe, expect, it } from "vitest";
import { BadRequestError, RateLimitError, ServerError } from "../../src/errors/index.js";
import { retryDelay } from "../../src/http/retry.js";

describe("retryDelay", () => {
  it("waits Retry-After on rate_limited", () => {
    const error = new RateLimitError("slow down", 429, "rate_limited", 3);

    expect(retryDelay(error, 0, 2)).toBe(3000);
  });

  it("never retries quota_exceeded", () => {
    const error = new RateLimitError("month used", 429, "quota_exceeded", 86_400);

    expect(retryDelay(error, 0, 2)).toBeNull();
  });

  it("backs off on a 5xx up to 8 seconds", () => {
    const delay = retryDelay(new ServerError("boom", 500, "internal"), 10, 20);

    expect(delay).toBeGreaterThanOrEqual(4000);
    expect(delay).toBeLessThanOrEqual(8000);
  });

  it("stops at maxRetries and never retries a 400", () => {
    expect(retryDelay(new ServerError("boom", 500, "internal"), 2, 2)).toBeNull();
    expect(retryDelay(new BadRequestError("bad", 400, "bad_request"), 0, 2)).toBeNull();
  });
});
