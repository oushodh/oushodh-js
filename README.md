# Oushodh JavaScript SDK

The official JavaScript and TypeScript client for the Oushodh API.

[![CI](https://github.com/oushodh/oushodh-js/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/oushodh/oushodh-js/actions/workflows/ci.yml)
[![Licence: MIT](https://img.shields.io/github/license/oushodh/oushodh-js)](LICENSE)
[![npm](https://img.shields.io/npm/v/@oushodh/sdk)](https://www.npmjs.com/package/@oushodh/sdk)
[![Node.js 20+](https://img.shields.io/badge/node-20%2B-5fa04e)](https://nodejs.org/)

## What Oushodh is

Oushodh serves Bangladesh medicine data over a REST API: brands, generics, prices and makers. Make a key in the member
portal at [app.oushodh.dev](https://app.oushodh.dev), and read the docs at [oushodh.dev/docs](https://oushodh.dev/docs).

The SDK is written in TypeScript and ships as ESM with types. It has no runtime dependencies: it uses the platform's
`fetch`. It needs Node.js 20 or newer, or another runtime with `fetch`.

## Install

```sh
npm install @oushodh/sdk
```

Or with pnpm:

```sh
pnpm add @oushodh/sdk
```

The same code is also on npm as `oushodh`. If you install that name, import from `"oushodh"` instead.

## Quickstart

Make a key on the Keys page of the member portal. A key starts with `oush_` and is shown once. Keep it on your
server: never put it in a web page, a mobile app or a public repository.

```sh
export OUSHODH_API_KEY=oush_...
```

```ts
import { Oushodh } from "@oushodh/sdk";

const oushodh = new Oushodh(); // reads OUSHODH_API_KEY

const result = await oushodh.search("paracetamol", { limit: 5 });

for (const medicine of result.items) {
  console.log(medicine.id, medicine.product_name);
}

const medicine = await oushodh.getMedicine("MED-012933");

console.log(medicine.product_name, medicine.prices.unit?.amount, "BDT a unit");
```

`new Oushodh({ apiKey: "oush_..." })` takes the key directly. With no key and no `OUSHODH_API_KEY`, the constructor
throws an `OushodhError`.

| Method                                              | Route                          | Returns                          |
| --------------------------------------------------- | ------------------------------ | -------------------------------- |
| `meta()`                                            | `GET /v1/meta`                 | `Promise<Meta>`                  |
| `listMedicines({ limit, cursor, updatedSince, q })` | `GET /v1/medicines`            | `Promise<Page>`                  |
| `medicines({ limit, cursor, updatedSince, q })`     | `GET /v1/medicines`, each page | `AsyncGenerator<Medicine>`       |
| `search(q, { limit })`                              | `GET /v1/medicines/search`     | `Promise<SearchResult>`          |
| `getMedicine(ref)`                                  | `GET /v1/medicines/{ref}`      | `Promise<MedicineDetail>`        |
| `imageUrl(file)`                                    | none                           | the picture's address            |
| `getImage(file)`                                    | `GET /v1/images/{file}`        | `Promise<Uint8Array>`, the bytes |

`meta()` names your account and counts the medicines your plan reads. Call it to check that a key works.

`getMedicine()` takes an ID in any profile, an old ID or a UUID. The answer always carries the medicine's current ID,
and its `monograph`.

Fields keep their API names, such as `product_name`. A value no source gives is `null`. The API only gains fields in
`/v1`, and the SDK keeps fields it does not know.

## Paging

`listMedicines()` returns one page: `items`, `next` and `total`. Pass `next` back as `cursor` for the next page.
`next` is `null` on the last page. `limit` is 1 to 500, and 100 when you leave it out.

```ts
let page = await oushodh.listMedicines({ limit: 500 });

while (true) {
  for (const medicine of page.items) {
    // ...
  }

  if (page.next === null) {
    break;
  }

  page = await oushodh.listMedicines({ limit: 500, cursor: page.next });
}
```

`medicines()` does the same for you. Use it with `for await`: it yields every medicine and follows `next` to the end.

```ts
for await (const medicine of oushodh.medicines({ limit: 500 })) {
  console.log(medicine.id, medicine.product_name);
}
```

Search has no cursor. To page through every match, use `medicines({ q })`.

## Keeping a copy in sync

Copy every medicine once, then fetch only what changed.

1. The first sync pages through every medicine and keeps the newest `last_updated`.
2. Each later sync passes that time as `updatedSince` and pages to the end. It gets the medicines changed at or after
   that time, oldest change first.

```ts
let since: string | undefined = await loadLastSync(); // undefined on the first sync

for await (const medicine of oushodh.medicines({ limit: 500, updatedSince: since })) {
  await saveMedicine(medicine.uuid, medicine);

  if (since === undefined || medicine.last_updated > since) {
    since = medicine.last_updated;
  }
}

await saveLastSync(since);
```

- `updatedSince` is a string in UTC, to the whole second, such as `2026-11-08T09:30:00Z`. The `last_updated` of a
  medicine is already in that form.
- "At or after" means a change in the same second is never missed. The medicine that set the time comes back once
  more, so save by `uuid`.
- Store `uuid` as the key: it never changes. Show `id` to people.
- Medicines are never deleted and IDs are never reused, so a sync never has to remove one.

## Images

`product_image` is the address of the medicine's picture, or `null`. `images` lists every picture, `product_image`
first. An address under `/v1/images/` is a copy Oushodh keeps. It needs no key, so an `<img>` tag can show it, and it
never changes. Any other address belongs to the source, and it can move or be removed.

`getImage()` takes the file name, not the whole address, and sends no key:

```ts
const url = medicine.product_image;

if (url !== null && url.startsWith(oushodh.imageUrl(""))) {
  const jpeg = await oushodh.getImage(url.slice(url.lastIndexOf("/") + 1));
}
```

`imageUrl(file)` builds the address of a file, such as
`50d858e0985ecc7f60418aaf0cc5ab587f42c2570a884095a9e8ccacd0f6545c.jpg`.

## Errors

Every error extends `OushodhError`. It has `status` (the HTTP status), `code` (the API's error code) and `message`.
Match on the class or on `code`, never on `message`: the message is for people and may change.

| Class                 | Status | `code`                             |
| --------------------- | ------ | ---------------------------------- |
| `BadRequestError`     | 400    | `bad_request`                      |
| `AuthenticationError` | 401    | `unauthorized`                     |
| `PlanError`           | 403    | `plan_expired` or `plan_limit`     |
| `NotFoundError`       | 404    | `not_found`                        |
| `RateLimitError`      | 429    | `rate_limited` or `quota_exceeded` |
| `ServerError`         | 5xx    | `internal`                         |
| `ConnectionError`     | none   | none: the network failed           |
| `TimeoutError`        | none   | none: the attempt timed out        |

`TimeoutError` extends `ConnectionError`. Both have `status` and `code` set to `null`. When an error body is not JSON,
`code` is `null` and the message is `HTTP <status>`. The key never appears in an error message or a URL.

```ts
import { NotFoundError, PlanError } from "@oushodh/sdk";

try {
  await oushodh.getMedicine("MED-999999");
} catch (error) {
  if (error instanceof NotFoundError) {
    // No medicine has that ID.
  } else if (error instanceof PlanError && error.code === "plan_limit") {
    // The medicine is beyond the medicines your plan reads.
  } else {
    throw error;
  }
}
```

## Retries and rate limits

Your plan sets how many requests each key may make in a minute (60 a minute on Developer). It also sets how many
requests your account may make in a month. See [Rate limits](https://oushodh.dev/docs/rate-limits).

- Over the minute's limit, the API answers `429 rate_limited`. The `Retry-After` header says how many seconds to wait.
  The client waits that long and tries again, up to `maxRetries` times. After that it throws a `RateLimitError` with
  the seconds in `retryAfter`.
- When the month's requests are used up, the API answers `429 quota_exceeded` until the next month. The client never
  retries it. It throws a `RateLimitError` at once, and `retryAfter` counts the seconds to the next month.
- After a `5xx`, a network error or a timeout, the client backs off and tries again, up to `maxRetries` times. Each
  wait is about twice the last, with a random part, and at most 8 seconds.
- The client never retries a `400`, `401`, `403` or `404`: the same request gets the same answer.

Every route is a `GET`, so a retry is always safe. Set `maxRetries: 0` to turn retries off.

## Plan limits

Developer reads the first 5,000 medicines and Team the first 20,000, in the order of their permanent number. Agency
and Custom read all of them.

Lists and search leave out the medicines beyond your plan's number. A lookup by ID of such a medicine answers
`403 plan_limit`: the client throws a `PlanError` with `code` `plan_limit`. An account with no active plan gets
`403 plan_expired` on every call.

## Configuration

Pass options to the constructor:

```ts
const oushodh = new Oushodh({ apiKey: "oush_...", timeout: 10_000, maxRetries: 3 });
```

| Option       | Default                   | What it does                                                    |
| ------------ | ------------------------- | --------------------------------------------------------------- |
| `apiKey`     | `OUSHODH_API_KEY`         | Your API key.                                                   |
| `baseUrl`    | `https://api.oushodh.dev` | Where the API is.                                               |
| `timeout`    | `30000`                   | Milliseconds before one attempt gives up.                       |
| `maxRetries` | `2`                       | Retries after a `429 rate_limited`, a `5xx` or a network error. |
| `fetch`      | the platform's `fetch`    | Another `fetch` to use, for tests or a proxy.                   |

In your own tests, pass a `fetch` that answers without the network:

```ts
const oushodh = new Oushodh({
  apiKey: "oush_test_123",
  fetch: async () => Response.json({ client: "acme", id_profile: "default", medicines: 1, last_import: null }),
});
```

## Development

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm lint` runs Biome, `pnpm typecheck` runs TypeScript and `pnpm test` runs Vitest. The tests pass their own
`fetch`. They never call the API.

## Licence

MIT. Copyright Oushodh. See [LICENSE](LICENSE).
