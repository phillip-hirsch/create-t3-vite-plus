# Research: vinext as an alternative web app

Researched 2026-10-09. vinext ships a release most weeks, so every claim is pinned to a version or commit:

| Source                                     | Version / commit                                                                                                                                         | Date       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `cloudflare/vinext` (README, docs, source) | `vinext@1.1.0` tag, [`5747619`][vx-commit]. `main` was at `6a7c0c3` (2026-10-09); the README and docs used here don't differ in substance                | 2026-10-08 |
| npm packages read for experiments          | `vinext` 1.1.0, `@vinext/cloudflare` 1.1.0, `create-vinext-app` 1.0.0, `@cloudflare/vite-plugin` 2.0.0-beta.sha-91c870c02 (beta tag), `cf` 1.0.0-beta.13 | 2026-10-09 |
| Cloudflare docs                            | `cloudflare/cloudflare-docs` [`b43305a`][cf-commit]                                                                                                      | 2026-10-09 |
| better-auth docs                           | `better-auth/better-auth` [`53307a7`][ba-commit] (`main`, current release 1.7.7; this repo pins `1.4.0-beta.9`)                                          | 2026-10-09 |
| tRPC docs                                  | `trpc/trpc` [`d756e59`][trpc-commit]                                                                                                                     | 2026-10-04 |
| Drizzle docs                               | `drizzle-team/drizzle-orm-docs` [`236d7ea`][dz-commit]                                                                                                   | 2026-09-23 |
| Bingo docs                                 | `bingo-js/bingo` [`37ef4c1`][bingo-commit] (`bingo@0.13.2`; this repo pins `^0.9.3`)                                                                     | 2026-10-07 |
| Expo SDK 54                                | `expo/expo` branch `sdk-54` [`294f268`][expo-commit]                                                                                                     | 2026-10-09 |
| This repo                                  | `main` at `95b35ec` (Vite+ 1.1.0, `vite` → `@voidzero-dev/vite-plus-core@1.1.0`, React 19.1.4, TS 7.0.2)                                                 | 2026-10-09 |

