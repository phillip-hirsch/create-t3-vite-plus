# Research: replacing Nitro with the Cloudflare Vite plugin (Workers deploy)

Researched 2026-10-09. The plugin's v2 and the `cf` CLI are both prereleases that change weekly, so every claim is pinned to a version or commit:

| Source                                             | Version / commit                                                                                                                                                                                      | Date       |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `TanStack/router` (Start docs, examples)           | `main` at [`17a3121`][ts-commit]                                                                                                                                                                      | 2026-10-08 |
| Cloudflare docs                                    | `cloudflare/cloudflare-docs` [`2bc06d2`][cf-commit]                                                                                                                                                   | 2026-10-09 |
| `cloudflare/workers-sdk` (Vite plugin, autoconfig) | `main` at [`cafd3f9`][wsdk-commit] = `@cloudflare/vite-plugin` 1.63.1, `@cloudflare/autoconfig` 0.7.7                                                                                                 | 2026-10-09 |
| `cloudflare/cf` (CLI source)                       | tag `cf@1.0.0-beta.14`, [`3d94b50`][cfcli-commit]; compared with `cf@1.0.0-beta.13` (`00da504`)                                                                                                       | 2026-10-09 |
| `cf` CLI, installed                                | `1.0.0-beta.14` (global, `~/.nvm/versions/node/v24.21.0/bin/cf`; npm `latest`)                                                                                                                        | 2026-10-09 |
| npm packages used in experiments                   | `@cloudflare/vite-plugin` 1.63.1 (`latest`) and 2.0.0-beta.sha-91c870c02 (`beta`, published 2026-10-09), `wrangler` 4.149.0, `@cloudflare/config` 0.24.1, `miniflare` 5.20261006.1-alpha, `pg` 8.23.1 | 2026-10-09 |
| better-auth docs                                   | `better-auth/better-auth` [`53307a7`][ba-commit] (this repo pins `1.4.0-beta.9`)                                                                                                                      | 2026-10-09 |
| Drizzle docs                                       | `drizzle-team/drizzle-orm-docs` [`236d7ea`][dz-commit]                                                                                                                                                | 2026-09-23 |
| This repo                                          | `feat/cloudflare-workers-deploy` at `8f9737e` (Vite+ 1.1.0, `vite` → `@voidzero-dev/vite-plus-core@1.1.0`, `@tanstack/react-start` 1.135.2, `nitro` 3.0.260903-beta)                                  | 2026-10-09 |

