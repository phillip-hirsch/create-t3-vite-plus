# Research: migrating this monorepo from Turborepo/ESLint/Prettier to Vite+ (`vp`)

Researched 2026-10-07. Vite+ releases often, so every claim is pinned to a version or commit:

| Source                                              | Version / commit                                                                                                                          | Date       |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `vite-plus` (CLI + docs source)                     | v1.1.0 release; docs read at `main` [`b5efee3`][vp-commit] (docs diff vs. the `v1.1.0` tag is limited to migrate/troubleshooting wording) | 2026-10-07 |
| `vite-task` (the `vp run` engine)                   | rev [`7d69d65`][vt-commit], the rev compiled into vp 1.1.0 (`vp toolchain --global` prints `compiles vite-task … revision 7d69d65…`)      | 2026-09-24 |
| Bundled tools in vp 1.1.0 (`vp toolchain --global`) | vite 8.3.3, rolldown 1.2.12, tsdown 0.23.0, vitest 5.0.3, oxlint 1.87.0, oxlint-tsgolint 7.0.2003, oxfmt 0.72.0                           | 2026-10-07 |
| Oxc docs (oxlint/oxfmt)                             | `oxc-project/website` [`6852693`][oxc-commit]                                                                                             | 2026-10-07 |
| Next.js docs                                        | `vercel/next.js` [`eeb353b`][next-commit]                                                                                                 | 2026-10-07 |
| Expo docs                                           | `expo/expo` [`cb88164`][expo-commit]                                                                                                      | 2026-10-07 |
| tsdown docs                                         | `rolldown/tsdown` `6cbfec7`                                                                                                               | 2026-10-06 |

