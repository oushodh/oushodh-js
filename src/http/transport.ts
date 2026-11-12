import { ConnectionError, TimeoutError } from "../errors/index.js";
import { errorFor } from "./response.js";
import { retryDelay } from "./retry.js";

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface TransportOptions {
  apiKey: string;
  fetch: FetchLike;
  timeout: number;
  maxRetries: number;
  userAgent: string;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Sends each GET with the key, the User-Agent and the timeout, and retries it. */
export class Transport {
  readonly #options: TransportOptions;

  constructor(options: TransportOptions) {
    this.#options = options;
  }

  async get<T>(url: string, auth: boolean, read: (response: Response) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.#send(url, auth, read);
      } catch (error) {
        const delay = retryDelay(error, attempt, this.#options.maxRetries);

        if (delay === null) {
          throw error;
        }

        await sleep(delay);
      }
    }
  }

  async #send<T>(url: string, auth: boolean, read: (response: Response) => Promise<T>): Promise<T> {
    const { apiKey, fetch, timeout, userAgent } = this.#options;
    const headers: Record<string, string> = { "User-Agent": userAgent };

    if (auth) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let response: Response;
    let body: unknown;

    try {
      response = await fetch(url, { method: "GET", headers, signal: controller.signal });

      if (response.ok) {
        return await read(response);
      }

      body = await response.json().catch(() => null);
    } catch (cause) {
      if (controller.signal.aborted) {
        throw new TimeoutError(`The request timed out after ${timeout} ms`, { cause });
      }

      throw new ConnectionError("The request could not reach the Oushodh API", { cause });
    } finally {
      clearTimeout(timer);
    }

    const retryAfter = Number.parseInt(response.headers.get("retry-after") ?? "", 10);

    throw errorFor(response.status, body, Number.isNaN(retryAfter) ? null : retryAfter);
  }
}
