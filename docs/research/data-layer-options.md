# Research: is Postgres necessary? Postgres vs D1 vs Durable Objects vs Convex

Researched 2026-10-09. It builds on [cloudflare-workers-web-app.md](./cloudflare-workers-web-app.md) ("the Workers doc"), which already covers Hyperdrive + `pg` on Workers in detail: the module-level client hang, the per-request client, the Neon driver, limits and env bindings. That material is linked, not repeated. Every claim below is pinned to a version, commit or fetch date:

| Source                          | Version / commit                                                                                                                                                                                   | Date       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| This repo                       | `feature/cloudflare-workers-deploy` at `e62d453`                                                                                                                                                   | 2026-10-09 |
| better-auth (docs and source)   | `better-auth/better-auth` `main` at [`53307a7`][ba-commit] (`better-auth` 1.7.7 = npm `latest`); the repo pins `1.4.0-beta.9` (published 2025-10-09); 1.6.33 = npm `release-1.6`                   | 2026-10-09 |
| Convex + Better Auth component  | `get-convex/better-auth` `main` at [`2f9fcf6`][cba-commit]; npm `@convex-dev/better-auth` 0.12.5 (`latest`, published 2026-06-27)                                                                  | 2026-10-09 |
| Convex docs, self-hosting guide | `get-convex/convex-backend` `main` at [`deb555a`][cx-commit]                                                                                                                                       | 2026-10-09 |
| Convex CLI                      | `get-convex/convex-js` at [`0fca732`][cxj-commit] = `convex` 1.46.0 (npm `latest`); local backend binary `precompiled-2026-10-06-a3538c6`; `@convex-dev/react-query` 0.1.0                         | 2026-10-08 |
| Cloudflare docs                 | `cloudflare/cloudflare-docs` [`ef13e47`][cf-commit]                                                                                                                                                | 2026-10-09 |
| `cf` CLI and `cf/config`        | `cf` 1.0.0-beta.14 (source tag [`3d94b50`][cfcli-commit]); `cf/config` re-exports `@cloudflare/config` 0.24.1 (`dist/public-DKflmiIP.d.mts`, read from the npm tarball)                            | 2026-10-09 |
| `@cloudflare/vite-plugin`       | 2.0.0-beta.sha-91c870c02 (npm `beta`), `dist/index.mjs` read from the installed package                                                                                                            | 2026-10-09 |
| Drizzle docs                    | `drizzle-team/drizzle-orm-docs` [`236d7ea`][dz-commit]. The docs install `drizzle-orm@rc` (1.0.0-rc.4). npm `latest` is `drizzle-orm` 0.45.4 / `drizzle-kit` 0.31.11; the repo has 0.44.7 / 0.31.5 | 2026-09-23 |
| Pricing pages                   | [convex.dev/pricing][cx-pricing], [supabase.com/pricing][supa-pricing], [neon.com/pricing][neon-pricing] (fetched; no versioning)                                                                  | 2026-10-09 |