"**Experiment Ex**" means a command I ran on a throwaway clone of this repo in `/tmp` (see [Experiments](#experiments-run-on-throwaway-clones)). Nothing in this repo was modified except this file.

---

## Summary

- **Vite+ is stable, MIT-licensed, and at v1.1.0.** 1.0.0 shipped 2026-09-28 and 1.1.0 on 2026-10-07. `vp` bundles Vite 8, Rolldown, Vitest 5, Oxlint, Oxfmt, tsdown and Vite Task, and adds a Node/package-manager manager ([README L14–30][vp-readme], [v1.0.0 notes][vp-rel-100], [v1.1.0 notes][vp-rel-110]).
- **`vp run` covers about half of this repo's `turbo.json`.** It has topological/`-r`/`-t`/pnpm-style `--filter` (including `pkg...` and `...pkg`), a concurrency limit, `--parallel`, local caching with automatic file-read tracking, and per-task `cache.env`/`untrackedEnv`/`input`/`output` ([run.md][vp-run-filter], [config/run.md][vp-cfg-run]). It has **no watch mode, no `--continue`, no `persistent`/`interactive`/`outputLogs` task fields, no global env lists and no TUI**. Its task schema rejects unknown fields ([user.rs L296–321][vt-user-task]). A failing task SIGKILLs every other running task ([cancellation.md L13–19][vt-cancel]).
- **vp 1.1.0 has no remote cache.** Remote caching (HTTP endpoint, GitHub OIDC uploads) was merged into vite-task `main` after the rev that vp 1.1.0 compiles. It is unreleased and has open design issues ([vite-task CHANGELOG][vt-changelog], [compare 7d69d65…main][vt-compare], [#778][vt-778]/[#779][vt-779]/[#781][vt-781]). Today the documented CI path is an **experimental** `actions/cache` of `node_modules/.vite/task-cache` ([github-actions-cache.md L3–5][vp-gha-cache]).
- **Tasks with dependencies or caching need a `vite.config.ts` in each package.** `package.json` scripts cannot declare `dependsOn` or cache settings, and each package's own `vite.config.*` is loaded for its tasks ([run.md L112][vp-run-taskdef], [lib.rs L284–316][vt-lib-load]). Cached tasks run in a **clean environment** ([cache.md L67–86][vp-cache-env]). `vp run` never sets `npm_lifecycle_event` (E7), which this repo's `env.ts` files read for `skipValidation`.
- **Lint: Oxlint covers almost every rule this repo actually enables.** On `apps/nextjs`, 149 of the 155 ESLint rules that are active for a `.tsx` file have an active Oxlint counterpart (E1). The gaps are `@typescript-eslint/no-unnecessary-condition` and `prefer-optional-chain` (both Oxlint _nursery_), `no-octal`, and three React-Compiler `react-hooks/*` config rules. `eslint-plugin-turbo` can only run as an alpha JS plugin. Type-aware linting needs **TypeScript 7 tsconfig semantics**: on this repo, 8 of the 10 errors it reported match TS 6.0 default changes; the other 2 came from the migration removing `prettier` (E5).
- **Format: Oxfmt matches Prettier output on 126 of 131 files (E3), with two exceptions.** It cannot load Prettier plugins: `@ianvs/prettier-plugin-sort-imports`'s `importOrder` is not migrated and a hand-written `sortImports` still differs on 18 files. It also does not read the `"prettier"` field in `package.json`, which every package here uses ([unsupported-features.md L13–17][oxfmt-unsupported], E3). Tailwind class sorting migrates automatically.
- **`vp migrate` handles part of this repo.** In E4 it rewrote Prettier to Oxfmt, aliased `vite` to `@voidzero-dev/vite-plus-core` through the catalog, and rewrote the TanStack Start scripts. It **skipped ESLint** ("no root config found"), **left Turborepo untouched**, and turned `prettier --write --list-different` into `vp fmt --check`. It deleted `.nvmrc` but did not update `tooling/github/setup/action.yml`, which reads it. Its appended devDependency then broke the `sherif` postinstall (E5).
- **Per app:** Next.js and Expo keep their own bundlers (Turbopack/webpack, Metro), so only `vp run`/`vp lint`/`vp fmt` apply. TanStack Start is already a Vite app. `vp build` built it on Vite 8.3.3 (E5) even though its pinned plugins declare `vite` peers only up to `^7`. Internal packages are just-in-time TS with `tsc`-emitted `.d.ts`, and nothing in the docs suggests `vp pack` is meant for that.
- **Generators:** `@turbo/gen` (Plop/Handlebars) has no drop-in replacement. `vp create vite:generator` scaffolds **Bingo** (Zod + TS) generators registered in `create.templates` ([create.md L108–196][vp-create-gen]). The templates would have to be rewritten.
- **CI:** the official `voidzero-dev/setup-vp` action replaces `pnpm/action-setup` + `setup-node` + `pnpm add -g turbo`. Pin it to an exact release (latest is v1.21.1, 2026-09-21), not `v1` ([ci.md L9–33][vp-ci]).

---

## Current repo inventory (what needs an equivalent)

**Turborepo**

- Root scripts: `turbo run build|clean|typecheck|ui-add`, `turbo run lint|format --continue -- --cache --cache-location …`, `turbo watch dev --continue`, `turbo watch dev -F @acme/nextjs...`, and `turbo -F @acme/db push|studio` (`package.json:10-25`). `@turbo/gen` and `turbo` are devDependencies (`package.json:31,34`).
- `turbo.json`:
  - `ui: "tui"` (`:3`)
  - `topo` with `^topo` (`:5-7`)
  - `build` with `^build` and `outputs` (`:8-11`)
  - `dev` with `^dev`, `cache:false`, `persistent:false` (`:12-16`)
  - `format` outputs + `outputLogs:"new-only"` (`:17-20`)
  - `lint`/`typecheck` with `^topo`+`^build` and outputs (`:21-28`)
  - `clean`/`//#clean` with `cache:false` (`:29-34`)
  - `push`/`ui-add` with `interactive` (`:35-38,43-46`)
  - `studio` with `persistent` (`:39-42`)
  - `globalEnv` (`:48-55`) and `globalPassThroughEnv` (`:56-63`)
- Package `turbo.json` files use `extends: ["//"]`:
  - `apps/nextjs/turbo.json:5-11`: build outputs `.next/**`, `!.next/cache/**`, `next-env.d.ts`; `dev` persistent.
  - `apps/tanstack-start/turbo.json:5-11`: outputs `.nitro/**`, `.output/**`, `.tanstack/**`.
  - `apps/expo/turbo.json:5-8`: `dev` persistent + interactive.
- CI sets `TURBO_TEAM`/`TURBO_TOKEN` for Vercel remote cache (`.github/workflows/ci.yml:14-19`), and the composite action runs `pnpm add -g turbo` (`tooling/github/setup/action.yml:13`).
- `eslint-plugin-turbo` recommended rules (`tooling/eslint/base.ts:5,47,56`).
- Generator `turbo/generators/config.ts:11-94` (Plop `add`/`modify` actions, npm-registry fetch, then `pnpm i` + `prettier --write`) and three `.hbs` templates.

**ESLint** (`tooling/eslint/*`, 9 per-package `eslint.config.ts`, run as `eslint --flag unstable_native_nodejs_ts_config`, e.g. `apps/nextjs/package.json:10`)

- `base.ts`:
  - `includeIgnoreFile(.gitignore)` plus `**/*.config.*` ignore (`:41-42`)
  - `@eslint/js` recommended + typescript-eslint `recommended`, `recommendedTypeChecked`, `stylisticTypeChecked` (`:50-53`)
  - custom options for `no-unused-vars`, `consistent-type-imports`, `no-misused-promises`, `no-unnecessary-condition`, `no-non-null-assertion` and `import/consistent-type-specifier-style` (`:57-76`)
  - `reportUnusedDisableDirectives` (`:80`) and `projectService` (`:83`)
  - `restrictEnvAccess` via `no-restricted-properties`/`no-restricted-imports` (`:12-37`)
- `react.ts`: spreads `reactPlugin.configs.flat.recommended` and then `flat["jsx-runtime"]` into the same object (`:8-9`). The second `rules` key replaces the first, so **no `eslint-plugin-react` rule is active** for `.tsx` (E1, from `eslint --print-config`). `react-hooks` `recommended-latest` (`:18`) supplies 18 active rules, including the React Compiler rules.
- `nextjs.ts`: `@next/next` recommended + core-web-vitals, with `no-duplicate-head` off (`:10-13`).
- `eslint-plugin-jsx-a11y` is a dependency (`tooling/eslint/package.json:20`) but no config references it.

**Prettier** (`tooling/prettier/index.js`)

- Plugins `@ianvs/prettier-plugin-sort-imports` and `prettier-plugin-tailwindcss` (`:7-10`), `tailwindFunctions` (`:11`), regex `importOrder` (`:12-28`), and `.hbs` parser overrides (`:29-42`).
- Every package loads the config via the `"prettier": "@acme/prettier-config"` field (e.g. `package.json:37`, `apps/nextjs/package.json:49`).
- Per-package `prettier --check . --ignore-path ../../.gitignore [--ignore-path .prettierignore]`.
- The `pnpm-workspace.yaml:45-47` hoists the two plugins.

**Misc**

- `dotenv -e ../../.env --` wrappers (`apps/nextjs/package.json:13`, `packages/db/package.json:29`, `packages/auth/package.json:16`).
- `skipValidation: !!process.env.CI || process.env.npm_lifecycle_event === "lint"` (`apps/nextjs/src/env.ts:37-38`, `apps/tanstack-start/src/env.ts:34-35`, `packages/auth/env.ts:16-17`).
- `pnpm dlx sherif@latest` in postinstall (`package.json:22-23`).
- `catalog:`/`catalog:react19` (`pnpm-workspace.yaml:6-32`), with `vite` pinned to 7.1.12 in the catalog and overrides (`:25,43`).
- Renovate (`.github/renovate.json`).
- `.nvmrc` 22.21.0.
- No test files and no Vitest.

---

## 1. What Vite+ is today

- **Version/status.** v1.0.0 (2026-09-28) "is stable" and promoted rc.1 with no code changes ([v1.0.0 notes][vp-rel-100]). v1.1.0 (2026-10-07) is the latest release (GitHub releases API). The 1.0 plan commits semver to "the `vp` CLI and … the Vite+ config schema", while bundled tools keep their own versions ([vite-plus#2405][vp-2405]).
- **License.** MIT: "Vite+ is fully open-source under the MIT license" ([README L30][vp-readme]; `LICENSE` © VoidZero Inc.). vite-task is MIT too ([vite-task README][vt-readme]).
- **What `vp` bundles** ([README L14–30][vp-readme], `vp help` groups at [README L100–154][vp-readme-cli]):
  - Start: `create`, `migrate`, `config`, `hooks`, `staged`, `install`, `env` (Node and package manager)
  - Develop: `dev` (Vite), `check` (fmt + lint + type check), `lint` (Oxlint), `fmt` (Oxfmt), `test` (Vitest)
  - Execute: `run`/`vpr` (Vite Task), `exec`, `node`, `dlx`, `cache`
  - Build: `build` (Vite + Rolldown), `pack` (tsdown), `preview`
  - Dependencies: `add`, `remove`, `update`, `dedupe`, `outdated`, `list`, `why`, `info`, `link`, `rebuild`, `pm`
  - Maintain: `toolchain`, `upgrade`, `implode`
- **Config.** One `vite.config.ts` with extra blocks `run`, `lint`, `fmt`, `check`, `test`, `pack`, `staged`, `create` and `defaultPackage` ([config/index.md L1–48][vp-cfg-index]). Built-in commands (`vp dev`, `vp build`, `vp lint`…) cannot be overridden by scripts. `vp run <name>` runs the script ([run.md L41–54][vp-run-builtin]).
- **Runtime requirement.** The CLI needs Node `^22.18.0 || ^24.11.0 || >=26.0.0` ([v1.0.0 notes][vp-rel-100]). This repo's `.nvmrc` (22.21.0) satisfies it.

## 2. Monorepo task running vs Turborepo

**Task definition and discovery**

- `vp run <task>` runs a `package.json` script or a task from that package's `vite.config.ts` `run.tasks`. A name can come from one or the other, not both ([run.md L85–118][vp-run-taskdef]).
- Each package's config is loaded from its own directory ([lib.rs L284–316][vt-lib-load]). There is no root-level pipeline that applies to every package the way `turbo.json` `tasks` does. A maintainer suggests composing a shared TS file into each `run` block ([vite-plus#1494 comment][vp-1494]). A dedicated `turbo.json`-style file is an open request there.
- **Task fields:** `command`, `cwd`, `dependsOn` and `cache` (`env`, `untrackedEnv`, `input`, `output`). Workspace-root fields are `run.cache` and `run.enablePrePostScripts` ([config/run.md][vp-cfg-run]; [user.rs L241–268, L296–321, L390–413][vt-user-task]).
- The structs use `deny_unknown_fields`, so `persistent`, `interactive`, `outputLogs` and `inputs` are config errors, not silently ignored ([user.rs L296][vt-user-task]).

**Dependency graph**

- `dependsOn: ['build', '@pkg#build']` for explicit edges.
- `dependsOn: [{ task: 'build', from: 'dependencies' | ['dependencies','devDependencies'] }]` is the Turbo `^build` analogue. It covers **direct** workspace deps that define the task ([run.md L120–156][vp-run-deps]; [config/run.md L118–155][vp-cfg-run-deps]).
- Known limit: the object form does not bridge a package that lacks the task ([vite-task#738][vt-738], open). Today every package that sits between this repo's apps and a package with `build` is also a direct dependency, so the chain holds. That is an inference from the `package.json` files.
- `-r`/`-t`/`--filter` order comes from the `package.json` dependency graph ([run.md L158–193][vp-run-filter]).

**Filtering**

- pnpm syntax: name, glob, `./dir`, `pkg...` (with dependencies), `...pkg` (with dependents), `pkg^...`, `!pkg` (`vp run --help`; [run.md L195–221][vp-run-filter]).
- A filter that matches nothing **warns and exits 0** unless `--fail-if-no-match` is passed ([run.md L221][vp-run-filter]).
- Changed-since selectors (`[ref]`, Turbo `--affected`) are **not supported** ([vite-plus#2903][vp-2903], open, 2026-10-06).
- `-w` selects the root package, the analogue of `//#task` ([run.md L223–229][vp-run-filter]).

**Caching**

- Local only in vp 1.1.0 (see Summary). The cache lives in `node_modules/.vite/task-cache` ([cache.md L103–111][vp-cache-env]).
- `vite.config.ts` tasks are cached by default. `package.json` scripts are **not** cached unless you pass `--cache` or set `run.cache.scripts: true` ([cache.md L23–44][vp-cache-when]).
- Inputs are tracked automatically: file reads, missing-file probes and directory listings. Outputs are auto-archived and restored ([automatic-data-tracking.md L9–50][vp-adt]).
- `vp build` reports `VITE_*`, `NODE_ENV` and `dist/**` itself ("cooperative tracking"). Other tools need manual config ([automatic-data-tracking.md L108–138][vp-adt-coop]).
- A task that **reads and writes the same file is not cached**. In E6 every `tsc` build here was reported as `Not cached: read and wrote 'packages/*/.cache/tsbuildinfo.json'`, because `tooling/typescript/base.json:15-17` enables `incremental` with a `tsBuildInfoFile`. The documented fix is `cache.input: [{ auto: true }, '!**/*.tsbuildinfo']` (adapted to `.cache/tsbuildinfo.json`) ([config/run.md L245–265][vp-cfg-run-input]).
- **Env:** cached tasks get only `cache.env` (fingerprinted), `cache.untrackedEnv` and a default pass-through list:
  - Defaults include `CI`, `VERCEL`, `VERCEL_*`, `NEXT_*`, `GITHUB_*`, `*_TOKEN`
  - They do **not** include `NODE_ENV` or `npm_lifecycle_event` ([DEFAULT_UNTRACKED_ENV][vt-default-env]; [config/run.md L189–243][vp-cfg-run-env])
  - Uncached tasks receive the full parent env. Filtering only happens when `cache_config` is set ([plan.rs L616–620][vt-plan-env]; confirmed in E7).
  - There is **no workspace-wide `globalEnv`/`globalPassThroughEnv`**. They must be repeated per task.
- **No cache eviction** by age or size yet ([vite-task#251][vt-251]; [github-actions-cache.md L159][vp-gha-cache-evict]).

**`--continue`, watch, persistent and interactive tasks**

- `--continue`: **none.** On a non-zero exit, `vp run` kills all other running tasks with SIGKILL and schedules nothing new ([cancellation.md L13–19][vt-cancel]). E6 showed the effect: after `@acme/nextjs#build` failed, the other in-flight builds exited 137.
- Watch (`turbo watch`): **none.** `vp run --watch` is an open proposal, and a maintainer replied "this is planned" on 2026-04-03 ([vite-task#276][vt-276]). Turbo's watch reruns non-persistent tasks on change and leaves tools with their own watchers (e.g. `next dev`) running ([turbo watch docs][turbo-watch]).
- Persistent/long-running tasks: no `persistent` flag ([vite-task#416][vt-416], open). The documented approach is `vp run -r --parallel dev`, which drops dependency ordering ([concurrency.md L30–38][vt-concurrency]). Without `--parallel`, the default limit of 4 applies ([concurrency.md L14][vt-concurrency]).
  - Inference: a never-exiting task holds its slot, so more than 4 long-running tasks would block the 5th. This repo has three dev servers.
- Interactive tasks: uncached tasks in the default `interleaved` log mode inherit stdin. Cached tasks and `labeled`/`grouped` modes get `/dev/null` ([stdio.md L69–82][vt-stdio]). The docs don't say which task gets stdin when several uncached tasks run at once.

**Parallelism and output**

- `--concurrency-limit N` (default 4) or `VP_RUN_CONCURRENCY_LIMIT`; `--parallel` ([run.md L339–365][vp-run-conc]).
- `--log interleaved|labeled|grouped`. There is no TUI and no `outputLogs` equivalent; cache hits replay the stored output ([stdio.md L5–15][vt-stdio]).

**Other behaviour**

- Compound `a && b` commands and nested `vp run` are split into separately cached sub-tasks. A root script `vp run -r build` prunes its own recursion ([run.md L231–302][vp-run-compound]).
- Running the **current** root script `turbo run build` under `vp run -r build` is _not_ pruned. It ran as `create-t3-turbo#build` in E6.
- Arguments after the task name go to every selected task, as with `turbo run lint -- --fix`. E8 confirmed this for `-r`. Tasks pulled in by `dependsOn` don't receive them ([vite-task CHANGELOG, #324][vt-changelog]).

**Using `vp run` without migrating**

- The global `vp` can run tasks in this repo without a local `vite-plus` install. It prints `warn: This project does not use vite-plus` (E6).

## 3. Lint (`vp lint` = Oxlint 1.87.0)

- **Config model.** One root `vite.config.ts` `lint` block plus `lint.overrides` for package-specific rules. Nested configs do not apply per file ([lint.md L19–43][vp-lint]; [monorepo.md L7–66][vp-monorepo]; [troubleshooting.md L27–37][vp-trouble-nested], feedback thread [discussion #2669][vp-2669]). This repo's 9 per-package flat configs (base/react/next/restrictEnvAccess combinations) would become overrides keyed by path globs.
- **Rule coverage (E1).** `@oxlint/migrate@1.87.0 --type-aware --details` on `apps/nextjs/eslint.config.ts` (the richest config) produced 164 rules (165 with JS plugins). I cross-checked against `eslint --print-config` on `src/app/page.tsx`: of 155 active ESLint rules, 6 have no active Oxlint counterpart.

| Plugin / rule set                                                             | Oxlint status (E1 + rule docs)                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@eslint/js` recommended                                                      | Covered, except `no-octal`. The migrator notes "Superseded by strict mode", and no Oxlint rule page exists.                                                                                                                                                                                                                                   |
| typescript-eslint recommended + recommendedTypeChecked + stylisticTypeChecked | Covered as `typescript/*`, except `no-unnecessary-condition` and `prefer-optional-chain`. Both exist but are `category: "Nursery"` and type-aware ([rule doc][oxlint-nuc]). The repo configures `no-unnecessary-condition` explicitly (`base.ts:69-74`). Option objects for `no-misused-promises` and `consistent-type-imports` carried over. |
| `import/consistent-type-specifier-style`                                      | Covered ([rule][oxlint-import-cts]).                                                                                                                                                                                                                                                                                                          |
| `no-restricted-properties` / `no-restricted-imports` (restrictEnvAccess)      | Covered, with options. E2 showed `no-restricted-properties` firing on `process.env`.                                                                                                                                                                                                                                                          |
| `react-hooks` recommended-latest (18 rules)                                   | 15 covered as `react/*` (e.g. `react/rules-of-hooks`, `react/purity`). `component-hook-factories`, `config` and `gating` are unsupported; the migrator gives reasons.                                                                                                                                                                         |
| `eslint-plugin-react`                                                         | No active rules today (see inventory), so there is nothing to port.                                                                                                                                                                                                                                                                           |
| `@next/eslint-plugin-next`                                                    | All 21 rules map to `nextjs/*`.                                                                                                                                                                                                                                                                                                               |
| `eslint-plugin-turbo` (`no-undeclared-env-vars`)                              | No native rule. `--js-plugins` emits `jsPlugins: ["eslint-plugin-turbo"]`. In E2 oxlint failed to load it from `apps/nextjs` because the dependency lives in `tooling/eslint` (pnpm strict layout). The rule checks against `turbo.json`, so it stops meaning anything once Turbo is gone (inference).                                        |
| `reportUnusedDisableDirectives`                                               | Not migrated by the tool. Set it by hand with `options.reportUnusedDisableDirectives` (root config only) ([generated-config.md L372–381][oxlint-opts]).                                                                                                                                                                                       |
| `.gitignore` ignore                                                           | Oxlint respects `.gitignore` by default ([ignore-files.md L13–23][oxlint-ignore]). The migrator also inlined it as `ignorePatterns`.                                                                                                                                                                                                          |

- **Type-aware linting** comes from tsgolint on typescript-go: "TypeScript **7.0+** is required". Options deprecated in TS 6.0 or removed in 7.0 must be migrated first, and `baseUrl` is unsupported ([type-aware.md L260–275][oxlint-typeaware]). It covers 59 of 61 typescript-eslint type-aware rules ([type-aware.md L10][oxlint-typeaware]). `options.typeCheck` is labelled "experimental" ([generated-config.md L402–408][oxlint-opts]).
  - `vp migrate` turns on both `typeAware` and `typeCheck` ([check.md L9][vp-check]). In E5 that produced 10 errors here:
    - `tsconfig-error` "rootDir must be explicitly set" in `packages/{api,db,validators}`
    - TS2882 on side-effect CSS imports
    - TS2591/TS2339 for `node:path` and `import.meta.dirname` in `tooling/eslint/base.ts`
    - TS2307 for the removed `prettier`
  - These match TS 6.0's new defaults: `rootDir` = tsconfig dir, `types: []`, `noUncheckedSideEffectImports: true` ([TS 6.0 announcement][ts6]).
- **JS plugins** are "currently in alpha". Type-aware JS-plugin rules and custom parsers are not supported ([js-plugins.md L15, L162–165][oxlint-jsplugins]). Vite+ re-exports the authoring API as `vite-plus/lint/plugins` ([lint.md L54–107][vp-lint-js]).
- **Migration tooling.**
  - `@oxlint/migrate` converts flat configs, with `--type-aware`, `--js-plugins`, `--with-nursery`, `--replace-eslint-comments` and `--details`.
  - `vp migrate` runs it **only when there is a root ESLint config**. With only package-level configs, as here, it warns "Package-level ESLint must be migrated manually" ([eslint.ts L225][vp-eslint-root], [L937][vp-eslint-warn]; E4).
  - When it does run, it uses `--merge --type-aware --with-nursery --details`. It then deletes ESLint config files and ESLint dependencies in **every** workspace package ([eslint.ts L225–316][vp-eslint-root]).

## 4. Format (`vp fmt` = Oxfmt 0.72.0)

- **Compatibility claim.** Oxfmt "is compatible with Prettier v3.9.9 for many configurations". The default `printWidth` is 100, and "Prettier plugins are not supported (though some popular plugins have been implemented natively)" ([migrate-from-prettier.md L53–61][oxfmt-migrate]). Vite+ describes it as having "full Prettier compatibility" ([fmt.md L7][vp-fmt]).
- **Unsupported options that affect this repo** ([unsupported-features.md L13–36][oxfmt-unsupported]):
  - the "`prettier` field in `package.json`", which all 12 manifests here use (root + 11 packages)
  - all Prettier plugins. The built-in replacements are `sortImports` (based on eslint-plugin-perfectionist, off by default), `sortTailwindcss` (based on prettier-plugin-tailwindcss, off by default) and `sortPackageJson` (**on by default**) ([sorting.md L15–19, L152–158, L190–196][oxfmt-sorting])
- **What each plugin and setting becomes** (E3, E4):
  - `prettier-plugin-tailwindcss` + `tailwindFunctions` migrate to `sortTailwindcss.functions: ["cn","cva"]`. Regex patterns are not supported ([sorting.md L188][oxfmt-sorting]).
  - `@ianvs/prettier-plugin-sort-imports`: `oxfmt --migrate=prettier` prints "is not supported, skipping…" but copies the raw `importOrder*` keys into the config, where they have no effect. Oxfmt's `sortImports` uses perfectionist-style `groups`/`customGroups`/`internalPattern`, not ianvs regexes ([generated-config.md sortImports][oxfmt-cfg-sortimports]). A first-pass hand translation (custom groups for react/next/expo, `internalPattern` `@acme/`,`~/`) still re-sorted **18 files**: `node:` builtins, blank lines between `@acme` and `~/`, and side-effect imports.
  - `.hbs` parser overrides (`index.js:29-42`) are dropped. The 3 `turbo/generators/templates/*.hbs` files then show as unformatted.
  - The migration sets `printWidth: 80` and `sortPackageJson: false`, which preserves current output.
- **Diff size (E3).** With the migrated config and imports left unsorted, `oxfmt --check .` flagged only 5 of 131 files:
  - the new config file itself
  - `routeTree.gen.ts`, which is excluded only via the package-level `.prettierignore` when run per package
  - the 3 `.hbs` templates

  Every other file already matched Prettier output.

- **CLI parity.** `--write` (default), `--check`, `--list-different` and repeatable `--ignore-path` exist ([formatter generated-cli.md L22–39][oxfmt-cli]). Neither the oxfmt nor the oxlint CLI documents a `--cache` flag, so the `--cache --cache-location .cache/.prettiercache|.eslintcache` arguments have no equivalent. Caching would come from `vp run` instead.
- **Migration path.** `oxfmt --migrate=prettier` ([migrate-from-prettier.md L116][oxfmt-migrate]), or `vp migrate`. The latter writes a `fmt` block into the root `vite.config.ts`, rewrites `prettier` scripts to `vp fmt`, and removes `prettier` + `prettier-plugin-tailwindcss` (E4).

## 5. Per-app compatibility

**Next.js (`next@^16.0.9`)**

- Next 16 builds with Turbopack by default (`--webpack` opts out) ([version-16.mdx L102–154][next-16]). `next lint` was removed: "Use Biome or ESLint directly. `next build` no longer runs linting" ([version-16.mdx L1060–1062][next-16-lint]).
- Next's docs list only ESLint and Biome as linters, not Oxlint ([installation.mdx L387–406][next-install]). They do document Vitest for unit tests, with the caveat that async Server Components are unsupported ([testing/vitest.mdx][next-vitest]).
- `vp dev`/`vp build` always run Vite, so this app must use `vp run dev|build` ([run.md L41–54][vp-run-builtin]).
- What applies: `vp run` (scripts unchanged), `vp lint` with the `nextjs` plugin (all 21 rules, E1), `vp fmt`, and `vp test` if tests are added. No Next.js app is in vite-plus's e2e ecosystem list; only `vinext` is ([e2e-test.yml][vp-e2e]).

**Expo / Metro (SDK 54)**

- Metro is configured automatically for monorepos since SDK 52 ([monorepos.mdx L9–26][expo-monorepo]).
- Expo's docs cover ESLint via `eslint-config-expo` ([using-eslint.mdx L22][expo-eslint]) and unit tests via Jest/`jest-expo` ([unit-testing.mdx L2–23][expo-jest]). Neither page mentions Oxlint, Oxfmt, Vitest or Vite+ (grep of `docs/pages/guides`).
- Vite+ can only run the scripts (`expo start`, `expo run:*`) and lint or format the sources.
- `expo start`'s interactive keys depend on stdin inheritance (see §2). There is no Expo project in vite-plus e2e CI ([e2e-test.yml][vp-e2e]).

**TanStack Start (`@tanstack/react-start@^1.135.2` + `nitro@3.0.1-alpha.1`)**

- Already a Vite app (`apps/tanstack-start/vite.config.ts`).
- `vp migrate` rewrites the config import to `vite-plus`, wraps the plugins in `lazyPlugins` (a feature for skipping plugin setup when only lint/fmt config is read; [troubleshooting.md L89–115][vp-trouble-lazy]), and rewrites `vite build` → `vp build` and `vite start` → `vp start` (E4).
  - `vp start` is not a `vp` command ([README CLI list][vp-readme-cli]).
  - `pnpm with-env vite dev` was left as is.
- The migration swaps Vite 7.1.12 for `@voidzero-dev/vite-plus-core@1.1.0`, which bundles Vite 8.3.3. It adds `peerDependencyRules.allowAny: [vite]` (E4).
- Declared `vite` peer ranges (npm registry, 2026-10-07):

| Package (version pinned here)   | Declared `vite` peer   |
| ------------------------------- | ---------------------- |
| `@tanstack/react-start@1.135.2` | `>=7.0.0`              |
| `nitro@3.0.1-alpha.1`           | `^7`                   |
| `@vitejs/plugin-react@5.1.0`    | `^4…^7`                |
| `@tailwindcss/vite@4.1.16`      | `^5.2 \|\| ^6 \|\| ^7` |

- In E5, `vp build` **succeeded** and produced `.output/` via nitro. It warned that `optimizeDeps.rollupOptions` is deprecated in favour of `rolldownOptions`, and that `vite-tsconfig-paths` can be replaced by `resolve.tsconfigPaths`. Runtime and dev server were not tested.
- vite-plus e2e CI runs `vp run test` and `vp run build` on a TanStack Start + nitro hello-world ([e2e-test.yml][vp-e2e]).
- An earlier TanStack Start SSR breakage, caused by two copies of vite-plus-core, was fixed by PR #2617 ([vite-plus#1391][vp-1391]).

**Internal packages**

- `@acme/api`, `@acme/db` and `@acme/validators` export `src/*.ts` as `default` and `dist/*.d.ts` as `types`. Their `build`/`dev` script is `tsc` with `emitDeclarationOnly` (`packages/api/package.json:5-15`, `tooling/typescript/compiled-package.json:5-10`).
- `@acme/auth` and `@acme/ui` are source-only, with no `build`.
- Apps consume them as source: `transpilePackages` in `apps/nextjs/next.config.js:11-17`, and Vite and Metro natively.
- `vp pack` is documented for publishable libraries and executables, building JS bundles plus optional `dts` ([pack.md L7, L19–42][vp-pack]). The tsdown docs describe no declaration-only output mode. `emitDtsOnly` appears only internally in `src/features/rolldown.ts:143`. Using `vp pack` here would change the packaging model, which the evidence does not support.

## 6. Generators and misc

- **`@turbo/gen` → `vp create`.**
  - `vp create vite:generator` scaffolds a generator package using **Bingo** (`createTemplate` with Zod options and a `produce()` that returns files and scripts). It registers the package in root `vite.config.ts` `create.templates`. It needs a monorepo workspace. After it runs, the created package goes through workspace registration, install and formatting ([create.md L108–196][vp-create-gen]; [config/create.md][vp-cfg-create]).
  - Plop prompts, Handlebars templates and the `modify` action that fetches versions from npm (`turbo/generators/config.ts:58-76`) would need rewriting. There is no importer. The [code-generator RFC][vp-rfc-codegen] compares the approaches.
  - Org-wide templates (`@org/create` with a `createConfig.templates` manifest) are also supported ([create.md L198–343][vp-create-gen]).
- **sherif.** Independent of Vite+. It can stay as `pnpm dlx` or become `vp dlx`. After `vp migrate`, sherif failed `unordered-dependencies` on `apps/tanstack-start/package.json`, because migrate appended `vite-plus` after `vite-tsconfig-paths`. That made `pnpm install` exit 1 through postinstall (E5).
- **dotenv-cli.** Untouched by `vp migrate` (E4). Vite+ docs only show `dotenv … -- bunx …` being preserved during rewrites ([migrate-rules.md L243–252][vp-mig-scripts]).
  - For cached tasks, variables loaded by dotenv inside the task are unaffected by vp's env filtering. Variables coming from the _parent_ shell, such as CI-provided `POSTGRES_URL`, are stripped unless listed (E7).
  - Inference: the `.env` file read is tracked as an input by file-system tracking.
- **`npm_lifecycle_event`.** Not set by `vp run` (E7). `vite-task` contains no reference to it. vp 1.1.0 newly sets `npm_execpath`/`npm_config_user_agent` ([v1.1.0 notes][vp-rel-110]). The three `env.ts` `skipValidation` checks for `=== "lint"` would no longer fire when lint runs through `vp run`. `CI` is still passed by default.
- **`catalog:`.** `vp migrate` keeps `catalog:`/named catalogs and pins `vite-plus` plus the `vite` → `npm:@voidzero-dev/vite-plus-core@…` alias in the default catalog. Under pnpm it writes `overrides: vite@*: 'catalog:'` ([migrate-rules.md L97–134, L265–283][vp-mig-deps]; E4). `vp add` forwards pnpm's `--save-catalog`/`--save-catalog-name` ([vite-plus#1835 comment][vp-1835]).
- **Renovate.** Bots update `vite-plus` and the `vite` core alias as two unrelated packages, which can leave mismatched pairs. A grouping rule is the suggested workaround ([vite-plus#2356][vp-2356], open). This repo has `.github/renovate.json`.
- **Node version.** `vp migrate` converts `.nvmrc` to `.node-version` ([migrate-rules.md L258–263][vp-mig-node]).

## 7. Migration tooling (`vp migrate`)

- **Scope.** Run from the workspace root; it cannot migrate a single workspace member ([migrate.md L23–34][vp-migrate]). It updates dependencies, rewrites imports in config files, merges tool configs into `vite.config.ts`, rewrites scripts, optionally sets up hooks/agent/editor files, and formats ([migrate.md L46–60][vp-migrate]). It expects Vite 7+ and Vitest 4+ ([migrate.md L64–70][vp-migrate]); the CLI's built-in prompt says "Vite 8+ and Vitest 4.1+" (`vp migrate --help`).
- **Script rewrites.**
  - `vite`, `vitest`, `oxlint`, `oxfmt`, `tsdown` and `lint-staged` are always rewritten.
  - `eslint`, `prettier` and `tsup` are rewritten only when their optional migration runs ([migrate-rules.md L227–241][vp-mig-scripts]).
  - **Nothing in the docs or source covers Turborepo.** A grep of the vite-plus repo for "turbo" finds only RFC prior-art mentions. The "turbo run → vp run" migration-helper issue was closed on 2026-03-13 ([vite-task#206][vt-206]), and I found no Turborepo handling in the migrator source at `b5efee3`.
- **CI rewrite.** Only `setup-vp@v1` references and `node-version-file: .nvmrc` under `.github/**` are rewritten ([migrate-rules.md L254–263][vp-mig-ci]). This repo's composite action lives in `tooling/github/setup/action.yml`, so E4 deleted `.nvmrc` while leaving `node-version-file: ".nvmrc"` (`:10`) in place. That would break CI as-is.
- **Observed on this repo (E4, global vp 1.1.0, `--no-interactive --no-agent --no-editor --no-hooks`):**
  - Prettier was migrated to a root `vite.config.ts` `fmt` block.
  - 11 `format` scripts became `vp fmt --check …`.
  - `ui-add`'s `prettier src --write --list-different` became `vp fmt src --check`, which changes behaviour from writing to checking.
  - The root `"prettier"` field was removed; the 11 package-level ones were kept.
  - `@ianvs/prettier-plugin-sort-imports` stayed a dependency.
  - The `lint` block was added with `typeAware`, `typeCheck` and the `vite-plus/prefer-vite-plus-imports` JS plugin rule, but **ESLint was not migrated**.
  - `turbo`, `turbo.json` and `@turbo/gen` were untouched.
  - The final install failed only because of a local pnpm `minimum-release-age` (1440 min) policy against the day-old 1.1.0 release.
- **Known rough edges.** A tracker lists lossy or incorrect migrations found in real projects ([vite-plus#2037][vp-2037], open).
- **Agent prompt.** Vite+ also publishes a migration prompt for coding agents ([migrate.md L78–82][vp-migrate]).

## 8. CI

- **Action.** `voidzero-dev/setup-vp@<exact version>` installs `vp`, Node and the package manager, and runs `vp install`. `cache: true` caches package-manager data. Don't use the frozen `v1` tag ([ci.md L9–33][vp-ci]). Inputs include `node-version-file`, `run-install`, `cache`, `working-directory` and `sfw` ([setup-vp action.yml][setup-vp]).
- **Replaces** `pnpm/action-setup` + `setup-node` + `pnpm add -g turbo` (`tooling/github/setup/action.yml:7-16`), per the documented before/after ([ci.md L124–156][vp-ci]).
- **Task cache.** "Reusing Vite Task's cache across GitHub Actions runs is experimental." The pattern is to restore and save `node_modules/.vite/task-cache` _after_ install, using a rolling `run_id`-based key with an OS/arch restore prefix. Only `vp run` tasks are cached, not direct `vp build`. Fork PRs may be restore-only, and nothing evicts old entries ([github-actions-cache.md][vp-gha-cache]).
- **Remote cache.** Vercel Remote Cache (`TURBO_TEAM`/`TURBO_TOKEN`) has no vp 1.1.0 equivalent. vite-task `main` adds `cache.remote.url`/`VP_REMOTE_CACHE_URL` with `--remote-cache=off|read|read-write` and GitHub Actions OIDC upload auth, all unreleased ([vite-task CHANGELOG][vt-changelog]).
- **Updates.** Renovate's GitHub Actions manager picks up `setup-vp` with no extra rule ([ci.md L97–122][vp-ci]).

## 9. Known gaps and open issues relevant to this repo

| Gap                                                                                                            | Status / source                                                                                                 |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| No `vp run --watch` (replaces `turbo watch dev`)                                                               | Open, "planned" ([vite-task#276][vt-276])                                                                       |
| No `persistent` tasks / depending on a persistent task                                                         | Open ([vite-task#416][vt-416])                                                                                  |
| No `--continue`; fast-fail SIGKILLs siblings                                                                   | Documented behaviour ([cancellation.md][vt-cancel])                                                             |
| No remote cache in a release                                                                                   | Unreleased on vite-task main; open design issues [#768][vt-768], [#778][vt-778], [#779][vt-779], [#781][vt-781] |
| No cache eviction                                                                                              | Open ([vite-task#251][vt-251])                                                                                  |
| `dependsOn` object form can't bridge packages lacking the task                                                 | Open ([vite-task#738][vt-738])                                                                                  |
| No changed-since / `--affected` filters                                                                        | Open ([vite-plus#2903][vp-2903])                                                                                |
| No dedicated task-config file; tasks live per package in `vite.config.ts`                                      | Open request ([vite-plus#1494][vp-1494])                                                                        |
| `vp lint` via `vp run` failing with tsgolint `spawnSync EINVAL` (Docker repro)                                 | Open ([vite-task#499][vt-499])                                                                                  |
| Run several different tasks in one graph (`run-many`)                                                          | Open RFC ([vite-task#388][vt-388])                                                                              |
| Nested lint/fmt configs not applied per file                                                                   | By design for now; feedback in [discussion #2669][vp-2669]                                                      |
| `vp migrate` skips package-level ESLint; misses non-`.github` composite actions; check-vs-write script rewrite | Observed (E4); general tracker [vite-plus#2037][vp-2037]                                                        |
| Oxfmt: no `package.json#prettier` field, no Prettier plugins, ianvs `importOrder` not translatable             | [unsupported-features.md][oxfmt-unsupported]; E3                                                                |
| Type-aware lint needs TS 7 tsconfig semantics; JS plugins alpha; `typeCheck` experimental                      | [type-aware.md][oxlint-typeaware]; [js-plugins.md][oxlint-jsplugins]; E5                                        |
| Renovate splits `vite-plus` / core-alias bumps                                                                 | Open ([vite-plus#2356][vp-2356])                                                                                |

---

## Turborepo → Vite+ mapping table

Confidence: **High** = documented and confirmed by an experiment here. **Med** = documented, not exercised on this repo. **Low** = inference, workaround, or no equivalent.

| Current usage (file:line)                                                                                  | Vite+ equivalent                                                                                                                                                                                                             | Confidence                                     | Source                                                                                  |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| `"build": "turbo run build"` (`package.json:10`)                                                           | `"build": "vp run -r build"`; self-recursion is pruned. Packages need `vite.config.ts` tasks for `^build` ordering and caching.                                                                                              | High                                           | [run.md L175–183, L288–302][vp-run-compound]; E6                                        |
| `"clean:workspaces": "turbo run clean"` (`package.json:12`) + `//#clean` (`turbo.json:32-34`)              | `vp run -r clean` (root `clean` is included in `-r`); `vp run -w clean` for the root only. Scripts are uncached by default.                                                                                                  | Med                                            | [run.md L175–229][vp-run-filter]; E6 (root included in `-r`)                            |
| `"db:push": "turbo -F @acme/db push"` (`package.json:14`), `push` `interactive` (`turbo.json:35-38`)       | `vp run @acme/db#push`; uncached and `interleaved`, so stdin is inherited                                                                                                                                                    | Med                                            | [run.md L167–171][vp-run-filter]; [stdio.md L69–82][vt-stdio]                           |
| `"db:studio"` (`package.json:15`), `studio` `persistent` (`turbo.json:39-42`)                              | `vp run @acme/db#studio`; no `persistent` flag, not needed for a single task                                                                                                                                                 | Med                                            | [user.rs][vt-user-task]; [vite-task#416][vt-416]                                        |
| `"dev": "turbo watch dev --continue"` (`package.json:16`)                                                  | **No watch, no `--continue`.** Closest: `vp run -r dev` (ordered, limit 4) or `vp run -r --parallel dev` (unordered). Package `dev` = `tsc` would not re-run on change.                                                      | Low                                            | [vite-task#276][vt-276]; [concurrency.md][vt-concurrency]; [cancellation.md][vt-cancel] |
| `"dev:next": "turbo watch dev -F @acme/nextjs..."` (`package.json:17`)                                     | `vp run --filter "@acme/nextjs..." dev` (no watch)                                                                                                                                                                           | Med (filter High)                              | [run.md L195–221][vp-run-filter]; E8                                                    |
| `format`/`format:fix` with `--continue -- --cache --cache-location …` (`package.json:18-19`)               | `vp fmt --check` / `vp fmt` once at the root, or `vp run -r format`. No `--continue`. No oxfmt cache flag; use the `vp run` task cache instead.                                                                              | Med                                            | [fmt.md][vp-fmt]; [oxfmt CLI][oxfmt-cli]; E5                                            |
| `lint`/`lint:fix` with `--continue -- --cache --cache-location …` (`package.json:20-21`)                   | `vp lint` / `vp lint --fix` once at the root with `lint.overrides`, or per-package tasks. Args after the task name reach every `-r` task.                                                                                    | Med                                            | [lint.md][vp-lint]; [monorepo.md][vp-monorepo]; E8                                      |
| `lint:ws` / `postinstall` sherif (`package.json:22-23`)                                                    | Unchanged (`pnpm dlx`) or `vp dlx sherif@latest`. Watch for unsorted deps after migrate.                                                                                                                                     | High (E5)                                      | [README CLI][vp-readme-cli]; E5                                                         |
| `"typecheck": "turbo run typecheck"` (`package.json:24`)                                                   | `vp run -r typecheck` with per-package tasks (`dependsOn` build, tsbuildinfo input exclusion), **or** `vp check` with `typeAware`+`typeCheck` (TS 7 semantics; 8 TS-6.0-default errors today)                                | Med                                            | [config/run.md L245–265][vp-cfg-run-input]; [check.md][vp-check]; E5, E6                |
| `"ui-add": "turbo run ui-add"` (`package.json:25`), `interactive` (`turbo.json:43-46`)                     | `vp run @acme/ui#ui-add` (uncached, so stdin is inherited)                                                                                                                                                                   | Med                                            | [stdio.md][vt-stdio]                                                                    |
| `@turbo/gen` + `turbo/generators/*` (`package.json:31`)                                                    | `vp create vite:generator` (Bingo) + `create.templates`; templates must be rewritten                                                                                                                                         | Low                                            | [create.md L108–196][vp-create-gen]                                                     |
| `turbo` devDep (`package.json:34`); `pnpm add -g turbo` (`tooling/github/setup/action.yml:13`)             | `vite-plus` devDep (catalog) + `setup-vp` action                                                                                                                                                                             | High                                           | [migrate-rules.md][vp-mig-deps]; [ci.md][vp-ci]; E4                                     |
| `"ui": "tui"` (`turbo.json:3`)                                                                             | No TUI; `--log interleaved\|labeled\|grouped`                                                                                                                                                                                | High (absent from `vp run --help`)             | [stdio.md L5–15][vt-stdio]                                                              |
| `topo` + `dependsOn: ["^topo"]` (`turbo.json:5-7,22,26`)                                                   | No equivalent concept. Automatic input tracking fingerprints files a task reads, possibly including dependency sources (unverified).                                                                                         | Low                                            | [automatic-data-tracking.md][vp-adt]                                                    |
| `build`: `dependsOn ["^build"]`, `outputs [".cache/tsbuildinfo.json","dist/**"]` (`turbo.json:8-11`)       | Per package: `run.tasks.build = { command: 'tsc', dependsOn: [{ task: 'build', from: 'dependencies' }], cache: { input: [{auto:true}, '!.cache/tsbuildinfo.json'] } }`. Outputs are auto-tracked or set with `cache.output`. | High (mechanism) / Med (exact config untested) | [config/run.md][vp-cfg-run]; E6                                                         |
| `dev`: `^dev`, `cache:false`, `persistent:false` (`turbo.json:12-16`)                                      | Scripts are uncached by default (or task `cache:false`); `dependsOn` object form for `^dev`                                                                                                                                  | Med                                            | [cache.md L23–44][vp-cache-when]                                                        |
| `format` `outputs` + `outputLogs: "new-only"` (`turbo.json:17-20`)                                         | No `outputLogs`; cache hits replay full logs                                                                                                                                                                                 | High (schema)                                  | [user.rs][vt-user-task]                                                                 |
| `lint`: `^topo`,`^build`, outputs `.eslintcache` (`turbo.json:21-24`)                                      | Task `dependsOn: [{task:'build', from:'dependencies'}]`; cache via task fingerprint                                                                                                                                          | Med                                            | [config/run.md][vp-cfg-run-deps]                                                        |
| `typecheck`: `^topo`,`^build`, outputs tsbuildinfo (`turbo.json:25-28`)                                    | As `build`; tsbuildinfo must be excluded from inputs or the task never caches                                                                                                                                                | High                                           | E6; [config/run.md L260][vp-cfg-run-input]                                              |
| `clean` `cache:false` (`turbo.json:29-31`)                                                                 | Default for scripts                                                                                                                                                                                                          | High                                           | [cache.md][vp-cache-when]                                                               |
| `globalEnv` (`turbo.json:48-55`)                                                                           | **No global list.** Per-task `cache.env`. Cached tasks don't see undeclared vars (POSTGRES_URL stripped in E7).                                                                                                              | High                                           | [config/run.md L189–214][vp-cfg-run-env]; E7                                            |
| `globalPassThroughEnv` (`turbo.json:56-63`)                                                                | Per-task `cache.untrackedEnv`. Defaults cover `CI`, `VERCEL`, `VERCEL_*` but not `NODE_ENV`; `npm_lifecycle_event` is never set by `vp run`.                                                                                 | High                                           | [DEFAULT_UNTRACKED_ENV][vt-default-env]; E7                                             |
| Package `turbo.json` `extends: ["//"]` (`apps/*/turbo.json:3`)                                             | Per-package `vite.config.ts` `run.tasks`; share via JS import                                                                                                                                                                | Med                                            | [lib.rs L284–316][vt-lib-load]; [vite-plus#1494][vp-1494]                               |
| nextjs build `outputs: [".next/**","!.next/cache/**","next-env.d.ts"]` (`apps/nextjs/turbo.json:5-8`)      | `cache.output: ['.next/**','!.next/cache/**','next-env.d.ts']`, or auto write tracking. Cache correctness for `next build` is untested.                                                                                      | Low                                            | [config/run.md L317–381][vp-cfg-run]                                                    |
| tanstack build `outputs: [".nitro/**",".output/**",".tanstack/**"]` (`apps/tanstack-start/turbo.json:5-8`) | `vp build` reports `dist/**`-style outputs itself; nitro's `.output` is not documented as covered, so list it in `cache.output`                                                                                              | Low                                            | [automatic-data-tracking.md L108–138][vp-adt-coop]                                      |
| `dev` `persistent` (nextjs, tanstack) / `persistent`+`interactive` (expo) (`apps/*/turbo.json`)            | No flags; `--parallel` for servers; stdin inheritance only for uncached interleaved tasks                                                                                                                                    | Low                                            | [concurrency.md][vt-concurrency]; [stdio.md][vt-stdio]                                  |
| CI `TURBO_TEAM`/`TURBO_TOKEN` remote cache (`.github/workflows/ci.yml:14-19`)                              | **None in vp 1.1.0**; experimental `actions/cache` of `node_modules/.vite/task-cache`                                                                                                                                        | High                                           | [github-actions-cache.md][vp-gha-cache]; [vt compare][vt-compare]                       |
| CI jobs `pnpm lint && pnpm lint:ws`, `pnpm format`, `pnpm typecheck` (`ci.yml:35,46,57`)                   | `vp check` (fmt + lint + type check) or `vp run …` per job after `setup-vp`                                                                                                                                                  | Med                                            | [ci.md L15–29][vp-ci]; [check.md][vp-check]                                             |
| `eslint-plugin-turbo` (`tooling/eslint/base.ts:5,47,56`)                                                   | Drop (Turbo removed). Alpha JS plugin is possible but pointless without `turbo.json`.                                                                                                                                        | Low                                            | E1/E2; [js-plugins.md][oxlint-jsplugins]                                                |

---

## Experiments (run on throwaway clones)

All runs were on clones of this repo at `8f945b7` in `/tmp/vpresearch/work`, using global `vp` 1.1.0 and Node 24.21.0 on macOS, on 2026-10-07.

- **E1** `pnpm dlx @oxlint/migrate@1.87.0 eslint.config.ts --type-aware --details [--js-plugins=false]` in `apps/nextjs`, then a comparison with `eslint --print-config src/app/page.tsx`. Results: 164/165 rules. Skipped: nursery `no-undef`, `@typescript-eslint/prefer-optional-chain`, `@typescript-eslint/no-unnecessary-condition`; unsupported `no-dupe-args`, `no-octal`, `react-hooks/component-hook-factories|config|gating`; JS plugin `turbo/no-undeclared-env-vars`. 155 rules active in ESLint, 6 without an active Oxlint counterpart (`no-undef`/`no-dupe-args` are already off for TS files).
- **E2** `oxlint@1.87.0` + `oxlint-tsgolint@7.0.2003 --type-aware` with the E1 config: "Found 0 warnings and 0 errors … 11 files with 164 rules". A probe file triggered `typescript(no-floating-promises)` and `eslint(no-restricted-properties)`. The JS-plugin variant failed with `Cannot find module 'eslint-plugin-turbo'`.
- **E3** `oxfmt@0.72.0 --migrate=prettier` at the root, then `oxfmt --check .` (5/131 files differ). A hand-written `sortImports` approximation gave 18 differing files.
- **E4** `vp migrate --no-interactive --no-agent --no-editor --no-hooks`. The output and diff are summarised in §7.
- **E5** On the E4 clone, `pnpm install --config.minimum-release-age=0` (sherif postinstall failed), then:
  - `vp fmt --check .`: 6 files
  - `vp lint`: 10 errors / 2 warnings, all from the type checker (8 from TS 6.0 defaults, 2 TS2307 for the removed `prettier`)
  - `vp build` in `apps/tanstack-start`: success on vite-plus-core 1.1.0
- **E6** On a fresh clone, global `vp run -r --cache build`: the three `tsc` builds were "Not cached: read and wrote … tsbuildinfo.json". `@acme/nextjs#build` failed env validation. The same failure occurs with plain `pnpm -F @acme/nextjs build` because `.env.example` has empty `AUTH_DISCORD_*`, so it is not vp-specific. The root `turbo run build` and the tanstack build were then killed (exit 137).
- **E7** A probe script printing `npm_lifecycle_event`, `POSTGRES_URL` and `CI`:

  | Runner              | `npm_lifecycle_event` | `POSTGRES_URL` |
  | ------------------- | --------------------- | -------------- |
  | `vp run` (uncached) | `null`                | set            |
  | `vp run --cache`    | `null`                | unset          |
  | `pnpm`              | `"probe"`             | set            |

- **E8** `vp run -r argprobe --fix --cache-location x`: both packages received `--fix --cache-location x`. `--filter "@acme/nextjs..."` selected the workspace dependencies of `@acme/nextjs`.

---

## Open questions (need a human decision or a test)

1. **Dev workflow without watch.** Is `vp run -r --parallel dev` acceptable, given no ordering and package `tsc` declarations not rebuilt on change? Or keep `turbo watch` for dev only until vite-task#276 lands? Alternatively, switch package `dev` scripts to `tsc --watch`, with each one holding a concurrency slot.
2. **Expo interactivity.** Test whether `expo start` keyboard shortcuts work under `vp run` when other uncached tasks run at the same time. The docs only say uncached interleaved tasks inherit stdin.
3. **Remote cache.** Accept local cache plus the experimental GitHub Actions cache, wait for vite-task remote cache to ship in a vp release, or keep Turborepo just for CI caching?
4. **Where task definitions live.** Should every package get a `vite.config.ts` (including Next.js and Expo apps) just for `run.tasks`, or should most scripts stay uncached and only `build`/`typecheck` get tasks? Check whether adding `vite.config.ts` to the Next/Expo apps changes `vp dev`/`vp build` package auto-selection ([monorepo.md L154–208][vp-monorepo-app]).
5. **TypeScript 7 adoption.** `vp check`/type-aware lint need TS 6/7 tsconfig semantics: `rootDir`, `types: ["node"]`, and CSS side-effect import declarations (E5). Do that first, or run `vp lint` without `typeCheck` and keep `tsc` 5.9 for typecheck in the meantime?
6. **Lint parity tolerance.** Is it acceptable to lose or downgrade `no-unnecessary-condition` and `prefer-optional-chain` (nursery, opt in with risk), the three React-Compiler config rules, and `turbo/no-undeclared-env-vars`? Should the dormant `eslint-plugin-react` recommended set be restored as `react/*` rules, given that today's config silently disables it?
7. **Import order.** Accept Oxfmt's perfectionist-style `sortImports` and a one-time reorder (at least 18 files), or keep Prettier only for import sorting? Oxfmt cannot run Prettier plugins.
8. **`skipValidation` env check.** The `env.ts` files key on `npm_lifecycle_event === "lint"`. Replace it (e.g. with an explicit `SKIP_ENV_VALIDATION`), or keep running lint through `pnpm`? Also decide which variables (`POSTGRES_URL`, `AUTH_*`, `NODE_ENV`, `PORT`) need `cache.env`/`untrackedEnv` on each cached task.
9. **Vite 8 for TanStack Start.** `vp build` worked, but the pinned nitro alpha, `@vitejs/plugin-react` 5.1.0 and `@tailwindcss/vite` 4.1.16 don't declare Vite 8 support. Test `vp dev` and SSR at runtime, and decide whether to bump those packages first.
10. **Next.js build caching.** Is caching `next build` through `vp run` (auto output tracking vs explicit `.next/**`) correct? This is untested, and the Next.js docs say nothing about external task caches.
11. **Generator.** Port the Plop generator to Bingo via `vp create vite:generator`, keep `@turbo/gen` standalone (it doesn't need the turbo task runner, though that wasn't verified), or drop it?
12. **Migration order.** `vp migrate` does Prettier → Oxfmt and the deps, but not ESLint (no root config) and not Turbo. Decide whether to first consolidate ESLint into a root config so `vp migrate` can run `@oxlint/migrate`, or hand-write `lint.overrides`. Then fix the gaps E4 exposed: the `tooling/github/setup/action.yml` `.nvmrc` reference, the `ui-add` write→check change, the package-level `"prettier"` fields, sherif ordering, and the `vp start` script.
13. **`--continue` semantics in CI.** With fast-fail, one failing package hides the others' results. Is a single root `vp lint`/`vp fmt --check` (one process, so no fan-out) enough, or do separate per-package results matter?

---

<!-- Reference links -->

[vp-commit]: https://github.com/voidzero-dev/vite-plus/tree/b5efee3f3177de49610b941139f05a06819bb4f7
[vt-commit]: https://github.com/voidzero-dev/vite-task/tree/7d69d6577ecf6bd83deee32186de59918a712873
[oxc-commit]: https://github.com/oxc-project/website/tree/68526937f70fd8a6a4a18515bfdfca8575da0464
[next-commit]: https://github.com/vercel/next.js/tree/eeb353be511a223f41a9d8b517f685b14cfc4bb0/docs
[expo-commit]: https://github.com/expo/expo/tree/cb8816445143274175f50ef177224c29ea458ad6/docs/pages
[vp-readme]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/README.md#L14-L30
[vp-readme-cli]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/README.md#L100-L154
[vp-rel-100]: https://github.com/voidzero-dev/vite-plus/releases/tag/v1.0.0
[vp-rel-110]: https://github.com/voidzero-dev/vite-plus/releases/tag/v1.1.0
[vp-2405]: https://github.com/voidzero-dev/vite-plus/issues/2405
[vp-cfg-index]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/config/index.md#L1-L48
[vp-run-builtin]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/guide/run.md#L41-L54
[vp-run-taskdef]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/guide/run.md#L85-L118
[vp-run-deps]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/guide/run.md#L120-L156
[vp-run-filter]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/guide/run.md#L158-L229
[vp-run-compound]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/guide/run.md#L231-L302
[vp-run-conc]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/guide/run.md#L339-L365
[vp-cfg-run]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/config/run.md
[vp-cfg-run-deps]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/config/run.md#L118-L155
[vp-cfg-run-env]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/config/run.md#L189-L243
[vp-cfg-run-input]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/config/run.md#L245-L265
[vp-cache-when]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/guide/cache.md#L23-L44
[vp-cache-env]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/guide/cache.md#L67-L111
[vp-adt]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/guide/automatic-data-tracking.md#L9-L50
[vp-adt-coop]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/guide/automatic-data-tracking.md#L108-L138
[vp-monorepo]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/guide/monorepo.md#L7-L66
[vp-monorepo-app]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/guide/monorepo.md#L154-L208
[vp-lint]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/guide/lint.md#L19-L52
[vp-lint-js]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/guide/lint.md#L54-L107
[vp-fmt]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/guide/fmt.md#L7-L27
[vp-check]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/guide/check.md#L7-L11
[vp-trouble-nested]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/guide/troubleshooting.md#L27-L37
[vp-trouble-lazy]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/guide/troubleshooting.md#L89-L115
[vp-2669]: https://github.com/voidzero-dev/vite-plus/discussions/2669
[vp-pack]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/guide/pack.md#L7-L42
[vp-create-gen]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/guide/create.md#L108-L196
[vp-cfg-create]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/config/create.md
[vp-rfc-codegen]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/rfcs/code-generator.md
[vp-migrate]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/guide/migrate.md#L23-L82
[vp-mig-deps]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/guide/migrate-rules.md#L97-L134
[vp-mig-scripts]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/guide/migrate-rules.md#L227-L252
[vp-mig-ci]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/guide/migrate-rules.md#L254-L263
[vp-mig-node]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/guide/migrate-rules.md#L258-L263
[vp-eslint-root]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/packages/cli/src/migration/migrator/eslint.ts#L225-L316
[vp-eslint-warn]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/packages/cli/src/migration/migrator/eslint.ts#L937
[vp-ci]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/guide/ci.md
[vp-gha-cache]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/guide/github-actions-cache.md
[vp-gha-cache-evict]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/docs/guide/github-actions-cache.md#L155-L167
[vp-e2e]: https://github.com/voidzero-dev/vite-plus/blob/b5efee3f3177de49610b941139f05a06819bb4f7/.github/workflows/e2e-test.yml#L194-L450
[vp-1494]: https://github.com/voidzero-dev/vite-plus/issues/1494
[vp-1391]: https://github.com/voidzero-dev/vite-plus/issues/1391
[vp-1835]: https://github.com/voidzero-dev/vite-plus/issues/1835
[vp-2037]: https://github.com/voidzero-dev/vite-plus/issues/2037
[vp-2356]: https://github.com/voidzero-dev/vite-plus/issues/2356
[vp-2903]: https://github.com/voidzero-dev/vite-plus/issues/2903
[setup-vp]: https://github.com/voidzero-dev/setup-vp/blob/v1.21.1/action.yml
[vt-readme]: https://github.com/voidzero-dev/vite-task/blob/7d69d6577ecf6bd83deee32186de59918a712873/README.md
[vt-user-task]: https://github.com/voidzero-dev/vite-task/blob/7d69d6577ecf6bd83deee32186de59918a712873/crates/vt_graph/src/config/user.rs#L241-L321
[vt-lib-load]: https://github.com/voidzero-dev/vite-task/blob/7d69d6577ecf6bd83deee32186de59918a712873/crates/vt_graph/src/lib.rs#L284-L316
[vt-default-env]: https://github.com/voidzero-dev/vite-task/blob/7d69d6577ecf6bd83deee32186de59918a712873/crates/vt_graph/src/config/mod.rs#L396-L482
[vt-plan-env]: https://github.com/voidzero-dev/vite-task/blob/7d69d6577ecf6bd83deee32186de59918a712873/crates/vt_plan/src/plan.rs#L609-L620
[vt-cancel]: https://github.com/voidzero-dev/vite-task/blob/7d69d6577ecf6bd83deee32186de59918a712873/docs/cancellation.md#L13-L19
[vt-concurrency]: https://github.com/voidzero-dev/vite-task/blob/7d69d6577ecf6bd83deee32186de59918a712873/docs/concurrency.md
[vt-stdio]: https://github.com/voidzero-dev/vite-task/blob/7d69d6577ecf6bd83deee32186de59918a712873/docs/stdio.md#L69-L82
[vt-changelog]: https://github.com/voidzero-dev/vite-task/blob/main/CHANGELOG.md
[vt-compare]: https://github.com/voidzero-dev/vite-task/compare/7d69d6577ecf6bd83deee32186de59918a712873...main
[vt-206]: https://github.com/voidzero-dev/vite-task/issues/206
[vt-251]: https://github.com/voidzero-dev/vite-task/issues/251
[vt-276]: https://github.com/voidzero-dev/vite-task/issues/276
[vt-388]: https://github.com/voidzero-dev/vite-task/issues/388
[vt-416]: https://github.com/voidzero-dev/vite-task/issues/416
[vt-499]: https://github.com/voidzero-dev/vite-task/issues/499
[vt-738]: https://github.com/voidzero-dev/vite-task/issues/738
[vt-768]: https://github.com/voidzero-dev/vite-task/issues/768
[vt-778]: https://github.com/voidzero-dev/vite-task/issues/778
[vt-779]: https://github.com/voidzero-dev/vite-task/issues/779
[vt-781]: https://github.com/voidzero-dev/vite-task/issues/781
[oxlint-typeaware]: https://github.com/oxc-project/website/blob/68526937f70fd8a6a4a18515bfdfca8575da0464/src/docs/guide/usage/linter/type-aware.md#L260-L275
[oxlint-jsplugins]: https://github.com/oxc-project/website/blob/68526937f70fd8a6a4a18515bfdfca8575da0464/src/docs/guide/usage/linter/js-plugins.md#L160-L165
[oxlint-opts]: https://github.com/oxc-project/website/blob/68526937f70fd8a6a4a18515bfdfca8575da0464/src/docs/guide/usage/linter/generated-config.md#L372-L408
[oxlint-ignore]: https://github.com/oxc-project/website/blob/68526937f70fd8a6a4a18515bfdfca8575da0464/src/docs/guide/usage/linter/ignore-files.md#L13-L23
[oxlint-nuc]: https://github.com/oxc-project/website/blob/68526937f70fd8a6a4a18515bfdfca8575da0464/src/docs/guide/usage/linter/rules/typescript/no-unnecessary-condition.md
[oxlint-import-cts]: https://github.com/oxc-project/website/blob/68526937f70fd8a6a4a18515bfdfca8575da0464/src/docs/guide/usage/linter/rules/import/consistent-type-specifier-style.md
[oxfmt-migrate]: https://github.com/oxc-project/website/blob/68526937f70fd8a6a4a18515bfdfca8575da0464/src/docs/guide/usage/formatter/migrate-from-prettier.md#L51-L116
[oxfmt-unsupported]: https://github.com/oxc-project/website/blob/68526937f70fd8a6a4a18515bfdfca8575da0464/src/docs/guide/usage/formatter/unsupported-features.md#L11-L36
[oxfmt-sorting]: https://github.com/oxc-project/website/blob/68526937f70fd8a6a4a18515bfdfca8575da0464/src/docs/guide/usage/formatter/sorting.md#L15-L196
[oxfmt-cfg-sortimports]: https://github.com/oxc-project/website/blob/68526937f70fd8a6a4a18515bfdfca8575da0464/src/docs/guide/usage/formatter/generated-config.md#L331-L540
[oxfmt-cli]: https://github.com/oxc-project/website/blob/68526937f70fd8a6a4a18515bfdfca8575da0464/src/docs/guide/usage/formatter/generated-cli.md#L22-L39
[ts6]: https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/
[next-16]: https://github.com/vercel/next.js/blob/eeb353be511a223f41a9d8b517f685b14cfc4bb0/docs/01-app/02-guides/upgrading/version-16.mdx#L102-L154
[next-16-lint]: https://github.com/vercel/next.js/blob/eeb353be511a223f41a9d8b517f685b14cfc4bb0/docs/01-app/02-guides/upgrading/version-16.mdx#L1060-L1068
[next-install]: https://github.com/vercel/next.js/blob/eeb353be511a223f41a9d8b517f685b14cfc4bb0/docs/01-app/01-getting-started/01-installation.mdx#L387-L406
[next-vitest]: https://github.com/vercel/next.js/blob/eeb353be511a223f41a9d8b517f685b14cfc4bb0/docs/01-app/02-guides/testing/vitest.mdx
[expo-monorepo]: https://github.com/expo/expo/blob/cb8816445143274175f50ef177224c29ea458ad6/docs/pages/guides/monorepos.mdx#L9-L26
[expo-eslint]: https://github.com/expo/expo/blob/cb8816445143274175f50ef177224c29ea458ad6/docs/pages/guides/using-eslint.mdx#L22
[expo-jest]: https://github.com/expo/expo/blob/cb8816445143274175f50ef177224c29ea458ad6/docs/pages/develop/unit-testing.mdx#L2-L23
[turbo-watch]: https://turborepo.dev/docs/reference/watch