"**Experiment Ex**" means a command I ran in `/tmp` (see [Experiments](#experiments)). Nothing in this repo was modified except this file. Overlapping ground from [vinext-web-app.md](./vinext-web-app.md) was re-checked against the sources above, not copied.

---

## Summary

### Settled facts

- **TanStack Start and Cloudflare both document this exact swap.** Remove `nitro()`, add `cloudflare({ viteEnvironment: { name: "ssr" } })` first in `plugins`, and point the Worker's `main`/`entrypoint` at `@tanstack/react-start/server-entry` ([TanStack hosting.md L39–117][ts-hosting-cf]; [Cloudflare TanStack guide L70–128][cf-ts-guide-config], which says "If your Vite configuration includes another deployment adapter, such as `nitro()`, remove the adapter"). Nitro is then fully removable: only `apps/tanstack-start/vite.config.ts:4,34` imports it (E1–E9 ran without it).
- **It works on this repo's Vite+ toolchain as-is.** Both the stable plugin (1.63.1) and the v2 beta built, previewed and ran `vp dev` through `vite-plus`'s `defineConfig` + `lazyPlugins` on the vite-plus-core 1.1.0 alias, with the repo's existing plugin order (E1–E3, E9).
- **The `esmExternalRequirePlugin({ external: ["react"] })` workaround breaks the Worker.** It leaves `import … from "react"` in the bundle, and workerd fails at startup with `No such module "react"` (E1). Without it there is one bundled React copy and everything renders (E2). It has to be removed.
- **Dev runs SSR in workerd, and the Expo dev setup keeps working.** `vp dev` answered with `navigator.userAgent === "Cloudflare-Workers"`. `server.host: true`, port 3000 and `strictPort` are honoured, and the LAN address `http://192.168.1.127:3000` served SSR, tRPC and better-auth (E3, E9). Edits to server routes and to the server entry hot-updated without a restart (E3).
- **better-auth (1.4.0-beta.9, with `expo()`, `oAuthProxy()`, `reactStartCookies()`) and tRPC run unchanged on workerd.** Covered: get-session, social sign-in (which writes to the DB and returns a Discord URL), the expo and oauth-proxy endpoints, and tRPC queries/401s (E2, E6b, E12). better-auth needs `AsyncLocalStorage`, i.e. Node compatibility ([hono.mdx L59–68][ba-workers]).
- **`packages/db` must change.** `@vercel/postgres` is deprecated on npm and rejects non-Neon URLs in workerd (E2). A module-level `pg` pool over Hyperdrive made **every other request hang** (E6a). Cloudflare says to create DB clients per request ([connection-lifecycle.mdx L71–105][cf-hd-lifecycle]). A per-request client via `AsyncLocalStorage`, behind the same `db` export, passed 16/16 requests (concurrent reads and DB writes) in dev and in preview (E6b, E9).
- **Env reaches the Worker as bindings, not shell env.** `process.env` is filled from bindings (vars/secrets) when Node compat is on ([populate-process-env L1–13][cf-process-env]), and it **was** readable at module scope, both via `process.env` and `cloudflare:workers`' `env` (E3, E6b), despite a TanStack doc warning that it isn't (§6). The repo's `dotenv -e ../../.env -- vp dev` only reaches the Worker if secrets are declared (`secrets.required` / `bindings.secret()`) or `CLOUDFLARE_INCLUDE_PROCESS_ENV=true` is set (E5).
- **The build no longer evaluates env.** `vp build` succeeded with no env and no `SKIP_ENV_VALIDATION` (E8c). Validation now runs when the Worker loads.
- **The Worker is small next to the limits.** Wrangler's dry run reported 3,256 KiB upload / 666 KiB gzip (E3b). The limit is 64 MiB uncompressed with "no compressed size limit"; startup is capped at 1 s ([limits.mdx L259–265, L287–293][cf-limits-size]).
- **`vp run build` caching keeps working** once `.wrangler/**`, `dist/**` and (v2) `.cloudflare/**` replace `.nitro/**`/`.output/**` in the task's input exclusions. Cache hits restore `dist/` (E8, E9b).

### Blockers and frictions (facts, no decision implied)

1. **`cf` only drives the v2 beta plugin.** `cf` 1.0.0-beta.14 accepts `@cloudflare/vite-plugin` only in `>=2.0.0-0 <3.0.0-0` ("v2 beta"); otherwise it falls back to Wrangler ≥4.136.0 ([known-impls.ts L116–143][cfcli-impls]). v2 exists only as `2.0.0-beta.sha-*` builds. TanStack's and Cloudflare's TanStack guides document the stable 1.x plugin with `wrangler.jsonc` and `wrangler deploy`.
2. **`cf build`/`cf dev`/`cf deploy` bypass Vite+.** They delegated to `npx vite build` / `npx vite dev`, and `npx` ran plain **vite 8.3.4** from its cache, because the `vite` alias (vite-plus-core) ships no `vite` bin (E9). `cloudflare.config.ts` has no build-command setting (`@cloudflare/config` 0.24.1 `Settings` holds only `accountId` and `complianceRegion`). What stays on Vite+ is `vp build` followed by `cf deploy --prebuilt`, which reads the `.cloudflare/output/v0` that v2 writes (E9).
3. **`cf init` can't set up this app.** In the pnpm workspace it fell back to npm and died on `workspace:*` (E10). Its source also rejects a `plugins` value that isn't an array literal, which rules out `lazyPlugins(() => [...])` ([vite-config.ts L292–310][wsdk-vite-config]; source only, not reached in E10). Setup has to be manual.
4. **Workers counts as "self-hosted production"** in `packages/auth/env.ts:7-8`, so `AUTH_REDIRECT_PROXY_URL` is required at runtime (E6b).
5. **tRPC runs in dev mode on Workers.** `NODE_ENV` reads from `process.env` _are_ inlined by Vite, but tRPC reads `globalThis.process.env.NODE_ENV` at runtime. Production responses included stack traces, and the repo's artificial dev delay applied (E2, E3b). This matches vinext E3.

### Open decisions (for the grilling)

1. **Plugin track:** stable 1.x + `wrangler.jsonc` + Wrangler (what TanStack and Cloudflare's guides show), or v2 beta + `cloudflare.config.ts` + `cf` (the user's CLI preference, prerelease on both sides)? See §3.
2. **How `vp` and `cf` divide the work** if `cf` is chosen: `cf dev`/`cf build` (plain vite via `npx`) or `vp dev`/`vp build` + `cf deploy --prebuilt`.
3. **Data layer:** Hyperdrive + `pg` (any Postgres; needs a Hyperdrive config) or the Neon serverless driver (Neon only), and how a per-request client reaches `@acme/api`/`@acme/auth` (ALS-backed `db` export vs. passing `db` through context and creating `auth` per request). See §5.
4. **Keep Nitro as an option or replace it outright?** That affects the README deploy section, the task cache config, `.gitignore` and the `start` script.
5. **Env shape:** keep `process.env` + `@t3-oss/env-core` at module scope (works, but module-scope clients can keep a stale secret after a rotation that doesn't redeploy code, per [bindings L76–106][cf-bindings-global]) or move to per-request reads / `cloudflare:workers` `env`. Also: how local secrets are supplied (declared secrets loading from the root `.env` via dotenv, a per-app `.dev.vars`, or `CLOUDFLARE_INCLUDE_PROCESS_ENV`), and whether to set `NODE_ENV=production` as a Worker var for tRPC.
6. **Compatibility date and flags:** whether to list `nodejs_compat` explicitly (§7).
7. **Workers plan.** Cloudflare says auth + SSR workloads "typically use 10-20 ms" of CPU, against a 10 ms Free-plan limit ([limits.mdx L67–76][cf-limits-cpu]). Not measured here.

### Unverified

- A deployed Worker. Nothing was deployed, so real Hyperdrive pooling, production startup time and CPU time are untested.
- A full Discord OAuth round trip and the Expo deep-link return. Only the endpoints were exercised (E12).
- A Neon database (no account). Only Hyperdrive + `pg` against local Postgres 17 was run.
- The autoconfig comment that `nodejs_compat` plus a compatibility date ≥ 2026-08-04 is "a workerd validation error". E1–E9 used both locally without error (§7).
- `cf dev` HMR, and `cf` against a v1 + Wrangler project (source only, §3).

---

## 1. TanStack Start on Workers via `@cloudflare/vite-plugin`

- **TanStack's own docs.** "The official Cloudflare Workers setup currently uses Vite through `@cloudflare/vite-plugin`" ([hosting.md L39–117][ts-hosting-cf]). The steps:
  1. `pnpm add -D @cloudflare/vite-plugin wrangler` (no version given; npm `latest` is 1.63.1)
  2. `plugins: [cloudflare({ viteEnvironment: { name: 'ssr' } }), tanstackStart(), viteReact()]`
  3. `wrangler.jsonc` with `compatibility_flags: ["nodejs_compat"]` and `"main": "@tanstack/react-start/server-entry"`
  4. Replace `"start": "node .output/server/index.mjs"` with `preview`/`deploy`/`cf-typegen` (Wrangler) scripts

  Nitro is a separate deploy target ("still under active development", [hosting.md L218–240][ts-hosting-nitro]). The docs don't describe using Nitro's `cloudflare` preset with TanStack Start.

- **Cloudflare's guide** repeats the setup. It adds `observability.enabled`, tells you to remove `nitro()` first, and offers `create-cloudflare --framework=tanstack-start` for new apps ([tanstack-start.mdx L50–128][cf-ts-guide-config]). TanStack Start support in the plugin was announced 2025-10-24 ([changelog][cf-changelog-ts]). The plugin's own docs list "Official support for TanStack Start" ([vite-plugin/index.mdx L19–20][cf-vp-index]).
- **Official example.** [`examples/react/start-basic-cloudflare`][ts-example] pins `@cloudflare/vite-plugin ^1.29.0`, `wrangler ^4.74.0`, `vite ^8.0.14`, `@tanstack/react-start ^1.168.60`. Its plugin order is `tailwindcss(), cloudflare(...), tanstackStart(), viteReact()`, with `compatibility_date: "2025-09-24"` and `nodejs_compat`.
- **Version range.** Cloudflare's autoconfig accepts `@tanstack/react-start` ≥ 1.132.0, "the first Release Candidate for TanStack Start that supports Cloudflare" ([all-frameworks.ts L164–177][wsdk-frameworks]). This repo's 1.135.2 worked (E1–E12). For the plugin, autoconfig installs `@cloudflare/vite-plugin@beta` (v2) when targeting `cf` and the default (`latest`, v1) when targeting Wrangler ([tanstack.ts L9–38][wsdk-autoconfig-ts]). The guides show only v1.
- **Server entry.** The default is `@tanstack/react-start/server-entry` (exported by 1.135.2). To add Queues, Cron, Durable Objects or Workflows, write a custom `src/server.ts` that re-exports `handler.fetch` and point `main` at it ([tanstack-start.mdx L146–202][cf-ts-guide-entry]; [server-entry-point.md L102–104][ts-server-entry]). E3/E6b used such an entry: as a probe, then to open a per-request DB scope.
- **Plugin order.** All sources put `cloudflare()` before `tanstackStart()`. The repo's order (`cloudflare`, `tanstackStart`, `viteReact`, `tailwindcss`) worked; the example puts `tailwindcss()` first. I found no source that says Tailwind's position matters.
- **What Nitro removal touches in this repo:** the `nitro` dependency and import; the `start` script; `.nitro .output` in the `clean` script (`apps/tanstack-start/package.json:7,9,29`); the cache inputs and Nitro/Vercel env list (`vite.config.ts:40-66`); `.gitignore:11-13`; the `typecheck` exclusion glob (`tooling/typescript/typecheck.ts:20`); and the README deploy step (`README.md:194`). `packages/generator` doesn't touch the web app or its deploy target: it scaffolds `packages/*` libraries with a plain `vite-plus` config (`packages/generator/src/template.ts:77-85`; no `nitro`, `tanstack-start` or deploy references).

## 2. Vite+ compatibility

- **`defineConfig`/`lazyPlugins` and the alias.** E1 (v1.63.1) and E9 (v2 beta) both built with `vp build`, previewed with `vp preview` and ran `vp dev`, from `vite-plus`'s `defineConfig` with `plugins: lazyPlugins(() => [cloudflare(...), ...])`, on `vite` → `@voidzero-dev/vite-plus-core@1.1.0`. Declared peers: v1.63.1 `vite ^6.1.0 || ^7.0.0 || ^8.0.0` + `wrangler ^4.149.0`; v2 beta `vite ^7.0.0 || ^8.0.0` (npm registry). pnpm reported no new peer issues for either. The existing ones (`utf-8-validate`, `better-sqlite3`, `esbuild`) are in other packages. Installing needed `allowBuilds: { workerd: true }`, as in vinext E3.
- **The React workaround is harmful under workerd.** The Worker environment bundles its dependencies, but `esmExternalRequirePlugin({ external: ["react"] })` forced `react` external. Seven chunks kept `import … from "react"`, and `vp preview` died at startup: `Uncaught Error: No such module "react". imported from "index.js"` (E1). With the whole `environments.ssr` block removed, the bundle has no bare `react` import, exactly one copy of React's internals, and SSR renders (E2). The comment's concern ("keep React requires visible to Nitro") is Nitro-specific.
- **`run.tasks.build.cache`.**
  - _Inputs._ The Cloudflare build reads and writes `.wrangler/deploy/config.json`, so with the current `!.nitro/**`/`!.output/**` exclusions `vp run` refused to cache ("read and wrote 'apps/tanstack-start/.wrangler/deploy/config.json'") (E8). With `[{ auto: true }, "!.wrangler/**", "!dist/**"]` the second run was a cache hit, and deleting `dist/` then re-running restored it from cache. v2 also writes `.cloudflare/output/v0/...`, which needs `!.cloudflare/**` too (E9b).
  - _Env list._ The Nitro/Vercel preset variables (`NITRO_PRESET`, `SERVER_PRESET`, `VERCEL*`, `NOW_BUILDER`, `GITHUB_ACTIONS`, `*_COMPATIBILITY_DATE`) no longer select anything. The build didn't read the app's env either: `vp build` succeeded with `SKIP_ENV_VALIDATION` and `POSTGRES_URL` unset (E8c). `SKIP_ENV_VALIDATION` survives into the bundle as a runtime `process.env` read. Variables the Cloudflare side does read at build time include `CLOUDFLARE_ENV`, which picks an environment's config and `.dev.vars.<env>` ([secrets.mdx L16–22][cf-vp-secrets]), and `CLOUDFLARE_VITE_FORCE_BUILD_OUTPUT`, which `cf` sets ([plugin-config.ts L154–174][wsdk-newconfig]). Client `VITE_*` vars are still inlined by Vite.
- **Generated files not in `.gitignore`:** `.wrangler/`, `.cloudflare/` (v2 types and build output), `.dev.vars*`, and `worker-configuration.d.ts` (Wrangler typegen, which may be committed instead). Cloudflare says `.dev.vars` and `.env` must not be committed ([secrets-in-dev L26–28][cf-secrets-dev]). `vp build` also **copies `.dev.vars` into `dist/server/`** for `vite preview`; Cloudflare says that copy "is not deployed" ([secrets.mdx L20–22][cf-vp-secrets]; E2 `ls -a dist/server`).
- **Typecheck.** `cloudflare:workers` needs Worker types. With v1, `wrangler types` writes `worker-configuration.d.ts`, which also augments `NodeJS.ProcessEnv` with the declared secrets. `tsc --noEmit` then passed on TS 7.0.2 (E7). v2 writes `.cloudflare/types/index.d.ts` on every config load, but the app's `include: ["**/*.ts", "**/*.tsx"]` doesn't reach the dot-directory, so tsc failed until the file was added to `include` explicitly (E13).

## 3. Config and CLI: `wrangler.jsonc` vs `cloudflare.config.ts`, Wrangler vs `cf`

- **v1 (1.63.1, npm `latest`)** reads `wrangler.json`/`wrangler.jsonc`/`wrangler.toml` from the root by default ([get-started.mdx L54][cf-vp-getstarted]). It has an **experimental** `experimental.newConfig` option that loads `cloudflare.config.ts` instead, plus `cfBuildOutput` to emit `.cloudflare/output/v0/` "intended for consumption by the new `cf` CLI" ([plugin-config.ts L112–191][wsdk-newconfig]). `cf` still won't use v1 as its dev/build implementation (below).
- **v2 beta** loads `cloudflare.config.ts` (default export from `cf/config`'s `defineConfig`, with a required `worker`), generates `.cloudflare/types/index.d.ts`, and its `cf-vite` bin is the delegate `cf` invokes (v2 `dist/index.mjs` `loadCloudflareConfig`; package `bin`). `cf/config` comes from the `cf` package, so `cf` becomes a devDependency of the app. The config used in E9:

  ```ts
  import { bindings, defineConfig } from "cf/config";
  export default defineConfig({
    worker: {
      name: "acme-tanstack-start",
      entrypoint: "./src/server.ts", // or "@tanstack/react-start/server-entry"
      compatibilityDate: "2026-10-01",
      env: {
        HYPERDRIVE: bindings.hyperdrive({
          id: "…",
          dev: { connectionString: "postgres://…" },
        }),
        AUTH_SECRET: bindings.secret(), // likewise POSTGRES_URL, AUTH_DISCORD_*, AUTH_REDIRECT_PROXY_URL
      },
    },
  });
  ```

  The `dev.connectionString` is written into `.cloudflare/output/v0/workers/default/worker.config.json` (E9). Cloudflare also documents an env var instead: `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING>` ([hyperdrive get-started L345–375][cf-hd-local-env]).

- **What `cf` 1.0.0-beta.14 does with a Vite project** (source at the tag; behaviour checked in E9):
  - `cf build` runs autoconfig detection. A project counts as configured when `cloudflare.config.ts` exists ([details/index.ts L132–169][wsdk-details]). It then runs the framework's **built-in** build command, not the `package.json` script. The source comment says so: "@netlify/build-info prefers package.json scripts … cf needs direct commands for supported frameworks" ([framework-detection.ts L106–123][wsdk-detect]). For TanStack Start that command is `npx vite build`, run with `CLOUDFLARE_VITE_FORCE_BUILD_OUTPUT=true` ([tanstack.ts L10–12][wsdk-autoconfig-ts]). Afterwards it reads the Build Output from `.cloudflare/output/v0` ([build/index.ts L30–104][cfcli-build]).
  - `cf deploy` builds the same way unless given `--prebuilt` ("Deploy existing Build Output Specification files without building"). `--dry-run` makes no API requests: "Dry runs make no API requests" ([deploy/shared.ts L97–139][cfcli-deploy]). It also takes `--secrets-file` (JSON or .env) and provisions binding resources by default (`--provision`, on unless `--no-provision`) (`cf deploy --help`).
  - `cf dev` "runs your framework's dev command when available, falling back to an installed Cloudflare dev server" (`cf dev --help`). For this app that was `npx vite dev`, again plain vite 8.3.4 (E9).
  - Known dev/build implementations: `@cloudflare/vite-plugin` in range `>=2.0.0-0 <3.0.0-0` ("v2 beta"), and `wrangler` `>=4.136.0` as fallback ([known-impls.ts L116–143][cfcli-impls]).
  - Projects with a Wrangler config: `cf build`/`cf deploy` first offer to convert it via `@cloudflare/codemods` ([autoconfig.ts L106–143][cfcli-autoconfig]; [wrangler-migration.ts L12–16][cfcli-migration]), and `cf migrate [path] [--bundler vite|wrangler] [--dry-run]` does the same explicitly (`cf migrate --help`). Not exercised.
  - `cf init` autoconfig failed in this workspace (E10). Its proposed `cloudflare.config.ts` set `compatibilityDate: "2026-10-06"` and `observability`, and no `compatibilityFlags` (see §7). The Vite-config transform it would have applied also removes `nitro` ([vite-config.ts L162][wsdk-vite-config]), but it requires an array-literal `plugins`.
- **beta.13 → beta.14 recheck.** The vinext research used beta.13. Between the tags, `commands/build`, `commands/deploy`, `commands/dev`, `lib/autoconfig.ts`, `lib/build-output.ts` and `lib/wrangler-migration.ts` have no source changes. The diff is:
  - `--dry-run` on the hand-written commands. `cf build --dry-run`, `cf dev --dry-run` and `cf init --dry-run` now exist and validate "arguments only" (E9). `cf deploy --dry-run` already existed in beta.13.
  - Dependency bumps: `@cloudflare/autoconfig` 0.7.6 → 0.7.7, `@cloudflare/config` 0.24.0 → 0.24.1, `@cloudflare/build-output-utils` 0.8.6 → 0.9.0, `@cloudflare/codemods` 0.4.1 → 0.4.2.
  - Regenerated API commands, and binary uploads no longer time out ([CHANGELOG L3–33][cfcli-changelog]).

  The v2-only constraint is identical in both tags. npm's `latest` is now beta.14, not beta.13 as the vinext doc recorded.

- **Wrangler path (v1).** `wrangler deploy --dry-run -c dist/server/wrangler.json` read the build output without logging in (E3b, E6b). TanStack's and Cloudflare's guides use `wrangler deploy` and `wrangler types` ([hosting.md L78–113][ts-hosting-cf]).

## 4. Dev server

- **SSR runs in workerd.** A probe route in the custom entry returned `"userAgent":"Cloudflare-Workers"` under `vp dev` (E3) and under `cf dev`/`vp dev` with v2 (E9). The plugin printed "Using secrets defined in .dev.vars" or "… in process.env", depending on the source (E3, E5).
- **Host, port, strictPort.** `server.host: true` and `port: 3000` gave `Local: http://localhost:3000/` and `Network: http://192.168.1.127:3000/`. Curling the LAN address returned 200 for `/`, `get-session` and tRPC (E3, E9), which is the URL shape `apps/expo/src/utils/base-url.ts:25` builds. A second `vp dev` with port 3000 busy exited with "Port 3000 is already in use" (E3). The plugin bumps the inspector port by itself when 9229 is taken ("Default inspector port 9229 not available, using 9230 instead").
- **HMR.** Editing `src/routes/api/auth.$.ts` changed the response within ~3 s, twice, and editing `src/server.ts` did too. The log showed `(ssr) hmr update virtual:cloudflare/worker-entry` with no restart (E3). Client-side HMR wasn't checked in a browser.
- **Dev-only noise:** a "failed to connect to the docker API" line, harmless without containers, and a "Local Explorer API" banner printed when the plugin detects an AI agent (E3, E9).

## 5. Database

- **Today:** `packages/db/src/client.ts:1-10` builds one module-level `db` from `drizzle-orm/vercel-postgres`. `@acme/api` (`packages/api/src/trpc.ts:14`) and `@acme/auth` (`packages/auth/src/index.ts:7,21`) import it at module scope. The Expo app imports only types from `@acme/api` (`apps/expo/src/utils/api.tsx:6,50`) and talks to the web app over HTTP, so it is unaffected by any driver change.
- **`@vercel/postgres` on Workers.** npm marks it deprecated ("If you had an existing Vercel Postgres database, it should have been migrated to Neon"). In E2 it bundled and ran, then failed with `invalid_connection_string … use a pooled connection string` on a plain Postgres URL.
- **Documented options:**

| Option                                              | Source                                                                                                                                                                                                                                                                                    | What changes in `packages/db`                                                                                                                                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hyperdrive + `pg` (node-postgres)                   | Cloudflare's Drizzle guide creates `new Client({ connectionString: env.HYPERDRIVE.connectionString })` "for each request" ([drizzle-orm.mdx L68–105][cf-hd-drizzle]); Hyperdrive is "recommended" for Postgres ([connecting-to-databases.mdx L15–44][cf-connect-db])                      | `drizzle-orm/node-postgres` + `pg`, a Hyperdrive binding (a Hyperdrive config per environment), per-request client. Any Postgres host.                                                                 |
| Hyperdrive + Postgres.js                            | "not currently supported" ([drizzle-orm.mdx L104][cf-hd-drizzle])                                                                                                                                                                                                                         | Not an option                                                                                                                                                                                          |
| Neon serverless driver (`@neondatabase/serverless`) | Drizzle `neon-http` ("faster for single, non-interactive transactions") or `neon-serverless`/WebSockets (sessions, interactive transactions), with a Workers example ([connect-neon.mdx L20–28][dz-neon]); Cloudflare lists it alongside Hyperdrive for Neon ([neon.mdx L15–17][cf-neon]) | Driver import and construction; no Hyperdrive. Postgres must be Neon. The per-request rule applies to its WebSocket pool too (Cloudflare's lifecycle note covers any driver-level pool). Not run here. |

- **Local dev with Hyperdrive.** `localConnectionString` (Wrangler) or `dev.connectionString` (`cf/config`), or the `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` env var. Locally the Worker connects straight to the database, with no Hyperdrive pooling or caching ([local-development.mdx L16–30][cf-hd-localdev]). Miniflare rejects a connection string without a password ("You must provide a password") (E6a).
- **Module-level vs per-request, measured (E6a/E6b), local Postgres 17 through the Hyperdrive binding:**
  - _Module-level_ `drizzle({ client: new Pool({ connectionString: env.HYPERDRIVE.connectionString }) })`, i.e. today's shape: sequential reads went 200/500/200/500/200, concurrent reads half 500, writes 500/200/500. The 500 body was "The Workers runtime canceled this request because it detected that your Worker's code had hung". This matches Cloudflare's warning ([connection-lifecycle.mdx L71–105][cf-hd-lifecycle]) and vinext [#537][vx-537].
  - _Per-request_ (E6b): `packages/db` exports `runWithDb(connectionString, fn)`, which creates a drizzle client on a new `Pool` and runs `fn` inside `AsyncLocalStorage`. `db` stays exported as a `Proxy` that resolves to the current request's client. `src/server.ts` wraps `handler.fetch` in `runWithDb(env.HYPERDRIVE.connectionString, …)`. `@acme/api`, `@acme/auth` (including `drizzleAdapter(db)` at module scope) and the SSR `unstable_localLink` path (`apps/tanstack-start/src/lib/trpc.ts:18-33`) were unchanged. Result: 16/16 = 200 in dev and preview, with verification rows written. That is +1 dependency (`pg`) and ~30 lines in `client.ts`. Cloudflare's docs point to `AsyncLocalStorage` as the tool for this ([bindings L106][cf-bindings-global]). Clients weren't explicitly closed; the Hyperdrive example doesn't close them either.
  - _Alternative not run:_ pass `db` through `createTRPCContext` and call `initAuth` per request. That changes `@acme/api`'s and `@acme/auth`'s signatures and builds a `betterAuth` instance on every request.
- **drizzle-kit is unaffected.** It runs in Node against `POSTGRES_URL` (`packages/db/drizzle.config.ts`). `drizzle-kit push` worked against the local database (E6 setup).

## 6. Auth and env

- **better-auth on Workers.** The docs require Node compatibility for `AsyncLocalStorage` ("Use `nodejs_als` instead if you only need AsyncLocalStorage") ([hono.mdx L59–68][ba-workers]). The pinned 1.4.0-beta.9 with `expo()`, `oAuthProxy()` and `reactStartCookies()` responded in preview:
  - `/api/auth/ok` 200
  - `get-session` 200
  - `expo-authorization-proxy` 400 / `oauth-proxy-callback` 400 (missing params; the routes exist)
  - `POST sign-in/social` 200 with a Discord authorize URL whose `redirect_uri` comes from `AUTH_REDIRECT_PROXY_URL`, both with a browser `origin` and with `expo-origin: expo://` (E12)

  Current docs name the cookie plugin `tanstackStartCookies` from `better-auth/tanstack-start` ([tanstack.mdx L51–61][ba-tanstack]); the repo's older `reactStartCookies` import worked. That rename isn't Workers-specific.

- **How env gets in.**
  - **Bindings** (vars, secrets, Hyperdrive …) are the only source in production. Text/JSON bindings are copied to `process.env` when Node compat is on and `nodejs_compat_populate_process_env` is active, which it is by default from 2025-04-01 ([populate-process-env L1–13][cf-process-env]). `@t3-oss/env-core` with `runtimeEnv: process.env` worked unchanged (E2, E6b).
  - **`import { env } from "cloudflare:workers"`** gives the same bindings, typed, and is documented for top-level use ([bindings L158–171][cf-bindings-global]). E3's probe saw both `process.env.AUTH_DISCORD_ID` and `env.AUTH_DISCORD_ID` as strings **at module load**, in dev and in preview.
  - **Conflict between sources.** TanStack's docs say "On Cloudflare Workers … module-level `process.env.X` reads run before the env exists and evaluate to `undefined`" ([environment-variables.md L8, L409–418][ts-env]; [execution-model.md L200–214][ts-exec]). Cloudflare documents the opposite for `cloudflare:workers` `env`, and E3/E3b observed values at module scope with compatibility date 2026-10-01. One caveat Cloudflare does document: a binding-only change can reuse running isolates, so module-scope objects built from a secret "might continue to exist" with the old value ([bindings L76–106][cf-bindings-global]). This repo builds `env` and `auth` at module scope (`apps/tanstack-start/src/env.ts:7`, `apps/tanstack-start/src/auth/server.ts:16`).
- **`SKIP_ENV_VALIDATION`.** The Worker build doesn't evaluate env (E8c), so this flag no longer matters for `vp build`. At runtime it's an ordinary `process.env` read, so setting it as a Worker var would skip validation in production.
- **Local dev secrets.**
  - Cloudflare loads `.dev.vars` **or** `.env` from the directory holding the Worker config, never both. With `secrets.required` declared, only those keys load, and they "load from `process.env` automatically" ([secrets-in-dev L9–17, L41–46][cf-secrets-dev]).
  - E5, with `apps/tanstack-start` holding no `.dev.vars`/`.env` and the repo's `dotenv -e ../../.env -- vp dev`:
    - nothing declared → env validation failed (`AUTH_DISCORD_SECRET` missing)
    - `CLOUDFLARE_INCLUDE_PROCESS_ENV=true` → worked
    - `secrets.required` (v1) or `bindings.secret()` (v2) → worked, "Using secrets defined in process.env"
  - `vp preview` behaved the same with declared secrets (E6b, E9). For `cf deploy`, `--secrets-file` uploads secrets with the version.
- **`isSelfHostedProduction`.** `NODE_ENV` is inlined as `production` and `VERCEL_ENV` is absent, so `AUTH_REDIRECT_PROXY_URL` is required. Preview failed with "Required in self-hosted production" until it was supplied (E6b). `getBaseUrl()` falls back to `http://localhost:${process.env.PORT ?? 3000}` on the server outside Vercel (`apps/tanstack-start/src/lib/url.ts:15`), which is why `auth/server.ts` prefers `AUTH_REDIRECT_PROXY_URL`.
- **`NODE_ENV` at runtime.** The probe saw `process.env.NODE_ENV` as `"production"` in preview because Vite inlines that expression. tRPC still returned stack traces in preview (E2, E3b), because it reads `globalThis.process.env.NODE_ENV`, which isn't inlined (vinext §4 has the same finding).

## 7. Compatibility date, flags and limits

- **`nodejs_compat`.** The flag's entry has `enable_date: "2026-08-04"`: "For compatibility dates of `2026-08-04` or later, Workers enables both `nodejs_compat` and `nodejs_compat_v2` by default", and "Existing projects do not need to remove these flags" ([nodejs-compat.mdx L9–16, L35][cf-nodejs-compat]). E11 (date 2026-10-01, no flag) ran better-auth, `pg`, `process.env` and SSR fine.
  - Cloudflare's autoconfig source says that from that date, "specifying `nodejs_compat` as well is a workerd validation error", and strips the flag ([run.ts L367–395][wsdk-run]). E1–E9 used both locally (workerd from miniflare 5.20261006.1-alpha) without an error, and `wrangler deploy --dry-run` accepted it. Whether the deploy API rejects the combination is **unverified**. The guides still show `"compatibility_flags": ["nodejs_compat"]` with `"$today"`.
- **Other flags.** None were needed for this app.
- **Limits** ([limits.mdx][cf-limits-size]):
  - **Size.** 64 MiB uncompressed on both plans, "no compressed size limit". This app is ~3.2 MiB / ~654–666 KiB gzip across E3b, E6b and E9. The largest chunk is `router-*.js` at ~2.3 MiB, which includes better-auth's Kysely dialects (bun-sqlite and node-sqlite chunks appear in the output).
  - **Startup.** 1 s to parse and run global scope. That covers env validation and `betterAuth()` construction here; not measured in production.
  - **CPU.** 10 ms on Free; Paid default 30 s, up to 5 min. "Heavier workloads that handle authentication, server-side rendering … typically use 10-20 ms" ([L67–76][cf-limits-cpu]).
  - **Connections and memory.** 6 simultaneous outgoing connections per request, 128 MB memory ([L18–36][cf-limits-table]).

## 8. Prior art

- **First-party:**
  - TanStack's [`start-basic-cloudflare`][ts-example] (v1 plugin + Wrangler)
  - Cloudflare's `create-cloudflare` template `tanstack-start`, which runs `@tanstack/cli create --deployment cloudflare` and sets `deploy: "… build && wrangler deploy"`, `preview`, and `cf-typegen: "wrangler types"` ([c3.ts][wsdk-c3])
  - Cloudflare's framework guide ([tanstack-start.mdx][cf-ts-guide-config])
  - Cloudflare's autoconfig for the `cf` target, which installs v2 beta and writes `cloudflare.config.ts` with `entrypoint: "@tanstack/react-start/server-entry"` (E10 output; [tanstack.ts][wsdk-autoconfig-ts])
  - `cloudflare/cf`'s own `fixtures/vite-plugin-project` (v2 + `cloudflare.config.ts` + `vp dev`)
- **T3-style monorepos:** none found. `gh search repos "create-t3-turbo cloudflare"` returned nothing. `t3-oss/create-t3-turbo` has no Cloudflare issues or PRs, only Nitro/nitropack dependency bumps. A code search for `cloudflare({ viteEnvironment` + `trpc` found only unrelated apps (searched 2026-10-09).

---

## Experiments

All on macOS, Node 24.21.0 (Vite+ runs Node 22.23.3 per `engines.node`), pnpm 12.10.1, global `vp` 1.1.0, global `cf` 1.0.0-beta.14, on 2026-10-09. Downloads went into new directories under `/tmp/cfw-research/`. No Cloudflare login, no deploys, no resources created: dry runs only, with a fake Hyperdrive ID. Postgres was a throwaway Postgres 17 cluster (`initdb` in `/tmp/cfw-research/pgdata`, port 55432), stopped afterwards. There is no E4: the number was skipped. "Repo copy" means `git clone` of this worktree (`8f9737e`) into `/tmp/cfw-research/repo` + `pnpm install --frozen-lockfile`. `dbtest.sh` = 5 sequential `GET /api/trpc/post.all`, 8 concurrent, 3 `POST /api/auth/sign-in/social` (a DB write).

- **E0** Baseline, unmodified: `SKIP_ENV_VALIDATION=1 vp build` → Nitro `.output/server` 3.4 MB.
- **E1** `pnpm add -D @cloudflare/vite-plugin@1.63.1 wrangler@4.149.0 --config.minimum-release-age=0` (after adding `workerd: true` to `allowBuilds`). `nitro()` → `cloudflare({ viteEnvironment: { name: "ssr" } })`, React workaround kept. `wrangler.jsonc`: `compatibility_date: "2026-10-01"`, `nodejs_compat`, `main: "@tanstack/react-start/server-entry"`. `SKIP_ENV_VALIDATION=1 vp build` → exit 0; `dist/client`, `dist/server/{index.js,wrangler.json}`; 7 chunks still `import … from "react"`. `vp preview --port 4173` → `MiniflareCoreError … Uncaught Error: No such module "react"`.
- **E2** Removed the `environments.ssr` block and `esmExternalRequirePlugin` import, rebuilt: no bare `react` import, one React internals definition. `vp preview` with a `.dev.vars` (dummy secrets):
  - `/` 200 (H1 "Create T3 Vite+", stylesheet link), `get-session` 200 `null`, `auth.getSession` 200, `auth.getSecretMessage` 401 **with stack**, `/api/auth/ok` 200
  - `sign-in/social` 500 `invalid_connection_string` (`@vercel/postgres`)
  - `.dev.vars` present in `dist/server/`
- **E3** Custom `src/server.ts` probe (module-scope `typeof process.env.AUTH_DISCORD_ID` and `cloudflare:workers` `env`, `navigator.userAgent`) as `main`. `vp dev`:
  - `/__probe` → both `"string"`, `"Cloudflare-Workers"`
  - `/`, `get-session`, tRPC 200 on `localhost:3000` and `192.168.1.127:3000`
  - Second `vp dev` → "Error: Port 3000 is already in use"
  - Edited `auth.$.ts` twice and `server.ts` once: new responses within 3 s, log `hmr update virtual:cloudflare/worker-entry`
  - **E3b** `vp build && vp preview --port 4174`: probe saw both env sources as `"string"`, `NODE_ENV` `"production"`; tRPC 401 still had a stack. `wrangler deploy --dry-run -c dist/server/wrangler.json` → "Total Upload: 3256.49 KiB / gzip: 666.27 KiB", no login.
- **E5** No `.dev.vars`; root `.env` with the five secrets; `../../node_modules/.bin/dotenv -e ../../.env -- vp dev`. (A first run was discarded: the E3 server was still bound to :3000.)
  - **E5a** plain: probe `"undefined"`; `get-session` 500 "Invalid environment variables" (`AUTH_DISCORD_SECRET`)
  - **E5b** `CLOUDFLARE_INCLUDE_PROCESS_ENV=true`: `"string"`, 200, "Using secrets defined in process.env"
  - **E5c** `"secrets": { "required": [...] }` in `wrangler.jsonc`, no extra env: `"string"`, 200
- **E6** `pnpm add pg@8.23.1`, `-D @types/pg`. `drizzle-kit push --force` against `postgres://postgres:pw@127.0.0.1:55432/acme` created `account, post, session, user, verification`. Hyperdrive binding with that `localConnectionString` (a URL without a password failed: "You must provide a password").
  - **E6a** Module-level `drizzle({ client: new Pool({ connectionString: env.HYPERDRIVE.connectionString }) })`, `vp dev`, `dbtest.sh`: sequential `200 500 200 500 200`, concurrent 4/8 500, writes `500 200 500`. 500 body: "The Workers runtime canceled this request because it detected that your Worker's code had hung".
  - **E6b** ALS `runWithDb` + `Proxy` `db` (§5), `server.ts` wrapping `handler.fetch`:
    - `vp dev`: 16/16 200, `/` 200, verification rows written
    - `vp build && vp preview`: first failed "Required in self-hosted production" (`AUTH_REDIRECT_PROXY_URL`); after adding it to `secrets.required` and root `.env` and rebuilding: 16/16 200
    - `wrangler deploy --dry-run` → 3232.40 KiB / gzip 654.09 KiB, `env.HYPERDRIVE` listed
- **E7** `tsc --noEmit -p apps/tanstack-start` → `TS2307: Cannot find module 'cloudflare:workers'`. After `wrangler types` (writes `worker-configuration.d.ts`, incl. `NodeJS.ProcessEnv` augmentation): no errors.
- **E8** From the repo root, `SKIP_ENV_VALIDATION=1 vp run --filter @acme/tanstack-start build` twice → "not cached because it modified its input"; `vp run --last-details` → "read and wrote 'apps/tanstack-start/.wrangler/deploy/config.json'".
  - **E8b** `input: [{ auto: true }, "!.wrangler/**", "!dist/**"]` → miss, then "cache hit, replaying"; after `rm -rf dist` a cache hit restored `dist/client` and `dist/server`
  - **E8c** `env -u SKIP_ENV_VALIDATION -u POSTGRES_URL vp build` → exit 0
- **E9** `pnpm remove wrangler`; `pnpm add -D @cloudflare/vite-plugin@2.0.0-beta.sha-91c870c02 cf@1.0.0-beta.14`; `wrangler.jsonc` → `cloudflare.config.ts` (§3, with `compatibilityFlags: ["nodejs_compat"]`).
  - `vp build` → exit 0; output only in `.cloudflare/output/v0/workers/default/{bundle,assets,worker.config.json}` + `.cloudflare/types/index.d.ts` (no `dist/`)
  - `vp preview` and `vp dev` (via `192.168.1.127:3000`), each with `dotenv -e ../../.env`: `dbtest.sh` 16/16 200, `/` 200
  - With `CI=1` and the global `cf` 1.0.0-beta.14 in `apps/tanstack-start`:
    - `cf build --dry-run` → `{"validated":"arguments only"}`
    - `cf build` → "Delegating to npx vite build", **"vite v8.3.4"**, "Build complete"
    - `cf deploy --dry-run` → same build, then "Total Upload: 3229.95 KiB / gzip: 654.02 KiB", `env.HYPERDRIVE`, "--dry-run: exiting now"
    - `vp build` then `cf deploy --prebuilt --dry-run` → no build step, "Total Upload: 3232.40 KiB"
    - `cf dev` → "Delegating to npx vite dev", "VITE v8.3.4"; `/` 200, `post.all` 200
  - `node_modules/vite/package.json` = `@voidzero-dev/vite-plus-core` 1.1.0 with no `bin`; the 8.3.4 came from `~/.npm/_npx/9ed06546b0653f96/`. Each `cf` run warned "No lock file has been detected … Auto-configuration of projects inside workspaces is limited".
  - **E9b** Task cache with v2 → "read and wrote '…/.cloudflare/output/v0/workers/default/worker.config.json'"; adding `"!.cloudflare/**"` → hit on the second run.
- **E10** Fresh repo copy (unmodified), `CI=1 cf init .` in `apps/tanstack-start`, and `CI=1 cf init apps/tanstack-start` from the root. Detected "Framework: TanStack Start, Build Command: npx vite build, Output Directory: dist/client". Planned: install `cf` + `@cloudflare/vite-plugin@beta`, scripts `deploy: "cf deploy"` and `cf-typegen: "cf workers types"`, and `cloudflare.config.ts` with `compatibilityDate: "2026-10-06"`, `observability`, `entrypoint: "@tanstack/react-start/server-entry"`, no flags. Then failed: `npm error code EUNSUPPORTEDPROTOCOL … "workspace:": workspace:*`. No files changed.
- **E11** E9 config without `compatibilityFlags` (date 2026-10-01): `vp build && vp preview` → `dbtest.sh` 16/16 200, `/` 200.
- **E12** E9/E11 build, `vp preview --port 4178`: `/api/auth/ok` 200; `expo-authorization-proxy` 400 and `oauth-proxy-callback?callbackURL=/` 400 (`VALIDATION_ERROR` "Invalid query parameters"); `sign-in/social` with `origin` → JSON with a Discord authorize URL; with `expo-origin: expo://` → 200.
- **E13** v2 state: `tsc --noEmit -p .` → `TS2307 … 'cloudflare:workers'`. With `.cloudflare/types/index.d.ts` added to `include` (temporary `tsconfig.e13.json`): no errors.

---

<!-- Reference links -->

[ts-commit]: https://github.com/TanStack/router/tree/17a3121ff494a481518d54732cdb939c7f61eb2c
[ts-hosting-cf]: https://github.com/TanStack/router/blob/17a3121ff494a481518d54732cdb939c7f61eb2c/docs/start/framework/react/guide/hosting.md#L39-L117
[ts-hosting-nitro]: https://github.com/TanStack/router/blob/17a3121ff494a481518d54732cdb939c7f61eb2c/docs/start/framework/react/guide/hosting.md#L218-L240
[ts-server-entry]: https://github.com/TanStack/router/blob/17a3121ff494a481518d54732cdb939c7f61eb2c/docs/start/framework/react/guide/server-entry-point.md#L102-L104
[ts-env]: https://github.com/TanStack/router/blob/17a3121ff494a481518d54732cdb939c7f61eb2c/docs/start/framework/react/guide/environment-variables.md#L8-L418
[ts-exec]: https://github.com/TanStack/router/blob/17a3121ff494a481518d54732cdb939c7f61eb2c/docs/start/framework/react/guide/execution-model.md#L200-L214
[ts-example]: https://github.com/TanStack/router/tree/17a3121ff494a481518d54732cdb939c7f61eb2c/examples/react/start-basic-cloudflare
[cf-commit]: https://github.com/cloudflare/cloudflare-docs/tree/2bc06d2d4adc519aa445c6eb1cee3e69c3ced2d4
[cf-ts-guide-config]: https://github.com/cloudflare/cloudflare-docs/blob/2bc06d2d4adc519aa445c6eb1cee3e69c3ced2d4/src/content/docs/workers/framework-guides/web-apps/tanstack-start.mdx#L50-L128
[cf-ts-guide-entry]: https://github.com/cloudflare/cloudflare-docs/blob/2bc06d2d4adc519aa445c6eb1cee3e69c3ced2d4/src/content/docs/workers/framework-guides/web-apps/tanstack-start.mdx#L146-L202
[cf-changelog-ts]: https://github.com/cloudflare/cloudflare-docs/blob/2bc06d2d4adc519aa445c6eb1cee3e69c3ced2d4/src/content/changelog/workers/2025-10-24-tanstack-start.mdx#L11-L61
[cf-vp-index]: https://github.com/cloudflare/cloudflare-docs/blob/2bc06d2d4adc519aa445c6eb1cee3e69c3ced2d4/src/content/docs/workers/vite-plugin/index.mdx#L19-L20
[cf-vp-getstarted]: https://github.com/cloudflare/cloudflare-docs/blob/2bc06d2d4adc519aa445c6eb1cee3e69c3ced2d4/src/content/docs/workers/vite-plugin/get-started.mdx#L54
[cf-vp-secrets]: https://github.com/cloudflare/cloudflare-docs/blob/2bc06d2d4adc519aa445c6eb1cee3e69c3ced2d4/src/content/docs/workers/vite-plugin/reference/secrets.mdx#L16-L22
[cf-secrets-dev]: https://github.com/cloudflare/cloudflare-docs/blob/2bc06d2d4adc519aa445c6eb1cee3e69c3ced2d4/src/content/partials/workers/secrets-in-dev.mdx#L9-L46
[cf-process-env]: https://github.com/cloudflare/cloudflare-docs/blob/2bc06d2d4adc519aa445c6eb1cee3e69c3ced2d4/src/content/compatibility-flags/nodejs-compat-populate-process-env.md#L1-L13
[cf-nodejs-compat]: https://github.com/cloudflare/cloudflare-docs/blob/2bc06d2d4adc519aa445c6eb1cee3e69c3ced2d4/src/content/compatibility-flags/nodejs-compat.mdx#L9-L35
[cf-bindings-global]: https://github.com/cloudflare/cloudflare-docs/blob/2bc06d2d4adc519aa445c6eb1cee3e69c3ced2d4/src/content/docs/workers/runtime-apis/bindings/index.mdx#L76-L171
[cf-limits-table]: https://github.com/cloudflare/cloudflare-docs/blob/2bc06d2d4adc519aa445c6eb1cee3e69c3ced2d4/src/content/docs/workers/platform/limits.mdx#L18-L36
[cf-limits-cpu]: https://github.com/cloudflare/cloudflare-docs/blob/2bc06d2d4adc519aa445c6eb1cee3e69c3ced2d4/src/content/docs/workers/platform/limits.mdx#L67-L76
[cf-limits-size]: https://github.com/cloudflare/cloudflare-docs/blob/2bc06d2d4adc519aa445c6eb1cee3e69c3ced2d4/src/content/docs/workers/platform/limits.mdx#L259-L293
[cf-connect-db]: https://github.com/cloudflare/cloudflare-docs/blob/2bc06d2d4adc519aa445c6eb1cee3e69c3ced2d4/src/content/docs/workers/databases/connecting-to-databases.mdx#L15-L44
[cf-neon]: https://github.com/cloudflare/cloudflare-docs/blob/2bc06d2d4adc519aa445c6eb1cee3e69c3ced2d4/src/content/docs/workers/databases/third-party-integrations/neon.mdx#L15-L17
[cf-hd-drizzle]: https://github.com/cloudflare/cloudflare-docs/blob/2bc06d2d4adc519aa445c6eb1cee3e69c3ced2d4/src/content/docs/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/drizzle-orm.mdx#L68-L105
[cf-hd-lifecycle]: https://github.com/cloudflare/cloudflare-docs/blob/2bc06d2d4adc519aa445c6eb1cee3e69c3ced2d4/src/content/docs/hyperdrive/concepts/connection-lifecycle.mdx#L71-L105
[cf-hd-localdev]: https://github.com/cloudflare/cloudflare-docs/blob/2bc06d2d4adc519aa445c6eb1cee3e69c3ced2d4/src/content/docs/hyperdrive/configuration/local-development.mdx#L16-L30
[cf-hd-local-env]: https://github.com/cloudflare/cloudflare-docs/blob/2bc06d2d4adc519aa445c6eb1cee3e69c3ced2d4/src/content/docs/hyperdrive/get-started.mdx#L345-L375
[wsdk-commit]: https://github.com/cloudflare/workers-sdk/tree/cafd3f94207bd2c886e6ab20de17e45e0eb50f1e
[wsdk-newconfig]: https://github.com/cloudflare/workers-sdk/blob/cafd3f94207bd2c886e6ab20de17e45e0eb50f1e/packages/vite-plugin-cloudflare/src/plugin-config.ts#L112-L191
[wsdk-autoconfig-ts]: https://github.com/cloudflare/workers-sdk/blob/cafd3f94207bd2c886e6ab20de17e45e0eb50f1e/packages/autoconfig/src/frameworks/tanstack.ts#L9-L38
[wsdk-frameworks]: https://github.com/cloudflare/workers-sdk/blob/cafd3f94207bd2c886e6ab20de17e45e0eb50f1e/packages/autoconfig/src/frameworks/all-frameworks.ts#L164-L177
[wsdk-vite-config]: https://github.com/cloudflare/workers-sdk/blob/cafd3f94207bd2c886e6ab20de17e45e0eb50f1e/packages/autoconfig/src/frameworks/utils/vite-config.ts#L160-L310
[wsdk-details]: https://github.com/cloudflare/workers-sdk/blob/cafd3f94207bd2c886e6ab20de17e45e0eb50f1e/packages/autoconfig/src/details/index.ts#L132-L169
[wsdk-detect]: https://github.com/cloudflare/workers-sdk/blob/cafd3f94207bd2c886e6ab20de17e45e0eb50f1e/packages/autoconfig/src/details/framework-detection.ts#L106-L123
[wsdk-run]: https://github.com/cloudflare/workers-sdk/blob/cafd3f94207bd2c886e6ab20de17e45e0eb50f1e/packages/autoconfig/src/run.ts#L367-L395
[wsdk-c3]: https://github.com/cloudflare/workers-sdk/blob/cafd3f94207bd2c886e6ab20de17e45e0eb50f1e/packages/create-cloudflare/templates/tanstack-start/c3.ts
[cfcli-commit]: https://github.com/cloudflare/cf/tree/3d94b501a6fee9ed4d9d9e6dec8ffd08acf4ec08
[cfcli-impls]: https://github.com/cloudflare/cf/blob/3d94b501a6fee9ed4d9d9e6dec8ffd08acf4ec08/packages/cli/src/commands/dev/known-impls.ts#L116-L143
[cfcli-build]: https://github.com/cloudflare/cf/blob/3d94b501a6fee9ed4d9d9e6dec8ffd08acf4ec08/packages/cli/src/commands/build/index.ts#L30-L104
[cfcli-deploy]: https://github.com/cloudflare/cf/blob/3d94b501a6fee9ed4d9d9e6dec8ffd08acf4ec08/packages/cli/src/commands/deploy/shared.ts#L97-L139
[cfcli-autoconfig]: https://github.com/cloudflare/cf/blob/3d94b501a6fee9ed4d9d9e6dec8ffd08acf4ec08/packages/cli/src/lib/autoconfig.ts#L106-L143
[cfcli-migration]: https://github.com/cloudflare/cf/blob/3d94b501a6fee9ed4d9d9e6dec8ffd08acf4ec08/packages/cli/src/lib/wrangler-migration.ts#L12-L16
[cfcli-changelog]: https://github.com/cloudflare/cf/blob/3d94b501a6fee9ed4d9d9e6dec8ffd08acf4ec08/packages/cli/CHANGELOG.md#L3-L33
[ba-commit]: https://github.com/better-auth/better-auth/tree/53307a7c60715298cf1b04f972f10b3fbbaa5b33
[ba-workers]: https://github.com/better-auth/better-auth/blob/53307a7c60715298cf1b04f972f10b3fbbaa5b33/docs/content/docs/integrations/hono.mdx#L59-L68
[ba-tanstack]: https://github.com/better-auth/better-auth/blob/53307a7c60715298cf1b04f972f10b3fbbaa5b33/docs/content/docs/integrations/tanstack.mdx#L51-L61
[dz-commit]: https://github.com/drizzle-team/drizzle-orm-docs/tree/236d7ea7aaa3178af732aabca5511bd639ae6a2f
[dz-neon]: https://github.com/drizzle-team/drizzle-orm-docs/blob/236d7ea7aaa3178af732aabca5511bd639ae6a2f/src/content/docs/pg/connect-neon.mdx#L20-L28
[vx-537]: https://github.com/cloudflare/vinext/issues/537