"**Experiment Ex**" means a command I ran in `/tmp` (see [Experiments](#experiments)). Experiments from the Workers doc are cited as "Workers doc E6b" and so on. Nothing in this repo was modified except this file. No accounts, logins, deploys or cloud resources were created.

---

## Summary

### Settled facts

- **Nothing in the starter needs Postgres specifically.** The schema is five tables with text/uuid/varchar/timestamp/boolean columns, two unique constraints and two cascading foreign keys. The app's queries are list-10, get-by-id, insert and delete. better-auth's queries are lookups by email, token, id and identifier. There are no joins, aggregations or transactions in app code, and better-auth's Drizzle adapter defaults to `transaction: false` (§1). SQLite (D1, DO) covers all of it. A document store with indexes (Convex) covers it too.
- **D1 is the smallest change.** In a copy of this repo, swapping `pgTable` → `sqliteTable`, `drizzle-orm/vercel-postgres` → `drizzle-orm/d1`, and `provider: "pg"` → `"sqlite"` made every test pass under `vp dev` and `vp build && vp preview`. That covered tRPC reads and writes, concurrent requests, email sign-up/in/out, session lookup, a protected procedure, social sign-in with `expo-origin`, and the `expo`/`oAuthProxy` routes. `@acme/api` and the rest of `@acme/auth` did not change (E1). Unlike Hyperdrive, a **module-level** D1 client works: there is no socket to hang (compare Workers doc E6a).
- **Durable Object SQLite also works, but you write the database server yourself.** One global SQLite-backed DO plus Drizzle's `sqlite-proxy` driver in the Worker kept `@acme/api` and `@acme/auth` unchanged and passed the same tests (E2). Drizzle's `durable-sqlite` migrator ran inside the DO constructor, and the Vite plugin imported Drizzle's generated `.sql` files with no extra config (E2). Every query becomes a billed DO request (§4). The design Cloudflare recommends is per-entity objects, not one global object (§4).
- **Convex + better-auth works with `expo()`, `oAuthProxy()` and Discord, but only on better-auth 1.6.x.** `@convex-dev/better-auth` 0.12.5 requires `better-auth >=1.6.11 <1.7.0` ([package.json L104][cba-pkg]). The repo pins 1.4.0-beta.9 and npm `latest` is 1.7.7. On a local Convex backend with no account, the same auth test passed: email sign-up/in/out, session, social sign-in with `expo-origin`, and the oauth-proxy callback. A Convex mutation guarded by `authComponent.getAuthUser` rejected anonymous calls and accepted the component's JWT (E3). `expo` and `oAuthProxy` are not on the component's "supported" list, but neither adds schema ([supported-plugins.mdx L6–30][cba-plugins]).
- **Convex + TanStack Start runs on the Cloudflare Vite plugin v2.** With `ConvexQueryClient` in the router, a Convex query rendered server-side in workerd under `vp dev` and `vp preview`. After hydration, the browser's list updated live when a mutation ran elsewhere. `/api/auth/*` proxied from the Worker to Convex with `convexBetterAuthReactStart` (E4). Neither Convex nor Cloudflare documents this combination: Convex's hosting docs cover Vercel, Netlify and static hosts ([custom.mdx L9–18][cx-hosting-custom]).
- **Convex replaces three packages, not one.** Data and logic move into Convex functions (`convex/`). tRPC's role (typed RPC) goes to Convex's generated `api`. better-auth runs inside Convex as a component with its own tables, so `packages/db`, `packages/api` and the server half of `packages/auth` go away or shrink to config (§5).
- **Local dev for D1 and DO needs no account and no external process.** State lives in `apps/tanstack-start/.cloudflare/state/v3` (v2 plugin default, `dist/index.mjs` L89514–89516). Hyperdrive needs a running Postgres in dev. Convex needs `convex dev`, which can run a local backend without an account (`CONVEX_AGENT_MODE=anonymous`, beta; [init.ts L11][cxj-init]) (E3).
- **The mobile app is unaffected by D1, DO or Hyperdrive.** It talks to the web app over HTTP, as the Workers doc established. With Convex it talks to Convex directly through `ConvexReactClient` and an auth client pointed at the Convex site URL ([expo.mdx L158–176][cba-expo-client]).

### Blockers and frictions (facts, no decision implied)

1. **Convex pins better-auth to 1.6.x.** Moving from 1.4.0-beta.9 to 1.6.33 broke the web app's `better-auth/react-start` import. 1.6 exports `better-auth/tanstack-start` (`tanstackStartCookies`) instead (E4). 1.7.x is outside the component's peer range.
2. **`cf d1 migrations apply --local` writes to a different place than `vp dev` reads.** `cf` defaults to `~/.config/cloudflare/state`; the v2 plugin uses `<app>/.cloudflare/state`. Tables applied with the default were invisible to the app ("no such table: post") until I reran with `--persist-to .cloudflare/state` (E1). `cf d1 migrations apply` also needs a database **ID**, not a name or binding ("Database names and binding names are not accepted"), and in two runs the process did not exit after printing its result (E1).
3. **`cf deploy` auto-creates a D1 database but does not record its ID.** With no `id`, `cf deploy` provisions `<worker>-<binding>` and skips writing the ID back to config ([deploy-input.ts L80–93][cfcli-provision]). Remote `cf d1 migrations apply` then needs that ID from somewhere else.
4. **better-auth's CLI can't load a client that imports `cloudflare:workers`.** `auth:generate` imports `initAuth` → `@acme/db/client`. With `import { env } from "cloudflare:workers"` at the top, the CLI failed with `MODULE_NOT_FOUND` (E1a). The Workers doc's ALS approach for Hyperdrive sidesteps this because it reads env per request. For D1/DO, `auth-cli.ts` needs a stub database (E1a) or a lazily resolved client.
5. **Drizzle `sqlite-proxy` 0.44.7 ignores `casing` in the two-argument form.** `drizzle(callback, { casing })` produced camelCase column names, and inserts failed. The three-argument form `drizzle(callback, batchCallback, config)` works (E2; `sqlite-proxy/driver.js` L13–25).
6. **DO data is reachable only through your own Worker code.** "You can apply migrations only from Cloudflare Workers" ([do-new.mdx L123][dz-do-new]). There is no HTTP API, `drizzle-kit studio` or `push` for DO SQLite. Cloudflare: "you may also need to build some of your own database tooling that comes out-of-the-box with D1" ([durable-objects-vs-d1 L23][cf-do-vs-d1]).
7. **Hyperdrive + Supabase needs the direct connection string,** not the pooler URL in `.env.example` ([supabase.mdx L35][cf-hd-supabase]). Hyperdrive's dev mode connects straight to the database ([Workers doc §5][wd-db]). In E4 the whole preview failed with `fetch failed` while the Hyperdrive dev database was down, and recovered once it was up.
8. **Free tiers are counted differently.** D1 Free gives 50 queries per Worker invocation ([limits.mdx L20][cf-d1-limits]). The DO proxy design counts every query against DO Free's 100,000 requests/day ([pricing L16–19][cf-do-pricing]). Convex Free gives 1,000,000 function calls/month, and "subscription updates … count as function calls" ([limits.mdx L83–85][cx-limits-fn]). Supabase Free pauses projects "after 1 week of inactivity" ([pricing][supa-pricing]).

### Open decisions (for the grilling)

1. **SQL or Convex?** SQL (D1, DO, Postgres) keeps Drizzle, tRPC and better-auth's adapter, and changes only `packages/db`. Convex replaces `packages/db` and `packages/api`, moves better-auth into Convex, and adds live queries. It also adds a second vendor and pins better-auth to 1.6.x.
2. **If SQL: which engine?** D1 (Cloudflare-only account, smallest diff, managed tooling). Postgres via Hyperdrive (portable, second account, per-request client). DO SQLite (most code to own; the payoff is per-entity data, which this starter doesn't model).
3. **If D1: who owns migrations?** `cf d1 migrations apply` (tracks `d1_migrations`, accepts Drizzle's `.sql` files) or `drizzle-kit migrate` with the `d1-http` driver (needs an account ID, database ID and API token; [drizzle-config-file.mdx L193–216][dz-d1-http]). Also: where the database ID lives, and the `--persist-to` path for local apply.
4. **If Convex: keep tRPC for anything?** Options: (a) all Convex, with the mobile and web apps on `convex/react`; (b) tRPC procedures that call Convex via `ConvexHttpClient`, which keeps the mobile client code but loses reactivity and adds a hop (not tested). Also: Convex Cloud or self-hosted (§5.6).
5. **Better-auth version.** 1.4.0-beta.9 (works with D1/DO/Postgres via Drizzle today), 1.6.x (required for Convex), or 1.7.x (current; native `D1Database` support since 1.5.0).
6. **Fix `post.all` ordering while porting?** It orders by `desc(Post.id)` on a random UUID (`packages/api/src/router/post.ts:11-14`, `packages/db/src/schema.ts:7`), so it doesn't return the newest posts. Any port touches this query.

### Unverified

- Anything deployed: real D1 latency and read replication, DO placement, Hyperdrive pooling, Convex Cloud.
- A full Discord OAuth round trip on any backend, and the Expo deep-link return. Only the endpoints were exercised (as in the Workers doc).
- Convex in the Expo app itself. Only the Convex docs and LAN reachability of the local backend were checked (E3c).
- D1 `db.transaction()`. Drizzle's D1 session sends `begin` (`d1/session.js` L63–74). better-auth's own D1 dialect throws "D1 does not support interactive transactions" ([d1-sqlite-dialect.ts L120–137][ba-d1-dialect]). Neither the starter nor better-auth's default path uses transactions, so I didn't run it.
- `tsc` for `packages/db` when it imports `cloudflare:workers` (the binding types are generated in the app, per Workers doc E13).
- Convex self-hosting (Docker). Source and docs only.

---

## 1. Is a relational database necessary?

**What the data is** (`packages/db/src/schema.ts:6-23`, `packages/db/src/auth-schema.ts:1-53`):

- `post`: uuid PK (`defaultRandom()`), `varchar(256)`, `text`, two timestamps.
- `user`, `session`, `account`, `verification`: better-auth's core tables. Text PKs, `unique` on `user.email` and `session.token`, and `session.userId` / `account.userId` → `user.id` with `onDelete: "cascade"`.

**What the app asks of it** (`packages/api/src/router/post.ts:10-33`): `findMany` ordered and limited to 10, `findFirst` by id, `insert`, `delete` by id. tRPC's context only passes `db` through (`packages/api/src/trpc.ts:29-42`).

**What better-auth asks of it:** CRUD through its adapter interface (find by field, create, update, delete, count). The Drizzle adapter takes `provider: "pg" | "mysql" | "sqlite"` ([drizzle-adapter.ts L139][ba-dz-provider]) and only wraps operations in a transaction if `transaction: true` ([L160–166, L1250–1253][ba-dz-tx]); the repo doesn't set it (`packages/auth/src/index.ts:21-23`).

**Conclusion.** No feature in use is Postgres-specific. `uuid` and `defaultRandom()` become `text` + `crypto.randomUUID()` in SQLite, and timestamps become integers. The relational features in use are two unique indexes and two cascades. SQLite has both, and Convex replaces them with indexes and code. A relational database is not necessary. The SQL path keeps the most existing code (Drizzle schema, `drizzle-zod`'s `CreatePostSchema`, `drizzle-kit`, better-auth's Drizzle adapter, tRPC procedures). Choosing Convex is a choice to rewrite that code, not a requirement of the data.

## 2. Postgres via Hyperdrive + `pg` (status quo, driver swapped)

The Workers doc §5 covers the runtime side. Summary and additions:

- **better-auth:** `drizzleAdapter(db, { provider: "pg" })` unchanged on any version. `expo()`, `oAuthProxy()` and Discord worked on workerd with 1.4.0-beta.9 (Workers doc E6b, E12).
- **Drizzle:** `drizzle-orm/node-postgres` + `pg`. Schema unchanged; `drizzle-kit push`/`migrate` run in Node against `POSTGRES_URL` as today (Workers doc §5).
- **Runtime:** needs a **per-request** client. A module-level pool hung every other request (Workers doc E6a). The ALS + `Proxy` `db` export fixed it with ~30 lines in `client.ts` (Workers doc E6b). Hyperdrive limits: ~20 origin connections per config on Free, ~100 on Paid; 60 s max query ([limits.mdx L25–57][cf-hd-limits]). Postgres.js over Hyperdrive is "not currently supported" by Cloudflare's Drizzle guide (Workers doc §5).
- **Placement:** Hyperdrive pools connections and caches reads; the database itself lives in one region at the host.
- **`cloudflare.config.ts`:** `bindings.hyperdrive({ id, dev: { connectionString } })`. `id` is **required** ([`HyperdriveBindingOptions` L1348–1364][cfc-types]), so a Hyperdrive config must exist before deploy. `cf deploy` can't auto-provision it because it needs your database's credentials.
- **Local dev:** a real Postgres (local or the host's), reached directly with no pooling (Workers doc §5). The mobile app is unchanged.
- **What a starter user provisions and pays for:** a Cloudflare account plus a Postgres host.
  - Hyperdrive is included in Workers Free (100,000 queries/day) and unlimited on Paid ([hyperdrive_pricing L7–11][cf-hd-pricing]). Workers Paid is $5/month minimum ([pricing.mdx L16][cf-workers-pricing]).
  - Supabase Free: $0, 500 MB database, 2 active projects, 5 GB egress, paused after 1 week of inactivity. Pro from $25/month ([pricing][supa-pricing]). Use the **direct** connection string with Hyperdrive ([supabase.mdx L35][cf-hd-supabase]).
  - Neon Free: $0, 1 GB per project, 100 CU-hours per project, scale-to-zero after 5 minutes. Launch is pay-as-you-go with no minimum ([pricing][neon-pricing]). The Neon serverless driver is an alternative to Hyperdrive (Workers doc §5).
- **Lock-in:** lowest. Hyperdrive is a pool in front of standard Postgres. Changing hosts is a connection-string change; leaving Cloudflare means dropping the binding.
- **For:** portable SQL and data; the schema stays as is; the largest ecosystem (any Postgres host, `drizzle-kit studio`, SQL tools); already proven on workerd in the Workers doc.
- **Against:** two accounts and two dashboards for a starter user; a per-request client pattern to maintain; dev needs a Postgres running (or a remote one); Supabase Free pauses idle projects; a second network hop (Worker → Hyperdrive → database region).

## 3. Cloudflare D1

- **better-auth:**
  - _Pinned 1.4.0-beta.9:_ no native D1 support, but `drizzleAdapter(db, { provider: "sqlite" })` over `drizzle-orm/d1` worked with `expo()`, `oAuthProxy()` and the auth flows (E1).
  - _Current:_ native `D1Database` support via the built-in Kysely adapter (`database: env.DB`), added in [#7519][ba-pr-d1] (merged 2026-02-28, first release 1.5.0 on 2026-03-01). It detects D1 by duck-typing ([dialect.ts L52–54][ba-dialect]). `getMigrations` can run migrations from a Worker endpoint ([database.mdx L49–124][ba-db-migrate]).
  - The Drizzle adapter got a D1 fix for affected-row counts in [#10257][ba-pr-10257] (2026-06-26). 1.4.0-beta.9 returns the driver's raw result for `updateMany`/`deleteMany`. No test failed because of it (E1).
- **Drizzle:** `drizzle-orm/d1`, dialect `sqlite`, documented by Drizzle ([connect-cloudflare-d1.mdx L26–83][dz-d1]). `drizzle-kit generate` produced plain `.sql` migrations from the repo's 0.31.5 (E1). For remote `push`/`migrate`/`studio`, drizzle-kit uses the `d1-http` driver with `accountId`, `databaseId` and `token` ([drizzle-config-file.mdx L193–216][dz-d1-http]).
- **What changes in the repo** (E1, as run):
  - `packages/db/src/schema.ts`: `pgTable` → `sqliteTable`. uuid → `text().$defaultFn(() => crypto.randomUUID())`, `varchar` → `text({ length: 256 })`, timestamps → `integer({ mode: "timestamp" })`. `CreatePostSchema` keeps working.
  - `packages/db/src/auth-schema.ts`: regenerated with `provider: "sqlite"` (E1a).
  - `packages/db/src/client.ts`: 3 lines. `drizzle(env.DB, { schema, casing: "snake_case" })` at module scope.
  - `packages/db/src/index.ts`: `alias` from `drizzle-orm/sqlite-core`.
  - `packages/db/drizzle.config.ts`: `dialect: "sqlite"`, `out: "./migrations"`.
  - `packages/auth/src/index.ts`: `provider: "sqlite"`.
  - `apps/tanstack-start/src/env.ts`: drop `POSTGRES_URL`. `@vercel/postgres` and `pg` go.
  - `packages/api`: no changes.
- **Runtime fit:** D1 is a binding, so a module-level client is fine. 16/16 test requests and 3 concurrent writers returned 200 in dev and preview (E1). Limits ([limits.mdx L13–30][cf-d1-limits]):
  - 10 GB per database on Paid, 500 MB on Free
  - 1,000 queries per Worker invocation on Paid, 50 on Free
  - 100 bound parameters per query
  - 30 s max query

  "Each individual D1 database is inherently single-threaded, and processes queries one at a time": about 1,000 queries/s at 1 ms each ([faq-limits L18–25][cf-d1-throughput]). There are no interactive transactions; use `batch()` ([d1-sqlite-dialect.ts L120–137][ba-d1-dialect]).

- **Placement:** "your application code and SQL database queries are not colocated", and Cloudflare points to Smart Placement for that ([durable-objects-vs-d1 L15][cf-do-vs-d1]).
- **`cloudflare.config.ts`:** `DB: bindings.d1({ id?, name?, dev?: { remote? } })`. Both `id` and `name` are optional ([`D1BindingOptions` L1282–1297][cfc-types]). There is no `migrations_dir` setting; Wrangler's `migrations_dir` ([dz-d1][dz-d1]) moves to `cf d1 migrations apply --dir` (E1). With no `id`, `cf deploy` creates `<worker>-<binding>` ([deploy-input.ts L80–93][cfcli-provision]). The dry run listed `env.DB (acme) D1 Database`, 3,040 KiB upload (E1e; the Hyperdrive build was 3,232 KiB in Workers doc E6b).
- **Local dev under `vp dev`:** works offline in miniflare. The plugin persists to `apps/tanstack-start/.cloudflare/state/v3`. Apply migrations with `cf d1 migrations apply <id> --local --persist-to .cloudflare/state --dir ../../packages/db/migrations` (E1). `vp preview` reads the same state (E1e). The mobile app reaches the web app on the LAN as before.
- **What a starter user provisions and pays for:** only a Cloudflare account. Free: 5 million rows read/day, 100,000 rows written/day, 5 GB total. Paid: 25 billion reads and 50 million writes per month included, then $0.001 per million rows read and $1.00 per million rows written, plus $0.75/GB-month above 5 GB ([d1-pricing L5–9][cf-d1-pricing]). No egress charges.
- **Lock-in:** medium. The data is SQLite and exportable. The schema is Drizzle `sqlite-core`, which also targets other SQLite hosts. Access is Workers bindings or Cloudflare's HTTP API only.
- **For:** one vendor and one account; no connection management; no external process in dev; the smallest diff (E1); `cf` can provision it; managed backups (Time Travel: 30 days on Paid, 7 on Free, [limits.mdx L18][cf-d1-limits]).
- **Against:** SQLite types (dates as integers; uuid and varchar become text); a 10 GB per-database ceiling; single-threaded per database; 50 queries per request on Free; no interactive transactions; migration tooling split between `cf` and drizzle-kit, with the local-state path friction (blocker 2) and the ID friction (blocker 3); database queries cross the network from wherever the Worker runs.

## 4. Durable Objects with SQLite storage

- **What a DO-backed data layer looks like for this app.** Cloudflare's guidance is to model objects around the "atom" of coordination, and "Do not use a single Durable Object as a global singleton" ([rules L1448–1452][cf-do-rules-anti]). It suggests DOs for coordination, strong consistency, per-entity storage, WebSockets and per-entity scheduling, and plain Workers for "Stateless request handling" ([rules L17–35][cf-do-rules-when]). This app's data is global:
  - better-auth looks users up by email and sessions by token across all users.
  - `post.all` lists posts from every user.

  The design space:
  - **One global DO** (what E2 ran). Simple, and all existing code stays. Throughput is capped at roughly "500–1,000 requests per second" per object, 200–500/s for storage writes ([rules L193–205][cf-do-rules-throughput]). Storage is capped at 10 GB per object ([limits.mdx L15–28][cf-do-limits]).
  - **One DO per user** for user-owned data, plus a global index (another DO, or D1) for email → user, token → session and "latest posts". Every cross-user query becomes fan-out or a denormalised index you maintain.
  - **Sharding by key** (for example by hash of user id): the same index problem with more objects.

- **better-auth:** there is no DO adapter. It works if better-auth's Drizzle adapter receives a Drizzle instance that reaches the DO. E2 used Drizzle's `sqlite-proxy` driver in the Worker, whose callback calls an RPC method on the DO, which runs `ctx.storage.sql.exec` ([connect-drizzle-proxy.mdx L50–66][dz-proxy]). `expo()`, `oAuthProxy()` and all auth flows passed (E2). Running better-auth **inside** the DO (forwarding `/api/auth/*` to it) is the other option; I didn't test it.
- **Drizzle:** `drizzle-orm/durable-sqlite` inside the DO, with `drizzle-kit generate` and `driver: "durable-sqlite"`, which emits `drizzle/migrations.js` importing the `.sql` files ([connect-cloudflare-do.mdx L22–99][dz-do]; [do-new.mdx L112][dz-do-new]). Drizzle's Wrangler example adds a `Text` rule for `**/*.sql` (L51–55); the v2 Vite plugin imported them without it (E2). Migrations run in the DO, typically in the constructor under `blockConcurrencyWhile` ([connect-cloudflare-do.mdx L71–99][dz-do]). Each DO instance migrates itself on first access after a deploy.
- **What changes in the repo** (E2, as run): everything from §3's schema change, plus:
  - a ~30-line `Database` DO class in `packages/db`, exported from a custom `src/server.ts` entry
  - a `sqlite-proxy` client with single-query and batch callbacks (`transactionSync` in the DO)
  - `exports` and a DO binding in `cloudflare.config.ts`

  `@acme/api` and `@acme/auth` (apart from `provider`) did not change.

- **Runtime fit:** the Worker → DO hop is an RPC per query in the proxy design. One sign-up produced 4 `durable_object_storage_exec` spans in the local trace (E2). SQL limits match D1's: 100 KB statement, 100 bound parameters, 2 MB row ([limits.mdx L38–50][cf-do-limits]).
- **`cloudflare.config.ts`:**

  ```ts
  exports: { Database: exports.durableObject({ storage: "sqlite" }) },
  env: { DATABASE: bindings.durableObject({ worker: "acme-tanstack-start", exportName: "Database" }) },
  ```

  `exports.durableObject` takes `state: "created" | "deleted" | "renamed" | "transferred" | "expecting-transfer"` in place of Wrangler's `[[migrations]]` tags ([exports types L5–98, example L180–209][cfc-types]). The built `worker.config.json` carried `exports.Database: { type: "durable-object", storage: "sqlite" }`, and the dry run listed `env.DATABASE (Database, defined in acme-tanstack-start)` (E2).

- **Local dev:** works offline. State is at `.cloudflare/state/v3/do/acme-tanstack-start-Database/` (E2).
- **What a starter user provisions and pays for:** only a Cloudflare account. Free: 100,000 requests/day and 13,000 GB-s/day; SQLite-backed objects only. Paid: 1 million requests/month, then $0.15 per million, and 400,000 GB-s, then $12.50 per million GB-s ([pricing L16–19, L48][cf-do-pricing]). SQL storage billing matches D1's rows read/written; storage is $0.20/GB-month above 5 GB ([pricing L55–59][cf-do-pricing]). In the proxy design every query is a request.
- **Lock-in:** highest of the SQL options. The data is reachable only through code you deploy to the DO. There is no external SQL access, no `drizzle-kit studio`/`push`, and migrations run only from Workers ([do-new.mdx L123][dz-do-new]; [durable-objects-vs-d1 L19–23][cf-do-vs-d1]).
- **For:** one vendor; storage colocated with the code that runs inside the DO; strong per-object consistency; a natural fit if the starter later grows realtime or per-tenant features (WebSockets, alarms).
- **Against:** you build and maintain the database server (RPC methods, batching, migrations, backups, inspection); one global DO is the anti-pattern Cloudflare names; per-user DOs don't fit better-auth or `post.all` without a global index; there is no tooling outside your code; and it has the most moving parts for the least benefit given this schema.

## 5. Convex

### 5.1 How it replaces or coexists with the packages

- **`packages/db` → a Convex functions package.** Schema moves to `convex/schema.ts` (`defineTable` with validators), and queries and mutations become Convex functions (E3's `posts.ts` is the port of `router/post.ts`). Convex's own monorepo template puts this in `packages/backend` with `convex dev` as its dev script ([turbo-expo-nextjs-clerk-convex-monorepo][cx-monorepo]). Convex has "no specific query language for complex logic like a join"; joins are code ([reading-data.mdx L224–237][cx-joins]). `drizzle-zod`'s `CreatePostSchema` is replaced by Convex argument validators (`v.string()`).
- **`packages/api` (tRPC) → Convex functions.** Queries must be deterministic and "cannot `fetch` from third party APIs"; side effects go in actions ([query-functions.mdx L187–192][cx-query-det]). Clients call `api.posts.all` through the generated `api` object. Queries in React are live subscriptions.
- **`packages/auth` → the Better Auth component.** `createAuth(ctx)` builds better-auth per call with `database: authComponent.adapter(ctx)` and the required `convex()` plugin. HTTP routes are registered on the Convex deployment with `authComponent.registerRoutes(http, createAuth)` ([tanstack-start.mdx L127–232][cba-tss]). The web app's `/api/auth/$` becomes a proxy to Convex (`convexBetterAuthReactStart().handler`, L194–248). "with Convex being your backend, these methods need to run in a Convex function" (L493–502). The component's tables live inside the component. Writing your own functions against them, or adding plugins with schema, requires "Local Install" ([local-install.mdx][cba-local]).
- **Coexisting with tRPC** is possible (tRPC procedures could call Convex through `ConvexHttpClient`, which E4's SSR used), but it keeps two RPC layers and gives up live queries. Not tested as a design.

### 5.2 Better Auth component: versions, plugins, Discord

- Peer range `better-auth >=1.6.11 <1.7.0` ([package.json L104][cba-pkg]); the guides install `better-auth@~1.6.15` ([tanstack-start.mdx L19–28][cba-tss-install]; [expo.mdx L13–20][cba-expo-install]). better-auth's own docs also have a Convex integration page ([integrations/convex.mdx][ba-convex]).
- "Any Better Auth plugin may be used … but only a subset are considered supported". The list has no `expo` or `oAuthProxy`; SSO is "incompatible" ([supported-plugins.mdx L6–30][cba-plugins]). The Expo guide itself adds `expo()` and calls it required for Expo ([expo.mdx L134–138][cba-expo-plugins]).
- **E3 result** with `oAuthProxy({ productionURL })`, `expo()`, `convex()`, Discord and email/password on better-auth 1.6.33:
  - `ok`, sign-up, get-session, sign-in, sign-out: 200
  - social sign-in with `expo-origin: expo://` returned a Discord authorize URL; `redirect_uri` was `SITE_URL/api/auth/callback/discord`
  - `expo-authorization-proxy` 400 (missing params, same as Postgres)
  - `oauth-proxy-callback` 302
  - The session JSON returns dates as epoch numbers, where the Drizzle path returns ISO strings.
- Social sign-in from Expo: "the authorized origin and redirect URI are based on your Convex site URL instead of your application domain" ([expo.mdx L253–269][cba-expo-social]). So the Discord app registration changes. With `oAuthProxy`, the callback goes to `productionURL` (E3).

### 5.3 TanStack Start (official integration, SSR)

- Convex documents TanStack Start via `@convex-dev/react-query`: live queries, "Subscription session resumption, from SSR to live on the client", and a consistent query timestamp during SSR. It still carries a "TanStack Start is in Release Candidate" caution ([tanstack-start/index.mdx L7–100][cx-tss]).
- With better-auth: `expectAuth: true` "does not allow Convex functions to run in the client before authentication", and the recommendation is to reload the page on sign-out ([tanstack-start.mdx L444–477][cba-tss-usage]). The guide adds `ssr.noExternal: ['@convex-dev/better-auth']` (L33–44). Under the Cloudflare plugin the SSR environment is bundled anyway, and E4 didn't need it.
- **E4:** `ConvexQueryClient` (in `queryKeyHashFn`/`queryFn` defaults, alongside tRPC's options proxy) plus a `/convex` route with `ensureQueryData` + `useSuspenseQuery`.
  - In workerd the page rendered `<li>hello convex</li>` server-side in dev and preview.
  - In the preview browser, a mutation sent with curl appeared in the open page without a reload.
  - The first dev request after install hit a duplicate-React error while Vite re-optimised dependencies; the next request was fine.

### 5.4 React Native / Expo

- Convex in React Native is "the Convex React client library" ([react-native.mdx L9–16][cx-rn]). The Expo + better-auth guide uses `ConvexBetterAuthProvider`, `expoClient` with `expo-secure-store`, and `baseURL: EXPO_PUBLIC_CONVEX_SITE_URL` ([expo.mdx L153–230][cba-expo-client]). Expo Web needs `crossDomain` instead, and "`expoClient` and `crossDomainClient` plugins cannot both be included" (L357–360).
- **Local dev from a phone:** the anonymous local backend listened on `*:3210`/`*:3211` and answered on the LAN IP (E3c), but `.env.local` holds `127.0.0.1`. The Expo app needs the LAN address, as `apps/expo/src/utils/base-url.ts` already derives for the web app. The phone now needs two origins: Convex for data and auth, and the web app only if tRPC remains.

### 5.5 Hosting the frontend on Cloudflare Workers

- Convex's hosting docs cover Vercel, Netlify and static hosts. "If you're using Next.js or other framework with server functionality you'll need to use a provider that supports it" ([custom.mdx L9–18][cx-hosting-custom]). There is no Cloudflare guide (searched the docs at `deb555a`).
- E4 shows it works: the Worker calls Convex over HTTPS for SSR and the auth proxy, and the browser talks to Convex over WebSocket. The Worker needs only `VITE_CONVEX_URL`/`VITE_CONVEX_SITE_URL` (inlined at build) and no bindings. The dry-run upload was 3,933 KiB / 822 KiB gzip. That build still carried the old better-auth + `pg` + tRPC code, so it overstates a Convex-only Worker.

### 5.6 Cloud vs self-hosted, pricing, lock-in

- **Convex Cloud** ([pricing][cx-pricing]; [limits.mdx][cx-limits]):
  - Free: 1,000,000 function calls/month, 0.5 GB database storage, 1 GB database I/O/month, 1 GB file storage, 1 GB egress, 20 GB-hours action compute. Hard caps: "new mutations … may fail" once hit (L228–240). Up to 6 developers, 40 deployments.
  - Starter: the same allowances, then pay as you go ($2.20 per extra million calls, $0.22/GB storage and I/O).
  - Professional: $25 per developer/month with 25 million calls and 50 GB storage and I/O.
  - Function calls include "subscription updates" (L83–85). Non-US regions cost 1.3x (L22–23).
- **Self-hosted:** the open-source backend is "the same fully up-to-date code the cloud service uses", licensed FSL-Apache 2.0, which converts to Apache-2.0 after two years ([self-hosting.mdx L7–44][cx-selfhost]). It runs as Docker services (backend + dashboard), stores state in SQLite by default, and can point at Postgres/MySQL and S3 ([self-hosted README L24–89][cx-selfhost-readme]). It can't run on Workers. Running it means operating a container host, which defeats "Workers as the only deploy target" for the backend.
- **Local, no account:** `CONVEX_AGENT_MODE=anonymous` runs a downloaded local backend binary ("mode is in beta", [configure.ts L238–265][cxj-configure]). E3 ran entirely this way.
- **Lock-in:** high on code, medium on data. Functions use Convex's query API and runtime; leaving means rewriting them. Data exports with `npx convex export` ([export.mdx L17][cx-export]). The license allows self-hosting.

### 5.7 The "typed packages shared by web and mobile" story

- Today the mobile app imports only **types** from `@acme/api` (`apps/expo/src/utils/api.tsx`), and the README FAQ keeps `@acme/api` a dev dependency so server code can't leak.
- With Convex both apps import the generated `api`. At runtime it is `export const api = anyApi;` (a proxy with no server code), and `api.d.ts` uses `import type` for each function module (E3 `_generated/`). The same no-leak property holds, through a runtime import of `convex/server`'s proxy instead of a type-only import. The shared package becomes the Convex functions package. `@acme/db` and `@acme/api` disappear.

### 5.8 For and against

- **For:** live queries on web and mobile with SSR resume (E4); no connection pooling, migrations or SQL host to run; one backend for both apps; better-auth still works with `expo()`/`oAuthProxy()`/Discord (E3); a local backend with no account (E3); in the user's preferred stack.
- **Against:**
  - better-auth is pinned to 1.6.x, one minor behind, and the component's "supported plugins" list excludes `expo` and `oAuthProxy`.
  - tRPC, Drizzle, `drizzle-zod` and `drizzle-kit` all go, so most of the starter's backend code is rewritten.
  - Two vendors (Cloudflare for the web app, Convex for data and auth), each with its own dashboard and secrets.
  - Workers hosting is undocumented by Convex.
  - The Free plan counts every subscription update as a function call and hard-fails mutations at the cap.
  - Self-hosting needs Docker, not Workers.
  - Discord's redirect URIs move to the Convex site URL unless proxied.

## 6. Side-by-side

|                                     | Postgres + Hyperdrive + `pg`                                                       | D1                                                                            | Durable Object SQLite                                                          | Convex                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| better-auth on pinned 1.4.0-beta.9  | Yes, `drizzleAdapter` `pg` (Workers doc E6b)                                       | Yes, `drizzleAdapter` `sqlite` (E1)                                           | Yes, `drizzleAdapter` `sqlite` over `sqlite-proxy` (E2)                        | No: component needs `>=1.6.11 <1.7.0`                           |
| better-auth current (1.7.7)         | Yes                                                                                | Yes, plus native `D1Database` (since 1.5.0)                                   | Via Drizzle only (no adapter)                                                  | No (outside peer range)                                         |
| `expo()` + `oAuthProxy()` + Discord | Worked (Workers doc E12)                                                           | Worked (E1)                                                                   | Worked (E2)                                                                    | Worked on 1.6.33 (E3); not on the "supported" list              |
| ORM / migrations                    | Drizzle `node-postgres`; `drizzle-kit` from Node                                   | Drizzle `d1`; `drizzle-kit generate` + `cf d1 migrations apply`, or `d1-http` | Drizzle `durable-sqlite`; migrations run inside the DO                         | Convex schema + functions; no Drizzle                           |
| Change to `packages/db`             | Driver + per-request client (~30 lines)                                            | Dialect port + 3-line client                                                  | Dialect port + DO class + proxy client                                         | Replaced by a Convex functions package                          |
| Change to `packages/api`            | None                                                                               | None                                                                          | None                                                                           | Replaced by Convex functions                                    |
| Workers connection model            | Per-request client required                                                        | Binding; module-level OK                                                      | Binding + RPC per query                                                        | HTTPS from the Worker (SSR, auth proxy); WebSocket from clients |
| Local dev under `vp dev`            | Needs a running Postgres                                                           | Offline; apply with `--persist-to .cloudflare/state`                          | Offline; migrates itself                                                       | `convex dev` (local backend, no account)                        |
| `cloudflare.config.ts`              | `bindings.hyperdrive({ id, dev })`, `id` required                                  | `bindings.d1({ id?, name? })`; auto-provisioned on deploy                     | `exports.durableObject({ storage: "sqlite" })` + `bindings.durableObject(...)` | None (two `VITE_` URLs)                                         |
| Accounts for a starter user         | Cloudflare + a Postgres host                                                       | Cloudflare                                                                    | Cloudflare                                                                     | Cloudflare + Convex                                             |
| Free tier (data side)               | Hyperdrive 100k queries/day; Supabase 500 MB (pauses idle) or Neon 1 GB + 100 CU-h | 5M rows read and 100k written per day, 5 GB; 50 queries/request               | 100k requests/day (one per query here), 13,000 GB-s/day; SQL rows as D1        | 1M function calls/month, 0.5 GB storage, 1 GB I/O               |
| Realtime                            | No                                                                                 | No                                                                            | Possible (WebSockets in DOs), not built                                        | Yes, built in                                                   |
| Lock-in                             | Low                                                                                | Medium (SQLite data, Cloudflare access)                                       | High (data only via your DO code)                                              | High for code, medium for data (export, FSL self-host)          |

---

## Experiments

macOS, Node 24.21.0 (Vite+ runs Node 22.23.3), pnpm 12.10.1, global `vp` 1.1.0, global `cf` 1.0.0-beta.14, on 2026-10-09. Downloads went into new directories under `/tmp/dl-research/`. No Cloudflare or Convex login, no deploys, dry runs only.

- **Base repo:** a copy of the Workers doc's E9 state, i.e. this repo plus `@cloudflare/vite-plugin@2.0.0-beta.sha-91c870c02`, `cf@1.0.0-beta.14` and `cloudflare.config.ts` (`rsync -a /tmp/cfw-research/repo/ /tmp/dl-research/exp/<name>/`).
- **`dbtest.sh`:** the Workers doc's script. 5 sequential `GET /api/trpc/post.all`, 8 concurrent, 3 `POST /api/auth/sign-in/social`.
- **`authtest.sh <base> [trusted-origin]`:** email sign-up, `get-session` with the cookie, protected `auth.getSecretMessage`, sign-in, sign-out, social sign-in with `expo-origin: expo://`, `GET expo-authorization-proxy`, `GET oauth-proxy-callback?callbackURL=/`.
- **Auth config for testing:** `emailAndPassword: { enabled: true }` was added to the copy's `initAuth` so the tests could create sessions without Discord. Secrets were dummies.

- **E1 D1 in the repo copy** (`e1-d1`), with the schema, client, `drizzle.config.ts` and `provider` changes listed in §3 and `cloudflare.config.ts` `DB: bindings.d1({ id: "00000000-0000-4000-8000-000000000000", name: "acme" })`, `entrypoint: "@tanstack/react-start/server-entry"`.
  - **E1a** `packages/auth/node_modules/.bin/cli generate --config script/auth-cli.ts …` → `MODULE_NOT_FOUND` for `cloudflare:workers`, required from `packages/db/src/client.ts`. A CLI-only config with `drizzleAdapter({} as never, { provider: "sqlite" })` and the same plugins → "Schema was overwritten successfully" (SQLite `auth-schema.ts`, `timestamp_ms` integers).
  - **E1b** `drizzle-kit generate` (0.31.5) → `migrations/0000_right_shinko_yamashiro.sql`, 5 tables.
  - **E1c** `cf d1 migrations apply acme --local …` → "Expected a D1 database ID". With the ID, `--local` applied the migration to `~/.config/cloudflare/state/v3/d1/…` (row in `d1_migrations`), and the process did not exit; I killed it. `vp dev --port 3100`: `post.all` → 500 "no such table: post: SQLITE_ERROR". Also: env validation failed on `POSTGRES_URL` until it was removed from `src/env.ts`.
  - **E1d** `cf d1 migrations apply <id> --local --persist-to .cloudflare/state --dir ../../packages/db/migrations` → `[{"name":"0000_…sql","status":"✅"}]` (again no exit; killed after 20 s). Then:
    - `post.all` 200 `[]`
    - `dbtest.sh`: 5/5, 8/8, 3/3 200
    - `post.create` (temporarily public) 200, returning D1's `meta` (`served_by: "miniflare.db"`, `changes: 1`); `post.delete` 200
    - `authtest.sh`: sign-up 200, session JSON, protected tRPC 200, sign-in 200, sign-out 200, social URL, the two plugin routes 400
  - **E1e** `vp build` → exit 0. `vp preview --port 4180`: `dbtest.sh` and `authtest.sh` same results, same state as dev. `cf deploy --prebuilt --dry-run` → "Total Upload: 3039.97 KiB / gzip: 612.30 KiB", `env.DB (acme) D1 Database`.
- **E2 DO SQLite** (`e2-do`, from E1).
  - Drizzle and config:
    - `drizzle.config.ts` `driver: "durable-sqlite"`, `out: "./drizzle"`. `drizzle-kit generate` → `drizzle/migrations.js` importing `./0000_fair_bruce_banner.sql`.
    - `packages/db/src/database-object.ts`: `class Database extends DurableObject`, which runs `migrate(drizzle(ctx.storage), migrations)` in `blockConcurrencyWhile`, plus `query(sql, params, method)` → `ctx.storage.sql.exec(...).raw().toArray()` and `batch(queries)` in `transactionSync`.
    - `client.ts`: `drizzle-orm/sqlite-proxy` calling `env.DATABASE.get(env.DATABASE.idFromName("global")).query(...)`.
    - `src/server.ts` re-exports the TanStack handler and `Database`. `cloudflare.config.ts` as in §4.
  - `vp dev --port 3200`: `post.all` 200 `[]`, so the `.sql` imports and migrations worked. `dbtest.sh`: all 200. `authtest.sh`: all as E1. `post.create` → 500: the insert used camelCase columns (`"createdAt"`), because `drizzle(callback, { schema, casing })` ignores `casing` (0.44.7 `sqlite-proxy/driver.js` L13–25). With `drizzle(callback, batchCallback, { schema, casing })`: create 200, `post.all` returned the row, and all tests 200.
  - Local trace (`/cdn-cgi/local/explorer/api/local/observability/query`) after one sign-up: 4 `durable_object_storage_exec` spans.
  - `vp build` → exit 0. `worker.config.json` `exports.Database = {type: "durable-object", storage: "sqlite"}`. `cf deploy --prebuilt --dry-run` → "Total Upload: 3050.43 KiB / gzip: 616.64 KiB", `env.DATABASE (Database, defined in acme-tanstack-start) Durable Object`.
- **E3 Convex local backend + Better Auth** (`e3-convex`, standalone).
  - Install: `pnpm add convex@1.46.0 @convex-dev/better-auth@0.12.5 better-auth@~1.6.15 @better-auth/expo@~1.6.15` → better-auth 1.6.33.
  - Files: `convex/convex.config.ts`, `auth.config.ts` and `http.ts` per the guide. `auth.ts` with `oAuthProxy({ productionURL: SITE_URL })`, `expo()`, `convex({ authConfig })`, Discord with `redirectURI: SITE_URL/api/auth/callback/discord`, and email/password. `schema.ts` with `posts`. `posts.ts` with `all`/`byId`/`create`/`remove`; writes call `authComponent.getAuthUser(ctx)`.
  - Commands: `CONVEX_AGENT_MODE=anonymous convex init` → "Downloading Convex backend binary", "Configured a local deployment for http://127.0.0.1:3210". `convex dev --tail-logs always` → "No Convex account", "Installed component betterAuth", "Convex functions ready!". `convex env set` for `BETTER_AUTH_SECRET`, `SITE_URL=http://localhost:3000` and dummy Discord values.
  - **E3a** `authtest.sh http://127.0.0.1:3211 http://localhost:3000`: `ok` → `{"ok":true}`; sign-up, sign-in, sign-out 200; get-session JSON with epoch-number dates; social with `expo-origin` → Discord URL; `expo-authorization-proxy` 400; `oauth-proxy-callback` 302. Social sign-in with a browser origin → `redirect_uri` = `http://localhost:3000/api/auth/callback/discord`.
  - **E3b** `GET /api/auth/convex/token` with the session cookie → a 795-character JWT. `POST /api/mutation posts:create` without a token → "ConvexError: Unauthenticated"; with `Authorization: Bearer <jwt>` → `success`. `posts:all` returned the document.
  - **E3c** `lsof` → `convex-local-backend` listening on `*:3210` and `*:3211`. `curl http://192.168.1.127:3211/api/auth/ok` → `{"ok":true}`, and `posts:all` worked over the LAN IP.
- **E4 Convex + TanStack Start on the Cloudflare plugin** (`e4-convex-tss`, base repo).
  - Setup:
    - Catalog `better-auth` and `@better-auth/expo` → 1.6.33; `pnpm add convex@1.46.0 @convex-dev/react-query@0.1.0 @convex-dev/better-auth@0.12.5` in the app. No Convex peer warnings.
    - `router.tsx`: `new ConvexQueryClient(import.meta.env.VITE_CONVEX_URL)`, `queryKeyHashFn`/`queryFn` defaults, `convexQueryClient.connect(queryClient)`, and `convexQueryClient` in the router context.
    - `src/routes/convex.tsx`: loader `ensureQueryData(convexQuery(makeFunctionReference("posts:all"), {}))` + `useSuspenseQuery`.
    - `api/auth.$.ts` → `convexBetterAuthReactStart({ convexUrl, convexSiteUrl }).handler`.
    - `.env.local` with the E3 URLs.
  - **E4a** `vp dev --port 3300`: every route 500, `"./react-start" is not exported … from package better-auth`. Changing `apps/tanstack-start/src/auth/server.ts` to `tanstackStartCookies` from `better-auth/tanstack-start` fixed it.
  - **E4b** First `/convex` request: "Invalid hook call … Cannot read properties of null (reading 'useMemo')", logged right after "optimized dependencies changed. reloading". Every later request: `<ul id="convex-posts"><li>hello convex</li></ul>` server-rendered. `authtest.sh` through the Worker proxy: sign-up/sign-in/sign-out 200, session JSON, social URL. The protected tRPC call returned 401 as expected, because tRPC still used the Postgres better-auth instance.
  - **E4c** Preview browser on `/convex` waited for "hello convex", then set `window.__marker`. A `posts:create` mutation sent with curl made the new title appear in the list, and `window.__marker` was still set, so the page had not reloaded. (Run twice; the second run, after restarting `convex dev` and `vp dev`, used the marker.)
  - **E4d** `vp build` → exit 0. The first `vp preview` returned 500 `TypeError: fetch failed` on every route, including `/`. Cause: the copy's Hyperdrive binding pointed at the Workers doc's Postgres, which was stopped. With Postgres started before preview: `/convex` SSR listed both posts, and `authtest.sh` gave the same results as E4b. `cf deploy --prebuilt --dry-run` → "Total Upload: 3932.90 KiB / gzip: 822.29 KiB".

---

<!-- Reference links -->

[ba-commit]: https://github.com/better-auth/better-auth/tree/53307a7c60715298cf1b04f972f10b3fbbaa5b33
[ba-db-migrate]: https://github.com/better-auth/better-auth/blob/53307a7c60715298cf1b04f972f10b3fbbaa5b33/docs/content/docs/concepts/database.mdx#L49-L124
[ba-dialect]: https://github.com/better-auth/better-auth/blob/53307a7c60715298cf1b04f972f10b3fbbaa5b33/packages/kysely-adapter/src/dialect.ts#L52-L54
[ba-d1-dialect]: https://github.com/better-auth/better-auth/blob/53307a7c60715298cf1b04f972f10b3fbbaa5b33/packages/kysely-adapter/src/d1-sqlite-dialect.ts#L120-L137
[ba-dz-provider]: https://github.com/better-auth/better-auth/blob/53307a7c60715298cf1b04f972f10b3fbbaa5b33/packages/drizzle-adapter/src/drizzle-adapter.ts#L139
[ba-dz-tx]: https://github.com/better-auth/better-auth/blob/53307a7c60715298cf1b04f972f10b3fbbaa5b33/packages/drizzle-adapter/src/drizzle-adapter.ts#L160-L166
[ba-convex]: https://github.com/better-auth/better-auth/blob/53307a7c60715298cf1b04f972f10b3fbbaa5b33/docs/content/docs/integrations/convex.mdx
[ba-pr-d1]: https://github.com/better-auth/better-auth/pull/7519
[ba-pr-10257]: https://github.com/better-auth/better-auth/pull/10257
[cba-commit]: https://github.com/get-convex/better-auth/tree/2f9fcf6c3966bb27d38b2b83e80a1e914ab2a3ee
[cba-pkg]: https://github.com/get-convex/better-auth/blob/2f9fcf6c3966bb27d38b2b83e80a1e914ab2a3ee/package.json#L104
[cba-plugins]: https://github.com/get-convex/better-auth/blob/2f9fcf6c3966bb27d38b2b83e80a1e914ab2a3ee/docs/content/docs/supported-plugins.mdx#L6-L30
[cba-local]: https://github.com/get-convex/better-auth/blob/2f9fcf6c3966bb27d38b2b83e80a1e914ab2a3ee/docs/content/docs/features/local-install.mdx
[cba-expo-install]: https://github.com/get-convex/better-auth/blob/2f9fcf6c3966bb27d38b2b83e80a1e914ab2a3ee/docs/content/docs/framework-guides/expo.mdx#L13-L20
[cba-expo-plugins]: https://github.com/get-convex/better-auth/blob/2f9fcf6c3966bb27d38b2b83e80a1e914ab2a3ee/docs/content/docs/framework-guides/expo.mdx#L134-L138
[cba-expo-client]: https://github.com/get-convex/better-auth/blob/2f9fcf6c3966bb27d38b2b83e80a1e914ab2a3ee/docs/content/docs/framework-guides/expo.mdx#L153-L230
[cba-expo-social]: https://github.com/get-convex/better-auth/blob/2f9fcf6c3966bb27d38b2b83e80a1e914ab2a3ee/docs/content/docs/framework-guides/expo.mdx#L253-L269
[cba-tss]: https://github.com/get-convex/better-auth/blob/2f9fcf6c3966bb27d38b2b83e80a1e914ab2a3ee/docs/content/docs/framework-guides/tanstack-start.mdx#L127-L248
[cba-tss-install]: https://github.com/get-convex/better-auth/blob/2f9fcf6c3966bb27d38b2b83e80a1e914ab2a3ee/docs/content/docs/framework-guides/tanstack-start.mdx#L19-L44
[cba-tss-usage]: https://github.com/get-convex/better-auth/blob/2f9fcf6c3966bb27d38b2b83e80a1e914ab2a3ee/docs/content/docs/framework-guides/tanstack-start.mdx#L444-L502
[cx-commit]: https://github.com/get-convex/convex-backend/tree/deb555a5f50441e5824e3c6ba917dba454d8a277
[cx-tss]: https://github.com/get-convex/convex-backend/blob/deb555a5f50441e5824e3c6ba917dba454d8a277/npm-packages/docs/docs/client/tanstack/tanstack-start/index.mdx#L7-L100
[cx-rn]: https://github.com/get-convex/convex-backend/blob/deb555a5f50441e5824e3c6ba917dba454d8a277/npm-packages/docs/docs/client/react-native.mdx#L9-L16
[cx-hosting-custom]: https://github.com/get-convex/convex-backend/blob/deb555a5f50441e5824e3c6ba917dba454d8a277/npm-packages/docs/docs/production/hosting/custom.mdx#L9-L18
[cx-selfhost]: https://github.com/get-convex/convex-backend/blob/deb555a5f50441e5824e3c6ba917dba454d8a277/npm-packages/docs/docs/self-hosting.mdx#L7-L44
[cx-selfhost-readme]: https://github.com/get-convex/convex-backend/blob/deb555a5f50441e5824e3c6ba917dba454d8a277/self-hosted/README.md#L24-L89
[cx-limits]: https://github.com/get-convex/convex-backend/blob/deb555a5f50441e5824e3c6ba917dba454d8a277/npm-packages/docs/docs/production/state/limits.mdx#L18-L41
[cx-limits-fn]: https://github.com/get-convex/convex-backend/blob/deb555a5f50441e5824e3c6ba917dba454d8a277/npm-packages/docs/docs/production/state/limits.mdx#L83-L87
[cx-query-det]: https://github.com/get-convex/convex-backend/blob/deb555a5f50441e5824e3c6ba917dba454d8a277/npm-packages/docs/docs/functions/query-functions.mdx#L187-L192
[cx-joins]: https://github.com/get-convex/convex-backend/blob/deb555a5f50441e5824e3c6ba917dba454d8a277/npm-packages/docs/docs/database/reading-data/reading-data.mdx#L224-L237
[cx-export]: https://github.com/get-convex/convex-backend/blob/deb555a5f50441e5824e3c6ba917dba454d8a277/npm-packages/docs/docs/database/import-export/export.mdx#L17
[cx-monorepo]: https://github.com/get-convex/turbo-expo-nextjs-clerk-convex-monorepo/tree/da934aeb96122162fa5569c13081d21fdad01c96/packages/backend
[cx-pricing]: https://www.convex.dev/pricing
[cxj-commit]: https://github.com/get-convex/convex-js/tree/0fca732f8e62f0549e3b669dd560e32d6b0108c0
[cxj-init]: https://github.com/get-convex/convex-js/blob/0fca732f8e62f0549e3b669dd560e32d6b0108c0/src/cli/init.ts#L11
[cxj-configure]: https://github.com/get-convex/convex-js/blob/0fca732f8e62f0549e3b669dd560e32d6b0108c0/src/cli/configure.ts#L238-L265
[cf-commit]: https://github.com/cloudflare/cloudflare-docs/tree/ef13e4718d02e5e53509dbee9679f81751e7b428
[cf-d1-limits]: https://github.com/cloudflare/cloudflare-docs/blob/ef13e4718d02e5e53509dbee9679f81751e7b428/src/content/docs/d1/platform/limits.mdx#L13-L30
[cf-d1-pricing]: https://github.com/cloudflare/cloudflare-docs/blob/ef13e4718d02e5e53509dbee9679f81751e7b428/src/content/partials/workers/d1-pricing.mdx#L5-L9
[cf-d1-throughput]: https://github.com/cloudflare/cloudflare-docs/blob/ef13e4718d02e5e53509dbee9679f81751e7b428/src/content/partials/d1/faq-limits.mdx#L18-L25
[cf-do-vs-d1]: https://github.com/cloudflare/cloudflare-docs/blob/ef13e4718d02e5e53509dbee9679f81751e7b428/src/content/partials/durable-objects/durable-objects-vs-d1.mdx#L9-L25
[cf-do-pricing]: https://github.com/cloudflare/cloudflare-docs/blob/ef13e4718d02e5e53509dbee9679f81751e7b428/src/content/partials/durable-objects/durable-objects-pricing.mdx#L16-L59
[cf-do-limits]: https://github.com/cloudflare/cloudflare-docs/blob/ef13e4718d02e5e53509dbee9679f81751e7b428/src/content/docs/durable-objects/platform/limits.mdx#L15-L50
[cf-do-rules-when]: https://github.com/cloudflare/cloudflare-docs/blob/ef13e4718d02e5e53509dbee9679f81751e7b428/src/content/docs/durable-objects/best-practices/rules-of-durable-objects.mdx#L17-L35
[cf-do-rules-throughput]: https://github.com/cloudflare/cloudflare-docs/blob/ef13e4718d02e5e53509dbee9679f81751e7b428/src/content/docs/durable-objects/best-practices/rules-of-durable-objects.mdx#L193-L205
[cf-do-rules-anti]: https://github.com/cloudflare/cloudflare-docs/blob/ef13e4718d02e5e53509dbee9679f81751e7b428/src/content/docs/durable-objects/best-practices/rules-of-durable-objects.mdx#L1448-L1452
[cf-hd-limits]: https://github.com/cloudflare/cloudflare-docs/blob/ef13e4718d02e5e53509dbee9679f81751e7b428/src/content/docs/hyperdrive/platform/limits.mdx#L25-L57
[cf-hd-pricing]: https://github.com/cloudflare/cloudflare-docs/blob/ef13e4718d02e5e53509dbee9679f81751e7b428/src/content/partials/workers/hyperdrive_pricing.mdx#L7-L11
[cf-hd-supabase]: https://github.com/cloudflare/cloudflare-docs/blob/ef13e4718d02e5e53509dbee9679f81751e7b428/src/content/docs/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase.mdx#L35
[cf-workers-pricing]: https://github.com/cloudflare/cloudflare-docs/blob/ef13e4718d02e5e53509dbee9679f81751e7b428/src/content/docs/workers/platform/pricing.mdx#L16
[cfcli-commit]: https://github.com/cloudflare/cf/tree/3d94b501a6fee9ed4d9d9e6dec8ffd08acf4ec08
[cfcli-provision]: https://github.com/cloudflare/cf/blob/3d94b501a6fee9ed4d9d9e6dec8ffd08acf4ec08/packages/cli/src/lib/deploy-input.ts#L80-L113
[cfc-types]: https://www.npmjs.com/package/@cloudflare/config/v/0.24.1
[dz-commit]: https://github.com/drizzle-team/drizzle-orm-docs/tree/236d7ea7aaa3178af732aabca5511bd639ae6a2f
[dz-d1]: https://github.com/drizzle-team/drizzle-orm-docs/blob/236d7ea7aaa3178af732aabca5511bd639ae6a2f/src/content/docs/sqlite/connect-cloudflare-d1.mdx#L26-L83
[dz-d1-http]: https://github.com/drizzle-team/drizzle-orm-docs/blob/236d7ea7aaa3178af732aabca5511bd639ae6a2f/src/content/docs/sqlite/drizzle-config-file.mdx#L193-L216
[dz-do]: https://github.com/drizzle-team/drizzle-orm-docs/blob/236d7ea7aaa3178af732aabca5511bd639ae6a2f/src/content/docs/sqlite/connect-cloudflare-do.mdx#L22-L99
[dz-do-new]: https://github.com/drizzle-team/drizzle-orm-docs/blob/236d7ea7aaa3178af732aabca5511bd639ae6a2f/src/content/docs/get-started/do-new.mdx#L112-L123
[dz-proxy]: https://github.com/drizzle-team/drizzle-orm-docs/blob/236d7ea7aaa3178af732aabca5511bd639ae6a2f/src/content/docs/sqlite/connect-drizzle-proxy.mdx#L50-L66
[supa-pricing]: https://supabase.com/pricing
[neon-pricing]: https://neon.com/pricing
[wd-db]: ./cloudflare-workers-web-app.md#5-database
