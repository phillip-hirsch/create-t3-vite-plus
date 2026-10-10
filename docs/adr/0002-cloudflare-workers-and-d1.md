# Cloudflare Workers is the only deploy target; D1 replaces Postgres

The web app deploys to Cloudflare Workers and nowhere else, so Nitro and every Vercel branch (presets, `VERCEL_*` URL fallbacks, `@vercel/postgres`) go. It uses the v2 `@cloudflare/vite-plugin` with a `cloudflare.config.ts` and the `cf` CLI rather than v1 and Wrangler, because v2 is the config `cf` reads. Vite+ stays the whole toolchain (ADR 0001): `vp dev` and `vp build` run the plugin, and `cf` only deploys the prebuilt output (`vp run deploy` → `cf deploy --prebuilt`). That's because `cf build` and `cf dev` shell out to plain Vite and can't load the Vite+ config.

The database moves from Postgres to D1. Nothing in the schema or queries needs Postgres, and D1 is a binding, so the Worker needs no connection string, pooler or per-request client (which Hyperdrive would require). Drizzle stays the only schema and migration owner: better-auth uses `drizzleAdapter` with `provider: "sqlite"` rather than its native D1 dialect, drizzle-kit generates the SQL files and `cf d1 migrations apply` applies them.

Rejected alternatives:

- **Nitro's Cloudflare preset:** it keeps a second build layer between Vite and the Worker.
- **Postgres via Hyperdrive:** it needs a request-scoped client and an external database host.
- **Durable Objects as the database:** you'd hand-build the database server, and one global DO is an anti-pattern.
- **Convex:** it replaces `packages/db`, `packages/api` and most of `packages/auth`, adds a second vendor, and pins better-auth to 1.6.x.

## Consequences

- `db:push` is replaced by generated migrations (`db:generate`, `db:migrate`). Migration files are committed.
- Drizzle Studio (`db:studio`) is dropped. Against remote D1 it needs an API token (the `d1-http` driver). Against local D1 it needs an extra SQLite driver and the path of a state file whose name is a hash. The dev server's Local Explorer (`/cdn-cgi/local/explorer`) and the Cloudflare dashboard cover browsing the data.
- The D1 database is created once with `cf d1 create`, and its ID is committed in `cloudflare.config.ts`. `cf deploy`'s auto-provisioning isn't used, because it doesn't record the ID that remote migrations need.
- Env values are declared with `bindings.secret()`. In dev they still come from the root `.env`. In production the first deploy supplies them with `cf deploy --secrets-file`, because `cf` won't create a Worker whose required secrets are missing. After that they are changed with `cf workers secrets update`, and the `deploy` task never uploads secrets. Env is read at module load, so rotating a secret means redeploying.
- `AUTH_REDIRECT_PROXY_URL` becomes `WEB_APP_ORIGIN` (the **Web app origin**). It's required in production.
- better-auth's CLI can't load `cloudflare:workers`, so `auth-cli.ts` passes a stub database.
- D1 Free limits (50 queries per invocation, 500 MB per database) may suffice. The README recommends Workers Paid (1,000 queries, 10 GB).
- The `cf` CLI and v2 plugin are prerelease, so they're pinned exactly in the pnpm catalog.
- better-auth moves to 1.7 in the same change. `reactStartCookies` becomes `tanstackStartCookies`.
