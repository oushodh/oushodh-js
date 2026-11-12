import { afterEach, describe, expect, it, vi } from "vitest";
import pkg from "../package.json" with { type: "json" };
import {
  AuthenticationError,
  BadRequestError,
  ConnectionError,
  type FetchLike,
  NotFoundError,
  Oushodh,
  OushodhError,
  PlanError,
  RateLimitError,
  ServerError,
  TimeoutError,
  VERSION,
} from "../src/index.js";

const KEY = "oush_test_123";

interface Call {
  url: URL;
  headers: Record<string, string>;
}

type Reply = Response | (() => Response | Promise<Response>);

function mock(...replies: Reply[]) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (input, init) => {
    calls.push({ url: new URL(input), headers: { ...(init.headers as Record<string, string>) } });

    const reply = replies.shift();

    if (!reply) {
      throw new Error("No more replies");
    }

    return typeof reply === "function" ? reply() : reply;
  };

  return { calls, fetch };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function apiError(status: number, code: string, message = "Something", headers: Record<string, string> = {}) {
  return json({ error: { code, message } }, status, headers);
}

function client(fetch: FetchLike, maxRetries = 2) {
  return new Oushodh({ apiKey: KEY, fetch, maxRetries, baseUrl: "http://mock.test" });
}

const medicine = (id: string) => ({ id, uuid: `uuid-${id}`, brand: "Napa", extra_field: "kept" });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("construction", () => {
  it("fails without a key", () => {
    vi.stubEnv("OUSHODH_API_KEY", "");

    expect(() => new Oushodh()).toThrow(/No API key/);
  });

  it("reads OUSHODH_API_KEY", async () => {
    vi.stubEnv("OUSHODH_API_KEY", KEY);

    const { calls, fetch } = mock(json({ client: "acme" }));

    await new Oushodh({ fetch }).meta();

    expect(calls[0]?.headers.Authorization).toBe(`Bearer ${KEY}`);
  });

  it("keeps the key out of the object's printed form", () => {
    const sdk = client(mock().fetch);

    expect(JSON.stringify(sdk)).not.toContain(KEY);
    expect(Object.values(sdk).join(" ")).not.toContain(KEY);
  });

  it("matches the package version", () => {
    expect(VERSION).toBe(pkg.version);
  });
});

describe("routes", () => {
  it("meta sends the key and the user agent", async () => {
    const meta = { client: "acme", id_profile: "default", medicines: 5000, last_import: null };
    const { calls, fetch } = mock(json(meta));

    expect(await client(fetch).meta()).toEqual(meta);
    expect(calls[0]?.url.href).toBe("http://mock.test/v1/meta");
    expect(calls[0]?.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(calls[0]?.headers["User-Agent"]).toBe(`oushodh-js/${VERSION}`);
  });

  it("listMedicines sends every query parameter", async () => {
    const { calls, fetch } = mock(json({ items: [], next: null, total: 0 }));

    await client(fetch).listMedicines({ limit: 500, cursor: "abc", updatedSince: "2026-11-08T09:30:00Z", q: "napa" });

    const url = calls[0]?.url;

    expect(url?.pathname).toBe("/v1/medicines");
    expect(Object.fromEntries(url?.searchParams ?? [])).toEqual({
      limit: "500",
      cursor: "abc",
      updated_since: "2026-11-08T09:30:00Z",
      q: "napa",
    });
  });

  it("listMedicines leaves out unset parameters", async () => {
    const { calls, fetch } = mock(json({ items: [], next: null, total: 0 }));

    await client(fetch).listMedicines();

    expect(calls[0]?.url.href).toBe("http://mock.test/v1/medicines");
  });

  it("search sends q and limit", async () => {
    const { calls, fetch } = mock(json({ items: [medicine("MED-1")], total: 1 }));
    const result = await client(fetch).search("napa 500", { limit: 5 });

    expect(result.total).toBe(1);
    expect(calls[0]?.url.pathname).toBe("/v1/medicines/search");
    expect(calls[0]?.url.searchParams.get("q")).toBe("napa 500");
    expect(calls[0]?.url.searchParams.get("limit")).toBe("5");
  });

  it("getMedicine encodes the ref and keeps unknown fields", async () => {
    const { calls, fetch } = mock(json({ ...medicine("MED-012933"), monograph: null }));
    const found = await client(fetch).getMedicine("MED/012933");

    expect(calls[0]?.url.pathname).toBe("/v1/medicines/MED%2F012933");
    expect(found.monograph).toBeNull();
    expect((found as unknown as Record<string, unknown>).extra_field).toBe("kept");
  });
});

describe("paging", () => {
  it("follows next to the end", async () => {
    const { calls, fetch } = mock(
      json({ items: [medicine("1"), medicine("2")], next: "c2", total: 5 }),
      json({ items: [medicine("3"), medicine("4")], next: "c3", total: 5 }),
      json({ items: [medicine("5")], next: null, total: 5 }),
    );
    const ids: string[] = [];

    for await (const item of client(fetch).medicines({ limit: 2, updatedSince: "2026-11-08T09:30:00Z" })) {
      ids.push(item.id);
    }

    expect(ids).toEqual(["1", "2", "3", "4", "5"]);
    expect(calls.map((call) => call.url.searchParams.get("cursor"))).toEqual([null, "c2", "c3"]);
    expect(calls.every((call) => call.url.searchParams.get("updated_since") === "2026-11-08T09:30:00Z")).toBe(true);
    expect(calls.every((call) => call.url.searchParams.get("limit") === "2")).toBe(true);
  });
});

describe("errors", () => {
  it.each([
    [400, "bad_request", BadRequestError],
    [401, "unauthorized", AuthenticationError],
    [403, "plan_expired", PlanError],
    [403, "plan_limit", PlanError],
    [404, "not_found", NotFoundError],
    [429, "quota_exceeded", RateLimitError],
    [500, "internal", ServerError],
  ] as const)("%i %s", async (status, code, kind) => {
    const { calls, fetch } = mock(apiError(status, code, "For people"));
    const error = await client(fetch, 0)
      .getMedicine("MED-1")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(kind);
    expect(error).toBeInstanceOf(OushodhError);
    expect(error).toMatchObject({ status, code, message: "For people" });
    expect(calls).toHaveLength(1);
  });

  it("does not retry a 404", async () => {
    const { calls, fetch } = mock(apiError(404, "not_found"), json({}));

    await expect(client(fetch).getMedicine("MED-999999")).rejects.toBeInstanceOf(NotFoundError);
    expect(calls).toHaveLength(1);
  });

  it("does not retry quota_exceeded", async () => {
    const { calls, fetch } = mock(apiError(429, "quota_exceeded", "Used up", { "Retry-After": "86400" }), json({}));
    const error = await client(fetch)
      .meta()
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: "quota_exceeded", retryAfter: 86400 });
    expect(calls).toHaveLength(1);
  });

  it("handles a body that is not JSON", async () => {
    const { fetch } = mock(new Response("Bad gateway", { status: 502 }));
    const error = await client(fetch, 0)
      .meta()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ServerError);
    expect(error).toMatchObject({ status: 502, code: null });
  });

  it("wraps a network failure", async () => {
    const { fetch } = mock(() => {
      throw new TypeError("fetch failed");
    });
    const error = await client(fetch, 0)
      .meta()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConnectionError);
    expect(error).toMatchObject({ status: null, code: null });
  });

  it("times out", async () => {
    const fetch: FetchLike = (_input, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    const sdk = new Oushodh({ apiKey: KEY, fetch, timeout: 10, maxRetries: 0 });

    await expect(sdk.meta()).rejects.toBeInstanceOf(TimeoutError);
  });

  it("never puts the key in error text", async () => {
    const replies = [
      apiError(401, "unauthorized", "A valid API key is required"),
      apiError(500, "internal"),
      () => {
        throw new TypeError("fetch failed");
      },
    ];

    for (const reply of replies) {
      const error = (await client(mock(reply).fetch, 0)
        .meta()
        .catch((e: unknown) => e)) as Error;
      const text = `${error.message} ${error.stack} ${String(error.cause)} ${JSON.stringify(error)}`;

      expect(text).not.toContain(KEY);
    }
  });
});

