import { ConnectionError, errorFor, OushodhError, RateLimitError, ServerError, TimeoutError } from "./errors.js";
import type { Medicine, MedicineDetail, Meta, Page, SearchResult } from "./types.js";

export const VERSION = "0.1.0";

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface OushodhOptions {
  /** An API key from the member portal. Defaults to the `OUSHODH_API_KEY` environment variable. */
  apiKey?: string;
  /** Defaults to `https://api.oushodh.dev`. */
  baseUrl?: string;
  /** Milliseconds before one attempt gives up. Defaults to 30000. */
  timeout?: number;
  /** Retries after a 429, a 5xx or a network error. Defaults to 2. */
  maxRetries?: number;
  /** A `fetch` to use instead of the platform's, for tests or proxies. */
  fetch?: FetchLike;
}

export interface ListMedicinesParams {
  /** Medicines on one page, 1 to 500. The API's default is 100. */
  limit?: number;
  /** The `next` value from the page before. */
  cursor?: string;
  /** Only medicines changed at or after this time, written like `2026-11-08T09:30:00Z`. */
  updatedSince?: string;
  /** Only medicines whose brand, generic or manufacturer starts with these words, or whose ID matches. */
  q?: string;
}

export interface SearchParams {
  /** Most medicines to return, 1 to 50. The API's default is 20. */
  limit?: number;
}

type Query = Record<string, string | number | undefined>;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function envKey(): string | undefined {
  const process = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;

  return process?.env?.OUSHODH_API_KEY;
}

export class Oushodh {
  readonly baseUrl: string;
  readonly timeout: number;
  readonly maxRetries: number;
  readonly #apiKey: string;
  readonly #fetch: FetchLike;

  constructor(options: OushodhOptions = {}) {
    const apiKey = options.apiKey ?? envKey();

    if (!apiKey) {
      throw new OushodhError("No API key. Pass apiKey or set the OUSHODH_API_KEY environment variable.", null, null);
    }

    this.#apiKey = apiKey;
    this.#fetch = options.fetch ?? ((input, init) => fetch(input, init));
    this.baseUrl = (options.baseUrl ?? "https://api.oushodh.dev").replace(/\/+$/, "");
    this.timeout = options.timeout ?? 30_000;
    this.maxRetries = options.maxRetries ?? 2;
  }

  /** The account the key belongs to. Use it to check that a key works. */
  meta(): Promise<Meta> {
    return this.#json("/v1/meta", {});
  }

  /** One page of medicines, in the order of their permanent number. */
  listMedicines(params: ListMedicinesParams = {}): Promise<Page> {
    return this.#json("/v1/medicines", {
      limit: params.limit,
      cursor: params.cursor,
      updated_since: params.updatedSince,
      q: params.q,
    });
  }

  /** Every medicine, page after page, to the end. */
  async *medicines(params: ListMedicinesParams = {}): AsyncGenerator<Medicine, void, undefined> {
    let cursor = params.cursor;

    while (true) {
      const page = await this.listMedicines({ ...params, cursor });

      yield* page.items;

      if (page.next === null) {
        return;
      }

      cursor = page.next;
    }
  }

  /** The best matches for a person typing a name, best match first. */
  search(q: string, params: SearchParams = {}): Promise<SearchResult> {
    return this.#json("/v1/medicines/search", { q, limit: params.limit });
  }

  /** One medicine by its ID in any profile, an old ID, or its UUID. */
  getMedicine(ref: string): Promise<MedicineDetail> {
    return this.#json(`/v1/medicines/${encodeURIComponent(ref)}`, {});
  }

  /** The address of a picture. It needs no key, so an `<img>` tag can show it. */
  imageUrl(file: string): string {
    return `${this.baseUrl}/v1/images/${encodeURIComponent(file)}`;
  }

  /** The bytes of a picture. The request carries no key. */
  async getImage(file: string): Promise<Uint8Array> {
    const buffer = await this.#request(this.imageUrl(file), false, (response) => response.arrayBuffer());

    return new Uint8Array(buffer);
  }

  #json<T>(path: string, query: Query): Promise<T> {
    const search = new URLSearchParams();

    for (const [name, value] of Object.entries(query)) {
      if (value !== undefined) {
        search.set(name, String(value));
      }
    }

    const qs = search.toString();
    const url = `${this.baseUrl}${path}${qs ? `?${qs}` : ""}`;

    return this.#request(url, true, (response) => response.json() as Promise<T>);
  }

  async #request<T>(url: string, auth: boolean, read: (response: Response) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.#send(url, auth, read);
      } catch (error) {
        const delay = this.#retryDelay(error, attempt);

        if (delay === null) {
          throw error;
        }

        await sleep(delay);
      }
    }
  }

  async #send<T>(url: string, auth: boolean, read: (response: Response) => Promise<T>): Promise<T> {
    const headers: Record<string, string> = { "User-Agent": `oushodh-js/${VERSION}` };

    if (auth) {
      headers.Authorization = `Bearer ${this.#apiKey}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    let response: Response;
    let body: unknown;

    try {
      response = await this.#fetch(url, { method: "GET", headers, signal: controller.signal });

      if (response.ok) {
        return await read(response);
      }

      body = await response.json().catch(() => null);
    } catch (cause) {
      if (controller.signal.aborted) {
        throw new TimeoutError(`The request timed out after ${this.timeout} ms`, { cause });
      }

      throw new ConnectionError("The request could not reach the Oushodh API", { cause });
    } finally {
      clearTimeout(timer);
    }

    const retryAfter = Number.parseInt(response.headers.get("retry-after") ?? "", 10);

    throw errorFor(response.status, body, Number.isNaN(retryAfter) ? null : retryAfter);
  }

  #retryDelay(error: unknown, attempt: number): number | null {
    if (attempt >= this.maxRetries) {
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

      return this.#backoff(attempt);
    }

    if (error instanceof ServerError || error instanceof ConnectionError) {
      return this.#backoff(attempt);
    }

    return null;
  }

  #backoff(attempt: number): number {
    const base = Math.min(8000, 500 * 2 ** attempt);

    return base / 2 + Math.random() * (base / 2);
  }
}
