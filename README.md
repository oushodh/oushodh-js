# Oushodh for JavaScript and TypeScript

The official SDK for the [Oushodh API](https://oushodh.dev/docs): medicine data for Bangladesh, checked against the DGDA register.

- Written in TypeScript, shipped as ESM with types.
- Runs on Node.js 20 or later, Bun, Deno, Cloudflare Workers and browsers.
- No runtime dependencies. It uses the platform's `fetch`.

Full API reference: <https://oushodh.dev/docs>.

## Install

Install from GitHub for now:

```sh
pnpm add github:oushodh/oushodh-js
```

The repository is private, so your GitHub account needs access to it.

From npm (coming soon):

```sh
pnpm add oushodh
```

## Quickstart

Make a key on the Keys page of the member portal at <https://app.oushodh.dev>. A key starts with `oush_` and is shown once.

Keep the key on your server. Never put it in a web page, a mobile app or a public repository.

```ts
import { Oushodh } from "oushodh";

const oushodh = new Oushodh({ apiKey: process.env.OUSHODH_API_KEY });

const meta = await oushodh.meta();

console.log(meta.client, meta.id_profile, meta.medicines);
```

With no `apiKey`, the client reads the `OUSHODH_API_KEY` environment variable. With no key at all, the constructor throws.

### Options

| Option       | Default                   | What it does                                      |
| ------------ | ------------------------- | ------------------------------------------------- |
| `apiKey`     | `OUSHODH_API_KEY`         | Your API key                                      |
| `baseUrl`    | `https://api.oushodh.dev` | Where the API lives                               |
| `timeout`    | `30000`                   | Milliseconds before one attempt gives up          |
| `maxRetries` | `2`                       | Retries after a `429`, a `5xx` or a network error |
| `fetch`      | the platform's `fetch`    | Another `fetch` to use, for tests or a proxy      |

## Medicines

```ts
const page = await oushodh.listMedicines({ limit: 100 });

console.log(page.total, page.items.length, page.next);

const napa = await oushodh.getMedicine("MED-012933");

console.log(napa.product_name, napa.prices.unit?.amount, napa.monograph?.indications);

const hits = await oushodh.search("napa 500", { limit: 10 });

console.log(hits.total, hits.items[0]?.product_name);
```

- `listMedicines()` returns one page: `items`, `next` and `total`. It takes `limit` (1 to 500), `cursor`, `updatedSince` and `q`.
- `getMedicine(ref)` takes an ID in any profile, an old ID or a UUID. The answer carries the medicine's current ID in your profile, and its `monograph`.
- `search(q)` returns the best matches for a person typing a name, best match first. It takes `limit` (1 to 50) and has no cursor.

Every value no source gives is `null`. The API only gains fields in `/v1`, and the SDK keeps fields it does not know.

## Paging

`medicines()` pages to the end for you. Use it with `for await`:

```ts
for await (const medicine of oushodh.medicines({ limit: 500 })) {
  console.log(medicine.id, medicine.product_name);
}
```

It takes the same options as `listMedicines()` and follows `next` until it is `null`.

## Sync

Copy the whole database once, then fetch only what changed.

1. The first sync pages through every medicine and keeps the `last_updated` of the newest one.
2. Each later sync passes that time as `updatedSince` and pages to the end.

```ts
let since: string | undefined = await loadLastSync();

for await (const medicine of oushodh.medicines({ limit: 500, updatedSince: since })) {
  await save(medicine.uuid, medicine);

  if (!since || medicine.last_updated > since) {
    since = medicine.last_updated;
  }
}

await storeLastSync(since);
```

- Write the time like `2026-11-08T09:30:00Z`.
- "At or after" means a change in the same second is never missed. The medicine that set the time comes back once more.
- Store the `uuid` as the key: it never changes. Show the `id` to people.
- Medicines are never deleted, and IDs are never reused.

## Errors

Every error extends `OushodhError`. It carries `status` (the HTTP status), `code` (from the API) and `message`.

Match on the class or on `code`, never on `message`. The message is for people and may change.

| Class                 | Status | `code`                           |
| --------------------- | ------ | -------------------------------- |
| `BadRequestError`     | 400    | `bad_request`                    |
| `AuthenticationError` | 401    | `unauthorized`                   |
| `PlanError`           | 403    | `plan_expired`, `plan_limit`     |
| `NotFoundError`       | 404    | `not_found`                      |
| `RateLimitError`      | 429    | `rate_limited`, `quota_exceeded` |
| `ServerError`         | 5xx    | `internal`                       |
| `ConnectionError`     | none   | none: the network failed         |
| `TimeoutError`        | none   | none: the attempt timed out      |

`TimeoutError` extends `ConnectionError`. Both have `status` and `code` set to `null`.

```ts
import { NotFoundError, PlanError, RateLimitError } from "oushodh";

try {
  await oushodh.getMedicine("MED-999999");
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log("No medicine has that ID");
  } else if (error instanceof PlanError && error.code === "plan_limit") {
    console.log("Upgrade your plan to read this medicine");
  } else if (error instanceof RateLimitError) {
    console.log(`Try again in ${error.retryAfter} seconds`);
  } else {
    throw error;
  }
}
```

The SDK never puts your key in an error message or a URL.

## Rate limits

Your plan sets how many requests each key may make in a minute: 60 on the smallest plan. It also sets how many requests your account may make in a month.

- Over the minute's limit, the API answers `429 rate_limited`. The SDK waits the seconds in `Retry-After`, then tries again.
- When the month's requests are used up, the API answers `429 quota_exceeded` until the next month. The SDK does not retry it, because `Retry-After` counts the seconds to the next month. Read `error.retryAfter` to see how long that is.
- After a `5xx` or a network error, the SDK waits a short, growing time and tries again.
- It never retries a `400`, `401`, `403` or `404`: the same request gets the same answer.
- It retries at most `maxRetries` times. Set `maxRetries: 0` to turn retries off.

Every route is a GET, so a retry is always safe.

## Plan limits

Some plans read only the first medicines, in the order of their permanent number. `meta().medicines` is the number your plan reads.

Lists and search leave out the medicines beyond your plan's number. A lookup by ID of such a medicine throws `PlanError` with `code` `plan_limit`.

An account with no active plan gets `PlanError` with `code` `plan_expired` on every call.

## Images

`product_image` is the address of a medicine's picture, and `images` lists every picture. A picture that Oushodh keeps lives at `/v1/images/<sha256>.jpg`.

```ts
const file = "50d858e0985ecc7f60418aaf0cc5ab587f42c2570a884095a9e8ccacd0f6545c.jpg";

const url = oushodh.imageUrl(file);
const bytes = await oushodh.getImage(file);
```

Pictures need no key, so an `<img>` tag can show `imageUrl()` directly. `getImage()` returns the bytes as a `Uint8Array` and sends no key. A picture never changes, so you can cache it for a year.

## Testing your code

Pass your own `fetch` to answer requests without the network:

```ts
const oushodh = new Oushodh({
  apiKey: "oush_test_123",
  fetch: async () => Response.json({ client: "test", id_profile: "default", medicines: 0, last_import: null }),
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

## License

MIT. See [LICENSE](LICENSE).