describe("retries", () => {
  it("waits Retry-After on 429, then succeeds", async () => {
    vi.useFakeTimers();

    const { calls, fetch } = mock(
      apiError(429, "rate_limited", "More than 60 requests in a minute", { "Retry-After": "12" }),
      json({ client: "acme" }),
    );
    const pending = client(fetch).meta();

    await vi.advanceTimersByTimeAsync(11_900);
    expect(calls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(200);
    expect(await pending).toEqual({ client: "acme" });
    expect(calls).toHaveLength(2);
  });

  it("retries a 5xx, then succeeds", async () => {
    vi.useFakeTimers();

    const { calls, fetch } = mock(apiError(500, "internal"), apiError(503, "internal"), json({ client: "acme" }));
    const pending = client(fetch).meta();

    await vi.runAllTimersAsync();
    expect(await pending).toEqual({ client: "acme" });
    expect(calls).toHaveLength(3);
  });

  it("stops after maxRetries", async () => {
    vi.useFakeTimers();

    const { calls, fetch } = mock(apiError(500, "internal"), apiError(500, "internal"), apiError(500, "internal"));
    const pending = client(fetch, 1)
      .meta()
      .catch((e: unknown) => e);

    await vi.runAllTimersAsync();
    expect(await pending).toBeInstanceOf(ServerError);
    expect(calls).toHaveLength(2);
  });

  it("retries a network error", async () => {
    vi.useFakeTimers();

    const { calls, fetch } = mock(
      () => {
        throw new TypeError("fetch failed");
      },
      json({ client: "acme" }),
    );
    const pending = client(fetch).meta();

    await vi.runAllTimersAsync();
    expect(await pending).toEqual({ client: "acme" });
    expect(calls).toHaveLength(2);
  });
});

describe("images", () => {
  const file = `${"a".repeat(64)}.jpg`;

  it("builds the address", () => {
    expect(client(mock().fetch).imageUrl(file)).toBe(`http://mock.test/v1/images/${file}`);
  });

  it("fetches the bytes without the key", async () => {
    const { calls, fetch } = mock(
      new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } }),
    );
    const bytes = await client(fetch).getImage(file);

    expect([...bytes]).toEqual([1, 2, 3]);
    expect(calls[0]?.url.pathname).toBe(`/v1/images/${file}`);
    expect(calls[0]?.headers.Authorization).toBeUndefined();
  });

  it("raises NotFoundError for a missing picture", async () => {
    const { fetch } = mock(apiError(404, "not_found", "No such picture"));

    await expect(client(fetch).getImage(file)).rejects.toBeInstanceOf(NotFoundError);
  });
});