"**Experiment Ex**" means a command I ran in `/tmp` (see [Experiments](#experiments)). Nothing in this repo was modified except this file.

---

## Summary

- **vinext is MIT-licensed, at 1.1.0, and says "Under active development."** 1.0.0 shipped 2026-09-28 and 1.1.0 on 2026-10-08, after 14 betas (beta.0 on 2026-07-04 to beta.13). The README warns that it is "not yet a drop-in replacement for every application or production workload" and answers "Can I use this in production?" with "You can, with caution" ([README L11–35][vx-readme-status], [L278–279][vx-readme-faq]; [releases][vx-releases]). One maintainer (`james-elicx`) has about 1,050 of its commits; the next has 214 (GitHub contributors API). 280 issues are open.
- **It covers what this repo needs from Next.js.** App Router route handlers (`route.ts`, named methods, auto OPTIONS/HEAD), middleware/`proxy.ts`, Server Actions and RSC are marked ✅. `next/image` and `next/font/*` are 🟡 (no build-time optimization) ([README L591–677][vx-readme-api]). Cache Components/PPR are incomplete ([README L30][vx-readme-status]).
- **It runs on this repo's Vite+ toolchain without changes to the alias.** vinext's peer is `vite ^8.0.0` ([package.json][vx-pkg]). vinext's own monorepo uses the same `vite: npm:@voidzero-dev/vite-plus-core@1.1.0` catalog alias and `vite-plus` 1.1.0 ([pnpm-workspace.yaml L99–101][vx-ws]), and vite-plus's e2e CI runs vinext's suite ([e2e-test.yml L317–332][vp-e2e-vinext]). In E2/E3/E6 `vp build` built vinext apps for Node, Nitro and Workers on vite-plus-core 1.1.0. `vp dev`/`vp build` drive it; vinext's own CLI is only needed for `vinext start` (Node prod server) and `vinext-cloudflare deploy` ([README L119–149][vx-readme-cli]).
- **The blocker is React.** vinext needs React `^19.2.6` ([README L1039][vx-readme-peers]). This repo's shared `react19` catalog pins 19.1.4 for the web app, `@acme/ui` and the Expo app (`pnpm-workspace.yaml:26-29`). Expo SDK 54 pins React 19.1.0 ([bundledNativeModules.json L97–99][expo-bnm]). If React is older, an App Router **build runs `<pm> add react@latest react-dom@latest` by itself** ([index.ts L2287–2300][vx-react-upgrade]; [react-version.ts L57–62][vx-react-version]). In E2a that rewrite was attempted inside `vp build` and only failed because of a pnpm release-age policy.
- **A vinext app can host the API the mobile app calls.** In E2 (Node), E6 (Nitro node preset) and E3 (Workers via local `vp preview`), `app/api/trpc/[trpc]/route.ts` with tRPC's fetch adapter and `app/api/auth/[...all]/route.ts` with `auth.handler` served `@acme/api` and `@acme/auth` unchanged: SSR page, `get-session`, tRPC query/batch/401, and better-auth's expo and oAuthProxy endpoints. A full Discord/Expo sign-in was **not** run (no database or OAuth app). vinext's own test suite has a better-auth fixture that covers sign-up, sign-in and session reads in dev ([ecosystem.test.ts L231–355][vx-ba-test]).
- **Deployment: Cloudflare Workers is the native target; Node and Nitro presets also work.** `@vinext/cloudflare deploy` uses the new `cf` CLI and `cloudflare.config.ts` by default, and `--legacy-wrangler-cloudflare-init` keeps Wrangler ([README L142–149][vx-readme-cli]). The default Cloudflare setup pins **plain `vite@8.3.0`**, a **beta** `@cloudflare/vite-plugin` 2.x, and `cf@latest` (itself `1.0.0-beta.13`) ([init.ts L299–327][vx-init-deps]; E1). E3 showed the beta plugin also builds and previews on the vite-plus-core alias.
- **`packages/db` cannot stay as-is on Workers.** `@vercel/postgres` is deprecated on npm. It wraps `@neondatabase/serverless` and in E3 rejected a non-Neon (non-pooled) URL inside workerd. Cloudflare says to create DB clients per request, not in global scope ([connection-lifecycle.mdx L71–105][cf-hd-lifecycle]). This repo exports one module-level `db` (`packages/db/src/client.ts:6-10`). Cloudflare documents Drizzle over Hyperdrive with `pg`, and says **Postgres.js over Hyperdrive "is not currently supported"** ([drizzle-orm.mdx L98–105][cf-hd-drizzle]). On Node/Nitro targets, nothing in `packages/db` has to change.
- **Monorepo fit is good, with three frictions.** Workspace TS source, `@tailwindcss/vite`, `@acme/ui`, `@t3-oss/env-core`, `tsc` (TS 7) and `vp lint` all worked (E2, E4). The frictions:
  1. `@acme/ui` components imported straight into a Server Component crashed **dev** SSR (`React.createContext is not a function`, from the `radix-ui` barrel), though the production build was fine. A `"use client"` re-export fixed it (E2f).
  2. On Workers, env vars must be declared bindings and supplied through `.dev.vars`/secrets. Shell env doesn't reach `process.env` (E3).
  3. Generated `.next/`, `.vinext/`, `.cloudflare/` directories aren't in this repo's `.gitignore`, so `vp lint` reported errors in them (E4).
- **Prior art: none for T3.** I found no T3/tRPC + vinext starter (GitHub search; no mention in `t3-oss/create-t3-turbo` or `create-t3-app`). The official starter `create-vinext-app` produces a single App Router app with Tailwind via **`@tailwindcss/postcss`**, not `@tailwindcss/vite` ([create-vinext-app index.ts L225–229, L412–433][vx-create]).
- **Generator: today's Bingo template only creates `packages/*` libraries.** `@acme/generator` produces a new `@acme/<name>` package via `vp create` (`packages/generator/src/template.ts:36-45`, `vite.config.ts:25-33`). Nothing scaffolds a whole project, so a "vinext or TanStack Start" choice needs a new template. Bingo supports that shape: Zod `options` (e.g. an enum), and `files` entries that are `false`/`undefined` are skipped ([bingo-fs.mdx L56–66][bingo-fs]; [create-template.mdx L199–236][bingo-options]).

---

## 1. What vinext is, and how mature

- **What it is.** "A Vite plugin that reimplements the public Next.js API — routing, server rendering, `next/*` module imports, the CLI." It is not a fork, and the core is written from scratch ([README L266–270][vx-readme-faq]). It targets **Next.js 16.x only** ([README L261, L296–297][vx-readme-why]). It does not need `next` installed: it ships fallback type declarations ([README L272–273][vx-readme-faq]). E4 typechecked with no `next` package present.
- **License.** MIT ([README L1059–1061][vx-readme-license]; GitHub license API).
- **Status, as the project states it.** The README banner says "**Under active development.** … not yet a drop-in replacement for every application or production workload. Expect compatibility gaps, especially in newer App Router features" ([README L11][vx-readme-status]). The FAQ says "You can [use it in production], with caution" ([README L278–279][vx-readme-faq]). It recommends OpenNext as "the safer, more proven option" ([README L254–255][vx-readme-why]). Humans review PRs, with heavy use of agent review ([README L287–288][vx-readme-faq]).
- **Versions and cadence** (npm `time`, GitHub releases):
  - 0.0.1 on 2026-02-24, then 0.0.x almost daily until 0.1.0 (2026-06-08)
  - 1.0.0-beta.0 on 2026-07-04 and beta.13 on 2026-09-27
  - **1.0.0 on 2026-09-28, 1.0.1 on 2026-10-01, 1.1.0 on 2026-10-08**
  - Packages version together: `vinext`, `@vinext/cloudflare`, `@vinext/types`, `@cloudflare/workers-response-store`, `create-vinext-app` (1.0.0) ([releases][vx-releases])
  - The 1.1.0 changelog is almost all App Router, cache and server bug fixes ([CHANGELOG L3–71][vx-changelog])
- **Maintainers.** Cloudflare org repo, created 2026-02-24. Top contributors: `james-elicx` (~1,047 commits), `NathanDrake2406` (214), `southpolesteve` (130), then a long tail (GitHub contributors API, 2026-10-09). The announcement blog post is titled "How we rebuilt Next.js with AI in one week" ([README L9][vx-readme-status]). That post is a secondary source and I didn't use it for any claim here.
- **Supported API surface** ([README L591–677][vx-readme-api]; "~94% of the Next.js 16 API surface has full or partial support"):

| Area                                                              | Status                                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| App Router, Pages Router                                          | ✅ both                                                                              |
| Route handlers (`route.ts`)                                       | ✅ "Named HTTP methods, auto OPTIONS/HEAD, cookie attachment"                        |
| Middleware                                                        | ✅ `middleware.ts` and `proxy.ts`, matcher patterns                                  |
| Server Actions, RSC, streaming SSR                                | ✅ (RSC via `@vitejs/plugin-rsc`)                                                    |
| ISR, `output: "export"`, `output: "standalone"`                   | ✅                                                                                   |
| `next/headers`, `next/navigation`, `next/server`, `next/link`     | ✅                                                                                   |
| `next/image`                                                      | 🟡 remote via `@unpic/react`, local via `<img>` + srcSet, no build-time resizing     |
| `next/font/google`, `next/font/local`                             | 🟡 runtime CDN / runtime `@font-face`, no self-hosting or subsetting                 |
| `"use cache"` / Cache Components / PPR                            | `"use cache"` ✅; full `cacheComponents` incomplete ([README L30][vx-readme-status]) |
| Route segment config                                              | 🟡 `runtime` doesn't choose placement; no `preferredRegion`                          |
| Vercel KV/Blob/**Postgres** bindings, `next/jest`, webpack config | Not supported, by design ([README L879–889][vx-readme-unsupported])                  |

- **Known gaps list** ([README L26–35][vx-readme-status]): Cache Components/PPR, build-time image/font optimization, native modules (`sharp`, `lightningcss`, …) in App Router **dev**, and platform-specific behaviour (`preferredRegion`, `runtime`).

## 2. Vite / Vite+ compatibility

- **Peers** (`vinext@1.1.0`, [package.json][vx-pkg]; npm registry):
  - `vite ^8.0.0`
  - `@vitejs/plugin-react ^5.1.4 || ^6.0.0` (this repo: 6.1.2)
  - `react`, `react-dom` and `react-server-dom-webpack` `^19.2.6` (this repo: **19.1.4**)
  - `@vitejs/plugin-rsc ^0.5.34` (optional, needed for App Router; its own peers are all `*`)
  - `@mdx-js/rollup` (optional)
  - Engines: `node >=22`. vinext "targets Vite 8" ([README L230][vx-readme-init]).
- **The `vite-plus-core` alias fits.** vinext's own workspace catalog sets `vite: npm:@voidzero-dev/vite-plus-core@1.1.0` and `vite-plus: 1.1.0`, the same pair as this repo ([vinext pnpm-workspace.yaml L99–101][vx-ws]; this repo `pnpm-workspace.yaml:22`). Its better-auth fixture config imports `defineConfig` from `vite-plus` ([vite.config.ts][vx-ba-vite]). The vite-plus repo's e2e workflow builds and tests vinext with `vp run build`, `vp check` and `vp test` ([e2e-test.yml L317–332][vp-e2e-vinext]). It skips vinext on Windows because of workerd native deps ([L468–471][vp-e2e-vinext-win]). In E2a, pnpm reported **no** `vite` peer problem, because of this repo's `peerDependencyRules.allowAny: [vite]` (`pnpm-workspace.yaml:50-52`).
- **Commands.** The README documents `vite dev`/`vite build`. `vinext dev`/`vinext build` are "thin aliases", and with Vite+ you deploy with `vp exec vinext-cloudflare deploy` ([README L94–132][vx-readme-cli]). vinext's own docs list `vp build` + `node dist/standalone/server.js` for standalone output ([other-platforms.mdx L15–29][vx-docs-other]). In E2/E3/E6, `vp dev`, `vp build` and `vp preview` all drove vinext. Two differences from the `vinext` aliases matter here:
  - Direct `vite`/`vp` commands don't preload `.env` before the config is evaluated ([README L704–716][vx-readme-env])
  - `vinext start` loads `.env*` from the **current directory** and does **not** set `NODE_ENV` ([cli.ts L161–184][vx-cli-start]). This repo keeps `.env` at the root and wraps scripts with `dotenv -e ../../.env`.
- **Plugins vinext brings or registers.**
  - It auto-registers `@vitejs/plugin-react`, and `@vitejs/plugin-rsc` when `app/` exists. Registering `rsc()` yourself fails the build ([README L433–436, L680][vx-readme-rsc]).
  - It sets SSR `noExternal: true` globally ([vx-ba-vite] comment; [index.ts L3494–3523][vx-noexternal]), so workspace packages are bundled.
  - Cloudflare adds `@cloudflare/vite-plugin`; other hosts add `nitro/vite`.
- **Cloudflare's default pin is not the alias.** `vinext init --platform=cloudflare` (and `create-vinext-app`) replaces `vite` with **`vite@8.3.0`** and installs `@cloudflare/vite-plugin@beta` + `cf@latest` ([init.ts L299–327][vx-init-deps]; E1 output: `"vite": "8.3.0"`, `"@cloudflare/vite-plugin": "2.0.0-beta.sha-805ec1ff3"`, `"cf": "1.0.0-beta.13"`). vinext's own docs app also overrides its `vite` back to plain `vite@8.3.0` via a `cloudflare-vite-v2` catalog ([pnpm-workspace.yaml L107–121][vx-ws-cf]). **The reason isn't documented**: the source has no comment, and I didn't find an issue or PR explaining it. E3 built and previewed with the beta plugin on vite-plus-core 1.1.0 without that pin. The beta's declared peer is `vite ^7.0.0 || ^8.0.0`; the stable v1 (`1.63.1`) peers `vite ^6.1 || ^7 || ^8` and `wrangler ^4.149.0` (npm registry, 2026-10-09).
- **React version enforcement.** If `react` resolves below 19.2.6, the App Router build's `onPrepare` hook runs the detected package manager with `add react@latest react-dom@latest`. It logs "Upgrading React for RSC compatibility…" and uses `execFileSync` with inherited stdio ([index.ts L2287–2300][vx-react-upgrade]; [react-version.ts L57–62][vx-react-version]). In this repo that would replace `catalog:react19` in the app's `package.json` during `vp build` (E2a, where the install was blocked by pnpm's `minimumReleaseAge`).

## 3. Deployment targets

- **Cloudflare Workers (native).** It is "the most complete deployment target": App Router server code runs in workerd, and bindings come from `import { env } from "cloudflare:workers"` ([cloudflare.mdx L15, L77–86][vx-docs-cf]; [README L307–391][vx-readme-cf]).
  - Setup is `vinext init --platform=cloudflare`. It writes `vite.config.ts` and `cloudflare.config.ts` (typed `cf/config`), and installs `cf` and Cloudflare Vite plugin v2 ([cloudflare.mdx L29–33][vx-docs-cf]).
  - Deploy with `@vinext/cloudflare deploy` / `vinext-cloudflare deploy`, which uses `cf`. Auth is `cf auth login` or `CLOUDFLARE_API_TOKEN` + `accountId` ([README L313–327][vx-readme-cf]).
  - **Wrangler** is legacy and opt-in (`--legacy-wrangler-cloudflare-init`). Existing Wrangler configs aren't migrated ([README L147–149][vx-readme-cli]).
  - The generated Worker uses `entrypoint: "vinext/server/fetch-handler"` and `compatibilityFlags: ["nodejs_compat"]` (E1).
  - Status of the pieces: `cf` is `1.0.0-beta.13` on npm's `latest` tag, and Cloudflare Vite plugin v2 exists only as `2.0.0-beta.sha-*` builds on the `beta` tag (npm registry, 2026-10-09). Both are prerelease.
- **Node.**
  - `output: "standalone"` emits `dist/standalone/server.js`, which binds `HOST` (not `HOSTNAME`) and `PORT` ([README L151–159][vx-readme-standalone]).
  - `vinext start` serves `dist/` locally (E2c).
- **Other hosts via Nitro.** Add `nitro()` from `nitro/vite`. Presets cover Vercel, Netlify, AWS Amplify, Deno Deploy, Node and others ([README L483–573][vx-readme-nitro]; [other-platforms.mdx L112–126][vx-docs-other]).
  - E6 built with this repo's pinned `nitro@3.0.260903-beta` and served `.output/server/index.mjs`, the same start command as `apps/tanstack-start/package.json:9`.
  - vinext's own examples use `nitro-nightly` ([pnpm-workspace.yaml L81][vx-ws-nitro]).
  - **Open Nitro issues, 2026-10-09:** CSS inlining ([#3762][vx-3762]), build-time prerendering doesn't run ([#3431][vx-3431]), split-chunk 500s ([#3478][vx-3478]), two React copies with styled-jsx ([#3746][vx-3746]), `public/` and middleware ordering ([#3690][vx-3690]). Native adapters beyond Cloudflare are "planned" ([#80][vx-80]).
- **Workers runtime constraints that touch this repo** (Cloudflare docs at [`b43305a`][cf-commit]):
  - **Size and CPU.** Worker size is 64 MiB uncompressed on Free and Paid, with "no compressed size limit". CPU time is 10 ms on Free and up to 5 min on Paid (default 30 s). Memory is 128 MB per isolate. Each invocation can have 6 outgoing connections waiting for headers at once ([limits.mdx L18–36, L259–265, L208–243][cf-limits]). E3's Worker bundle was 2.1 MB uncompressed (about 558 KiB gzip).
  - **`process.env`** is filled from text/JSON bindings (vars, secrets) only when `nodejs_compat` is on with the `nodejs_compat_populate_process_env` flag, which is the default from compatibility date 2025-04-01 ([nodejs-compat-populate-process-env.md L1–13][cf-process-env]). Shell env doesn't reach it. In E3, env validation failed until the secrets were declared as `bindings.secret()` in `cloudflare.config.ts`, values were given in `.dev.vars`, and the app was rebuilt. I didn't isolate which of those three changes was necessary. Cloudflare's docs say `vite build` copies `.dev.vars` into the output for `vite preview` ([secrets.mdx L13–23][cf-vp-secrets]).
  - **No I/O across requests.** "Create database clients inside your request handlers … not in the global scope. Workers do not allow I/O across requests" ([connection-lifecycle.mdx L71–105][cf-hd-lifecycle]). TCP to Postgres is allowed (via the `connect()` sockets API), but a new connection is needed per invocation, which is why Cloudflare recommends Hyperdrive ([connecting-to-databases.mdx L26–46][cf-connect-db]). vinext [#537][vx-537] (open) reports alternating failures from module-cached Drizzle/Postgres clients under vinext on Workers.
  - **Better Auth** "uses `AsyncLocalStorage`", so it needs `nodejs_compat` ([hono.mdx L59–68][ba-workers]).
- **TanStack Start can also target Workers.** The Cloudflare Vite plugin lists "Official support for TanStack Start" ([vite-plugin/index.mdx L20–34][cf-vp-index]). So Workers isn't something only vinext offers. I didn't test that path here.

## 4. The API role (tRPC, better-auth, CORS)

- **tRPC v11.** tRPC's fetch adapter targets WinterCG runtimes, including Cloudflare Workers ([fetch.mdx L11–17, L239–282][trpc-fetch]). Its Next.js App Router recipe is `app/api/trpc/[trpc]/route.ts` with `export { handler as GET, handler as POST }` ([nextjs.md L129–156][trpc-next]). E2/E3/E6 used exactly that with `@acme/api`'s `appRouter` and `createTRPCContext`, unchanged: `auth.getSession` → 200 `{"json":null}`, batching worked, and `auth.getSecretMessage` → 401.
  - **Side effect:** tRPC reads `globalThis.process.env.NODE_ENV` at runtime for `isDev` (`@trpc/server` 11.7.1 `initTRPC` source). That read isn't statically replaced, so under `vinext start` without `NODE_ENV=production`, and in the Workers preview, error responses included stacks. The repo's `timingMiddleware` (`packages/api/src/trpc.ts:85-89`) also added its dev-only 100–500 ms delay (E2c, E3). With `NODE_ENV=production` on the Nitro output, no stack was returned (E6).
- **better-auth.** better-auth's Next.js guide mounts `toNextJsHandler(auth)` at `app/api/auth/[...all]/route.ts`, plus the `nextCookies()` plugin for server actions ([next.mdx L12–22, L99–107][ba-next]). vinext's test suite runs that setup and checks the endpoints in dev:
  - `GET /api/auth/get-session`
  - email sign-up and sign-in
  - session via `headers()` in a Server Component ([ecosystem.test.ts L231–355][vx-ba-test]; [route.ts][vx-ba-route])

  In E2/E3 the repo's `initAuth()` (drizzle adapter, `oAuthProxy`, `expo()`, `trustedOrigins: ["expo://"]`, `packages/auth/src/index.ts:20-46`) was mounted through `auth.handler`. With `nextCookies()` in place of `reactStartCookies()`, these responded:
  - `/api/auth/ok` → 200
  - `/api/auth/get-session` → 200
  - `/api/auth/expo-authorization-proxy` → 400 (missing params; the route exists)
  - `/api/auth/oauth-proxy-callback` → 302 to better-auth's error page
  - `POST /api/auth/sign-in/social` reached the database layer and failed on the fake connection string

  **Not verified:** a full Discord OAuth round trip, the Expo deep-link return, and the cross-origin `oAuthProxy` flow end to end.

- **Known better-auth issue under vinext + Cloudflare dev:** [#2813][vx-2813] (open). The first request to a Better Auth route triggers repeated RSC dependency re-optimization in `vite dev` with `@cloudflare/vite-plugin` and then hangs or returns 500. The reporter's workaround prebundles Better Auth entries via `environments.rsc.optimizeDeps.include`. I didn't reproduce it: E3 tested `vp preview`, not `vp dev`, on Workers.
- **Expo.** better-auth's Expo docs require the app scheme in `trustedOrigins`. `disableOriginOverride` exists "if you're facing cors origin issues with Expo API routes" ([expo.mdx L130–192, L585][ba-expo]). Nothing in that setup depends on the host framework.
- **CORS.** This repo has **no CORS handling today** (`git grep -i cors` over `apps/` and `packages/` finds nothing). React Native's `fetch` isn't subject to browser CORS. vinext route handlers answered `OPTIONS` with `204` and `allow: GET, HEAD, OPTIONS, POST` but no `Access-Control-*` headers (E2c), the auto-OPTIONS behaviour the README documents ([README L637][vx-readme-api]). Cross-origin browser clients (e.g. Expo web) would need headers added in the handler or middleware. The same is true of the TanStack Start app today.

## 5. Data layer on Workers

- **Today:** `packages/db/src/client.ts:1-10` builds one module-level `db` from `drizzle-orm/vercel-postgres` + `@vercel/postgres`'s `sql`. `@acme/api` (`packages/api/src/trpc.ts:14`) and `@acme/auth` (`packages/auth/src/index.ts:7,21`) import it at module scope. `drizzle.config.ts:7` rewrites `:6543` to `:5432` for drizzle-kit.
- **`@vercel/postgres` status.** npm marks it deprecated: "If you had an existing Vercel Postgres database, it should have been migrated to Neon … guide to migrate to Neon's SDKs" (registry `deprecated` field, read 2026-10-09). 0.10.0 depends on `@neondatabase/serverless ^0.9.3` and `ws` (npm registry). Drizzle still documents `drizzle-orm/vercel-postgres` ([connect-vercel-postgres.mdx L19–26][dz-vercel]). vinext lists "Vercel KV/Blob/Postgres bindings" as unsupported "Vercel-specific features" ([README L883][vx-readme-unsupported]). That likely refers to Vercel platform integration, not the npm driver (inference).
- **On workerd (E3)** the driver bundled and ran. It then threw `VercelPostgresError - 'invalid_connection_string': This connection string is meant to be used with a direct connection. Make sure to use a pooled connection string`. I had no Neon database, so a live query on Workers is **unverified**. Separately, its module-level pool conflicts with Cloudflare's per-request rule ([connection-lifecycle.mdx L71–105][cf-hd-lifecycle]).
- **Documented alternatives:**

| Option                            | Source                                                                                                                                                                                                                                                                                                                       | What changes in `packages/db`                                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Neon serverless driver            | Drizzle `neon-http` (fast for single non-interactive queries) and `neon-serverless`/WebSockets (sessions, interactive transactions); Drizzle links a Cloudflare Worker example ([connect-neon.mdx L20–29][dz-neon]); Cloudflare lists `@neondatabase/serverless` for Neon ([connecting-to-databases.mdx L61][cf-connect-db]) | Driver import and client construction; schema stays `pg-core`; Postgres must be Neon (or behind a Neon-compatible proxy)   |
| Hyperdrive + `pg` (node-postgres) | Cloudflare's Drizzle guide creates `new Client({ connectionString: env.HYPERDRIVE.connectionString })` inside `fetch` ([drizzle-orm.mdx L66–100][cf-hd-drizzle])                                                                                                                                                             | Driver (`drizzle-orm/node-postgres` + `pg`), per-request client, a Hyperdrive binding; works with any Postgres host        |
| Hyperdrive + Postgres.js          | "Pairing Drizzle ORM with the Postgres.js driver over Hyperdrive is **not currently supported**" ([drizzle-orm.mdx L104][cf-hd-drizzle])                                                                                                                                                                                     | Not a documented option                                                                                                    |
| D1                                | Drizzle's D1 driver ([connect-cloudflare-d1.mdx][dz-d1]); better-auth documents D1 with programmatic migrations, because its CLI can't reach D1 ([database.mdx L51–121][ba-d1])                                                                                                                                              | SQLite dialect: schema moves from `pg-core` to `sqlite-core`, better-auth adapter `provider: "sqlite"`, new migration path |

- **What changes regardless of driver, on Workers:** `db` can no longer be a module-level singleton that `@acme/api` and `@acme/auth` import. A per-request client has to reach `createTRPCContext` and `betterAuth({ database })` somehow. vinext has no documented per-request store; PR [#607][vx-607] proposing `getRequestStore()` is referenced from [#537][vx-537], status not checked. **None of this applies to the Node/Nitro targets**, where E2/E6 ran the existing `packages/db` unchanged.

## 6. Monorepo fit

Evidence comes from E2–E6 on a copy of this repo, unless cited otherwise.

- **Workspace TS source.** `@acme/api`, `@acme/auth`, `@acme/db` and `@acme/ui` resolved from `src/*.ts` with no `transpilePackages`. vinext bundles server deps (`noExternal: true`) ([index.ts L3494–3523][vx-noexternal]).
  - Related issues, both from the [#3723][vx-3723] / [#848][vx-848] area: modules outside the Vite root lost `next/dynamic` preload metadata (closed 2026-10-06), and App Router SSR can hit "Invalid hook call" when vinext's runtime resolves a different React copy than the app (**open**). E2 hit neither, but #848 matters if Expo's and the web app's React versions diverge.
- **`@acme/ui` and RSC.** Importing `@acme/ui/button`, which pulls `Slot` from the `radix-ui` barrel without `"use client"`, into a Server Component:
  - **production build:** rendered fine (E2c)
  - **`vp dev`:** returned 500 `React.createContext is not a function` from `@radix-ui/react-direction` on every request (E2e)
  - A two-line `"use client"; export { Button } from "@acme/ui/button";` wrapper fixed dev (E2f).

  I didn't establish why dev and build differ. vinext lists `radix-ui` in its default `optimizePackageImports` set ([README L674][vx-readme-api]), which may apply only in the build. TanStack Start has no RSC, so `@acme/ui` never needed client boundaries.

- **Tailwind v4.** `@tailwindcss/vite` with `@import "@acme/tailwind-config/theme"` and `@source "../../../packages/ui/src/*"` produced the theme classes (29 KB CSS, served in E2c/E6). `create-vinext-app` uses `@tailwindcss/postcss` instead ([index.ts L225–229][vx-create]). vinext's own issues mention Tailwind v4 + MDX init failures ([#3240][vx-3240], open), which don't apply without MDX.
- **Env validation.** `@t3-oss/env-core` with `extends: [authEnv()]` worked unchanged on Node.
  - On Workers, `packages/auth/env.ts:7-8` evaluates `isSelfHostedProduction` as true: `NODE_ENV` is inlined as `"production"` and there's no `VERCEL_ENV`. So `AUTH_REDIRECT_PROXY_URL` becomes required, as it is for self-hosted Node (E3).
  - Client-exposed vars: vinext inlines `NEXT_PUBLIC_*`; `VITE_*` + `import.meta.env` stays available ([README L733–737][vx-readme-env]). The TanStack app uses `clientPrefix: "VITE_"` (`apps/tanstack-start/src/env.ts:8`).
  - `@t3-oss/env-nextjs` (0.13.11) exists but wasn't tested.
- **Typecheck/lint.**
  - `tsc --noEmit` (TS 7.0.2) passed on both apps with `types: ["vinext/types", "node"]` and no `next` package (E4).
  - `vp lint` on sources passed. Without ignores it linted generated `.cloudflare/output/**` and `.next/types/routes.d.ts` and reported errors. This repo's `.gitignore` has `dist/`, `.nitro/` and `.output/` but not `.next/`, `.vinext/` or `.cloudflare/` (`.gitignore:12-13,43`).
  - `vp check`, the cached `typecheck` task and `vp run build` caching were not exercised.
- **pnpm workspace changes the experiments needed:**
  - React catalog → `^19.2.6` (E2b)
  - `allowBuilds: { workerd: true }` for the Cloudflare variant: without it pnpm 12 failed with `ERR_PNPM_IGNORED_BUILDS` (E3). vinext's open [#3198][vx-3198] reports the same for `create-vinext-app` on pnpm 12.
  - vinext 1.1.0 and its Cloudflare deps were younger than the local 1440-minute `minimumReleaseAge`; this is time-dependent.
- **Root config coupling to the current web app.** These files name `apps/tanstack-start` or `@acme/tanstack-start` directly, so they would need to change if the web app could be something else:
  - the root `dev` script (`package.json:15`)
  - Oxfmt's Tailwind stylesheet (`vite.config.ts:42`)
  - the `restrictEnvAccess` lint override (`vite.config.ts:255`)
  - the glossary's definition of **Web app** (`GLOSSARY.md`)

## 7. Prior art and relevant issues

- **Official examples** at `vinext@1.1.0`:
  - `examples/`: `app-router-cloudflare`, `app-router-nitro`, `pages-router-cloudflare`, `realworld-api-rest`, `hackernews`, `nextra-docs-template`, `fumadocs-docs-template` and others
  - live deployments listed in [README L575–589][vx-readme-examples]
  - `create-vinext-app`: single-app starter ([README L197–207][vx-readme-create])
  - [`examples/app-router-nitro`][vx-nitro-example] uses `vp dev`/`vp build`
- **T3-style prior art:** none found. GitHub repo search for "vinext trpc" / "t3 vinext" returned nothing. `t3-oss/create-t3-turbo` and `t3-oss/create-t3-app` have no issues, PRs or code mentioning vinext (searched 2026-10-09). Code search turned up `replicate/getting-started-vinext` and `liuhuapiaoyuan/vinext-shadcn-starter`, neither with tRPC or better-auth; I didn't review them.
- **Issues relevant to §2–6** (state on 2026-10-09):

| Issue                                                                                                 | State  | Relevance                                         |
| ----------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------- |
| [#2813][vx-2813] Better Auth route hangs/500 in Cloudflare dev (RSC dep re-optimization)              | open   | better-auth on Workers dev                        |
| [#537][vx-537] alternating failures, Drizzle + Postgres lazily created on Workers                     | open   | `packages/db` on Workers                          |
| [#848][vx-848] invalid hook call when runtime resolves a different React                              | open   | two React versions in one workspace (web vs Expo) |
| [#3485][vx-3485] react/react-dom hard-coded SSR externals                                             | open   | single-binary builds only                         |
| [#3746][vx-3746], [#3478][vx-3478], [#3431][vx-3431], [#3762][vx-3762], [#3690][vx-3690] Nitro builds | open   | Nitro deploy path                                 |
| [#3198][vx-3198] `create-vinext-app` + pnpm 12 `ERR_PNPM_IGNORED_BUILDS`                              | open   | pnpm 12 + workerd (seen in E1/E3)                 |
| [#3723][vx-3723] module IDs outside the Vite root dropped (monorepos)                                 | closed | fixed 2026-10-06, before 1.1.0                    |
| [#1044][vx-1044] Hyperdrive not working                                                               | closed | maintainer couldn't reproduce; no fix             |
| [#80][vx-80] pluggable deployment adapters                                                            | open   | non-Cloudflare targets go through Nitro today     |

## 8. Generator implications (light touch)

- **What exists.** `@acme/generator` is a Bingo template ("Generate a new @acme package") with `options: { name, deps }`. Its `produce()` returns a `files` tree and a `vp add`/`vp install` script (`packages/generator/src/template.ts:36-105`). It's registered as the `package` template in the root `vite.config.ts` `create.templates` (`vite.config.ts:25-33`) and run by `vp create` (`packages/generator/bin/index.ts:11-14`). **It only adds packages**: nothing in the repo scaffolds a whole project or chooses between apps. Vite+ supports org-wide `@org/create` template manifests ([create.md L198–343][vp-create-gen]).
- **How Bingo expresses a choice** (docs at `bingo@0.13.2`; the repo pins `^0.9.3`, and the `bingo-fs@0.5.7` types installed here match the "ignored" semantics below):
  - **Options are Zod schemas**, with `.default()` shown as suggested values in the CLI ([create-template.mdx L199–236][bingo-options]). A choice would be something like `z.enum(["tanstack-start", "vinext"])`.
  - **`prepare()`** fills in options the user didn't provide ([create-template.mdx L263–292][bingo-prepare]).
  - **Conditional output:** in a `files` tree, "`false` or `undefined`: Ignored" ([bingo-fs.mdx L56–66][bingo-fs]). Installed types: `CreatedEntry = CreatedDirectory | CreatedFileEntry | false`, and directory values may be `undefined` (`bingo-fs/lib/types.d.ts:4-10`). So `apps: { "tanstack-start": web === "tanstack-start" && {...}, vinext: web === "vinext" && {...} }` is how the docs suggest doing it.
  - **`setup`/`transition`** are separate producers for new and existing repositories ([create-template.mdx L369–400][bingo-setup]).
- **What a choice would have to vary, from §2–6 rather than from Bingo:** the React catalog (or a second catalog), `pnpm-workspace.yaml` `allowBuilds`, `.gitignore`, the root `dev` script and Oxfmt stylesheet, the lint override paths, `packages/db` (only if Workers), and possibly `@acme/ui` client boundaries.

---

## Open questions for the design interview

1. **Is vinext's maturity acceptable for a starter?** It has been 1.x for 11 days, says "under active development", is mostly maintained by one person, and has 280 open issues, against TanStack Start already in place. Should the vinext option be labelled experimental?
2. **React version.** vinext needs `^19.2.6`, and its build auto-runs `add react@latest` when React is older. Expo SDK 54 pins React 19.1.0. Options: bump the shared `react19` catalog (Expo then runs off its pinned React, untested here); split catalogs per app (two React copies in one workspace, which is [#848][vx-848] territory); or wait for an Expo SDK on React ≥19.2.6. Who owns that pairing?
3. **Deployment target for the vinext option.** Node/Nitro (same `node .output/server/index.mjs` story as today, `packages/db` unchanged) or Cloudflare Workers (vinext's native path, prerelease `cf` + Vite plugin v2, a data-layer rewrite)? Or both? If Workers is the goal, should TanStack Start also get a Workers target, since Cloudflare's plugin supports it?
4. **`cf` vs Wrangler** for the Cloudflare path. vinext defaults to the beta `cf`; Wrangler is the legacy opt-in.
5. **Vite pin on Cloudflare.** Keep the repo-wide `vite-plus-core` alias, which E3 built and previewed with, or follow vinext's own `vite@8.3.0` override for the Cloudflare plugin v2, whose reason is undocumented?
6. **Data layer** (Workers only). Neon serverless driver, Hyperdrive + `pg`, or D1, given that `@vercel/postgres` is deprecated and Postgres.js over Hyperdrive is unsupported? How does a per-request client reach `createTRPCContext` and `betterAuth({ database })` without a vinext request store?
7. **App Router or Pages Router**, and how much RSC to use. RSC means `@acme/ui` needs client boundaries (E2f). The API role works the same either way.
8. **Env and auth on Workers.** `isSelfHostedProduction` treats Workers as self-hosted, so `AUTH_REDIRECT_PROXY_URL` is required. Is that intended? Should the app's env use `NEXT_PUBLIC_*` (vinext's convention) or `VITE_*` (the repo's)? Should `NODE_ENV=production` be set explicitly at runtime (tRPC dev mode leaked otherwise)?
9. **Generator scope.** The choice needs a project-level (or app-level) template that doesn't exist yet. Extend `vp create` with an app template, build a whole-repo Bingo template, or ship both apps and let the generator delete one? How should the root config that names `apps/tanstack-start` adapt?
10. **Glossary.** **Web app** is defined as "The TanStack Start app". Does it become "the web app, TanStack Start or vinext"?
11. **Untested and worth testing before committing:** a full Discord + Expo sign-in through vinext, `vp dev` on Workers with better-auth ([#2813][vx-2813]), a live Neon/Hyperdrive query from workerd, and `vp run build` task caching for vinext's output directories.

---

## Experiments

All runs on macOS, Node 24.21.0, pnpm 12.10.1, global `vp` 1.1.0, on 2026-10-09. Each download went into its own new directory under `/tmp/vinext-research/`. No Cloudflare login, no deploys, no external resources were created. Long-running servers were bound to localhost ports and killed afterwards.

- **E1** `pnpm dlx create-vinext-app@1.0.0 app --platform=cloudflare --use-pnpm --yes --disable-git --data-cache=none --cdn-cache=none --image-optimization=none --no-prerender --no-warm-cache` in an empty dir.
  - Result: scaffold written. Install stopped at `ERR_PNPM_IGNORED_BUILDS` (workerd).
  - Generated `package.json`: `vinext ^1.0.1`, `@vinext/cloudflare ^1.0.1`, `vite 8.3.0`, `@cloudflare/vite-plugin 2.0.0-beta.sha-805ec1ff3`, `cf 1.0.0-beta.13`, `@tailwindcss/postcss`; scripts `vite dev`/`vite build`/`vite preview`/`vinext-cloudflare deploy`.
  - Generated `cloudflare.config.ts`: `entrypoint: "vinext/server/fetch-handler"`, `nodejs_compat`. `.gitignore` gets `/dist/`, `.vinext/`, `.cloudflare/`.
  - It resolved vinext 1.0.1, not 1.1.0, probably because of the local release-age policy (inference).
- **E2** `git clone` of this repo (`95b35ec`) into `/tmp`. Added `apps/vinext` with:
  - `vinext@1.1.0`, `@vitejs/plugin-rsc@0.5.36`, `react-server-dom-webpack@19.3.0`
  - `vite.config.ts` = `vite-plus` `defineConfig` + `vinext()` + `@tailwindcss/vite`
  - `app/api/trpc/[trpc]/route.ts`, `app/api/auth/[...all]/route.ts`, `src/auth/server.ts` (`initAuth` + `nextCookies()`), `src/env.ts` (`env-core` + `authEnv()`), a Server Component page calling `auth.api.getSession({ headers: await headers() })`, and `@acme/ui` `Button`

  Then `pnpm install --config.minimum-release-age=0`:
  - **E2a** React 19.1.4 → `pnpm peers check`: unmet `react`/`react-dom` peers (`^19.2.6` vinext, `^19.3.0` RSDW); no `vite` peer issue. `vp build` → exit 1: vinext ran `pnpm add react@latest react-dom@latest`, which failed on `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`.
  - **E2b** `react19` catalog → 19.3.0. `SKIP_ENV_VALIDATION=1 vp build` → exit 0, 5 environments, routes `ƒ /`, `λ /api/auth/:all+`, `λ /api/trpc/:trpc`.
  - **E2c** `vinext start` (port 3456) with dummy env:
    - `/` 200 (title, "signed out", Tailwind CSS link)
    - `/api/auth/get-session` 200 `null`
    - `/api/trpc/auth.getSession` 200, batch 200, `auth.getSecretMessage` 401 (with stack, `NODE_ENV` unset)
    - `OPTIONS` 204 with `allow`, no CORS headers
  - **E2d** `/api/auth/expo-authorization-proxy` 400, `/api/auth/oauth-proxy-callback` 302 to `/api/auth/error?error=OAuthProxy - Invalid cookies or secret`, `/api/auth/ok` 200, `POST /api/auth/sign-in/social` 500 (`invalid_connection_string` from the DB layer).
  - **E2e** `vp dev`: API routes 200. `/` 500 on every request, `React.createContext is not a function` at `@radix-ui/react-direction`.
  - **E2f** Re-exporting `Button` from a `"use client"` module: `/` 200 in dev.

- **E3** `apps/vinext-cf`: E2's app plus `@vinext/cloudflare@1.1.0`, `@cloudflare/vite-plugin@2.0.0-beta.sha-91c870c02`, `cf@1.0.0-beta.13` and a `cloudflare.config.ts`, still on the vite-plus-core alias.
  - Install failed with `ERR_PNPM_IGNORED_BUILDS` until `allowBuilds.workerd: true` was added.
  - `vp build` → exit 0. Output in `.cloudflare/output/v0/workers/default/`, bundle 2.1 MB (558 KiB gzip). It printed an unrelated "failed to connect to the docker API" line.
  - `vp preview`:
    - First runs: all routes 500 `Invalid environment variables`, because shell env and `CLOUDFLARE_INCLUDE_PROCESS_ENV=true` didn't reach the worker.
    - After declaring the five vars as `bindings.secret()`, writing `.dev.vars` and rebuilding: `/` 200, `get-session` 200, tRPC 200/401, social sign-in 500 `VercelPostgresError … invalid_connection_string … use a pooled connection string`.
    - Two of the "500" runs actually hit a stale preview server still bound to the port; they were discarded and re-run on fresh ports.
- **E4** E2 copy: `apps/vinext/node_modules/.bin/tsc --noEmit -p .` and the same for `apps/vinext-cf` → exit 0 for both. `vp lint apps/vinext apps/vinext-cf` → errors only in generated `.cloudflare/output/**` and `.next/types/routes.d.ts`; with `--ignore-pattern` for `.cloudflare`, `dist` and `.next`, no diagnostics. `pnpm exec` was avoided because it re-verifies the lockfile against the release-age policy.
- **E5** E2 copy with React 19.3.0: `vp build` in `apps/tanstack-start` → exit 0 (Nitro `.output`). Runtime not tested; the Expo app was not run.
- **E6** `apps/vinext` with `nitro()` from `nitro@3.0.260903-beta` (this repo's pin): `NITRO_PRESET=node vp build` → exit 0. `NODE_ENV=production node .output/server/index.mjs`: `/` 200 with CSS 200, `get-session` 200, tRPC 200, protected 401 with no stack.

---

<!-- Reference links -->

[vx-commit]: https://github.com/cloudflare/vinext/tree/5747619f7c4aa0b0a3a58617d7b22170622d5804
[vx-releases]: https://github.com/cloudflare/vinext/releases
[vx-readme-status]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/README.md#L9-L35
[vx-readme-cli]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/README.md#L94-L149
[vx-readme-standalone]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/README.md#L151-L159
[vx-readme-create]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/README.md#L197-L207
[vx-readme-init]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/README.md#L209-L242
[vx-readme-why]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/README.md#L244-L262
[vx-readme-faq]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/README.md#L264-L303
[vx-readme-cf]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/README.md#L305-L391
[vx-readme-rsc]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/README.md#L414-L436
[vx-readme-nitro]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/README.md#L483-L573
[vx-readme-examples]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/README.md#L575-L589
[vx-readme-api]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/README.md#L591-L677
[vx-readme-env]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/README.md#L704-L741
[vx-readme-unsupported]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/README.md#L879-L889
[vx-readme-peers]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/README.md#L1039
[vx-readme-license]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/README.md#L1059-L1061
[vx-pkg]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/packages/vinext/package.json
[vx-ws]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/pnpm-workspace.yaml#L99-L101
[vx-ws-nitro]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/pnpm-workspace.yaml#L81
[vx-ws-cf]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/pnpm-workspace.yaml#L107-L121
[vx-init-deps]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/packages/vinext/src/init.ts#L299-L327
[vx-react-upgrade]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/packages/vinext/src/index.ts#L2287-L2300
[vx-react-version]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/packages/vinext/src/utils/react-version.ts#L57-L62
[vx-noexternal]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/packages/vinext/src/index.ts#L3494-L3523
[vx-cli-start]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/packages/vinext/src/cli.ts#L161-L184
[vx-create]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/packages/create-vinext-app/src/index.ts#L225-L433
[vx-changelog]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/packages/vinext/CHANGELOG.md#L3-L71
[vx-ba-test]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/tests/ecosystem.test.ts#L231-L355
[vx-ba-route]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/tests/fixtures/ecosystem/better-auth/app/api/auth/%5B...all%5D/route.ts
[vx-ba-vite]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/tests/fixtures/ecosystem/better-auth/vite.config.ts
[vx-nitro-example]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/examples/app-router-nitro/vite.config.ts
[vx-docs-cf]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/docs/deploying/cloudflare.mdx#L15-L86
[vx-docs-other]: https://github.com/cloudflare/vinext/blob/5747619f7c4aa0b0a3a58617d7b22170622d5804/docs/deploying/other-platforms.mdx#L15-L126
[vx-80]: https://github.com/cloudflare/vinext/issues/80
[vx-537]: https://github.com/cloudflare/vinext/issues/537
[vx-607]: https://github.com/cloudflare/vinext/pull/607
[vx-848]: https://github.com/cloudflare/vinext/issues/848
[vx-1044]: https://github.com/cloudflare/vinext/issues/1044
[vx-2813]: https://github.com/cloudflare/vinext/issues/2813
[vx-3198]: https://github.com/cloudflare/vinext/issues/3198
[vx-3240]: https://github.com/cloudflare/vinext/issues/3240
[vx-3431]: https://github.com/cloudflare/vinext/issues/3431
[vx-3478]: https://github.com/cloudflare/vinext/issues/3478
[vx-3485]: https://github.com/cloudflare/vinext/issues/3485
[vx-3690]: https://github.com/cloudflare/vinext/issues/3690
[vx-3723]: https://github.com/cloudflare/vinext/issues/3723
[vx-3746]: https://github.com/cloudflare/vinext/issues/3746
[vx-3762]: https://github.com/cloudflare/vinext/issues/3762
[vp-e2e-vinext]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/.github/workflows/e2e-test.yml#L317-L332
[vp-e2e-vinext-win]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/.github/workflows/e2e-test.yml#L468-L471
[vp-create-gen]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/guide/create.md#L198-L343
[cf-commit]: https://github.com/cloudflare/cloudflare-docs/tree/b43305addf654fb8ca61f15d4b279bc6ce6389c2
[cf-limits]: https://github.com/cloudflare/cloudflare-docs/blob/b43305addf654fb8ca61f15d4b279bc6ce6389c2/src/content/docs/workers/platform/limits.mdx#L18-L36
[cf-process-env]: https://github.com/cloudflare/cloudflare-docs/blob/b43305addf654fb8ca61f15d4b279bc6ce6389c2/src/content/compatibility-flags/nodejs-compat-populate-process-env.md#L1-L13
[cf-connect-db]: https://github.com/cloudflare/cloudflare-docs/blob/b43305addf654fb8ca61f15d4b279bc6ce6389c2/src/content/docs/workers/databases/connecting-to-databases.mdx#L12-L64
[cf-hd-lifecycle]: https://github.com/cloudflare/cloudflare-docs/blob/b43305addf654fb8ca61f15d4b279bc6ce6389c2/src/content/docs/hyperdrive/concepts/connection-lifecycle.mdx#L71-L105
[cf-hd-drizzle]: https://github.com/cloudflare/cloudflare-docs/blob/b43305addf654fb8ca61f15d4b279bc6ce6389c2/src/content/docs/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/drizzle-orm.mdx#L66-L105
[cf-vp-secrets]: https://github.com/cloudflare/cloudflare-docs/blob/b43305addf654fb8ca61f15d4b279bc6ce6389c2/src/content/docs/workers/vite-plugin/reference/secrets.mdx#L13-L23
[cf-vp-index]: https://github.com/cloudflare/cloudflare-docs/blob/b43305addf654fb8ca61f15d4b279bc6ce6389c2/src/content/docs/workers/vite-plugin/index.mdx#L20-L34
[ba-commit]: https://github.com/better-auth/better-auth/tree/53307a7c60715298cf1b04f972f10b3fbbaa5b33
[ba-next]: https://github.com/better-auth/better-auth/blob/53307a7c60715298cf1b04f972f10b3fbbaa5b33/docs/content/docs/integrations/next.mdx#L12-L107
[ba-expo]: https://github.com/better-auth/better-auth/blob/53307a7c60715298cf1b04f972f10b3fbbaa5b33/docs/content/docs/integrations/expo.mdx#L130-L192
[ba-workers]: https://github.com/better-auth/better-auth/blob/53307a7c60715298cf1b04f972f10b3fbbaa5b33/docs/content/docs/integrations/hono.mdx#L59-L68
[ba-d1]: https://github.com/better-auth/better-auth/blob/53307a7c60715298cf1b04f972f10b3fbbaa5b33/docs/content/docs/concepts/database.mdx#L51-L121
[trpc-commit]: https://github.com/trpc/trpc/tree/d756e591a5e37ef20b8d75ecd4d736c195497289
[trpc-fetch]: https://github.com/trpc/trpc/blob/d756e591a5e37ef20b8d75ecd4d736c195497289/www/docs/server/adapters/fetch.mdx#L11-L282
[trpc-next]: https://github.com/trpc/trpc/blob/d756e591a5e37ef20b8d75ecd4d736c195497289/www/docs/server/adapters/nextjs.md#L129-L156
[dz-commit]: https://github.com/drizzle-team/drizzle-orm-docs/tree/236d7ea7aaa3178af732aabca5511bd639ae6a2f
[dz-vercel]: https://github.com/drizzle-team/drizzle-orm-docs/blob/236d7ea7aaa3178af732aabca5511bd639ae6a2f/src/content/docs/pg/connect-vercel-postgres.mdx#L19-L26
[dz-neon]: https://github.com/drizzle-team/drizzle-orm-docs/blob/236d7ea7aaa3178af732aabca5511bd639ae6a2f/src/content/docs/pg/connect-neon.mdx#L20-L29
[dz-d1]: https://github.com/drizzle-team/drizzle-orm-docs/blob/236d7ea7aaa3178af732aabca5511bd639ae6a2f/src/content/docs/sqlite/connect-cloudflare-d1.mdx
[bingo-commit]: https://github.com/bingo-js/bingo/tree/37ef4c1760b5cba894cc8371a133a389eafc79ed
[bingo-fs]: https://github.com/bingo-js/bingo/blob/37ef4c1760b5cba894cc8371a133a389eafc79ed/packages/site/src/content/docs/build/packages/bingo-fs.mdx#L56-L66
[bingo-options]: https://github.com/bingo-js/bingo/blob/37ef4c1760b5cba894cc8371a133a389eafc79ed/packages/site/src/content/docs/build/apis/create-template.mdx#L199-L236
[bingo-prepare]: https://github.com/bingo-js/bingo/blob/37ef4c1760b5cba894cc8371a133a389eafc79ed/packages/site/src/content/docs/build/apis/create-template.mdx#L263-L292
[bingo-setup]: https://github.com/bingo-js/bingo/blob/37ef4c1760b5cba894cc8371a133a389eafc79ed/packages/site/src/content/docs/build/apis/create-template.mdx#L369-L400
[expo-commit]: https://github.com/expo/expo/tree/294f268682bf741e740c0cbb53c856a9a28d65f9
[expo-bnm]: https://github.com/expo/expo/blob/294f268682bf741e740c0cbb53c856a9a28d65f9/packages/expo/bundledNativeModules.json#L97-L99
