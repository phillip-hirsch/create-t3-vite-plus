# Coding standards

Judgement calls for writing and reviewing changes. `vp lint` and `vp fmt` enforce the rules in the root `vite.config.ts`, so this file holds only what tooling can't check. Each rule says what to look for in a diff. A hunk that breaks a rule is a finding unless the diff gives a reason the rule doesn't fit.

## Prove env-dependent behaviour against the built Worker

Any behaviour that depends on runtime mode or env, in our code or a dependency's, has to be shown working against the web app's built Worker, not only under `vp dev`. Proof, against a fresh `vp build` of the change, is either of:

- a test in the smoke suite (`apps/tanstack-start/smoke/`), which runs `vp preview` on that build;
- a `vp preview` check, recorded in the PR description.

In a diff, look for:

- reads of `NODE_ENV`, `import.meta.env`, `process.env` or a binding, including new variables in an `env.ts`;
- a dependency added or upgraded whose behaviour switches on mode or env, such as auth, logging, error pages or rate limiting;
- changes to the bindings in `cloudflare.config.ts` or to build-mode config.

Why: in the built Worker, `process.env` holds only the Worker's bindings. Vite inlines the env reads it can see at build time, but a dependency that reads env at runtime gets only the bindings. `vp dev` can't reveal the gap, because it runs in development mode, where development defaults are correct. On PR #19, the implementer, three audit rounds and both `/code-review` reviewers missed one such read, because every check ran under `vp dev`. [ADR 0002](docs/adr/0002-cloudflare-workers-and-d1.md) records it and the fix.

## Keep types precise

Lint rejects `any`, `unknown` contracts, loose dictionaries and casts without a `SAFETY:` comment. What it can't judge is whether the escape hatch was needed. In a diff, look for:

- a `SAFETY:` comment whose invariant the code doesn't guarantee, or a cast that a precise type, or a parser at the I/O boundary, would remove;
- a value whose type is known, such as a call result, stored or passed as `unknown`, `object` or a loose dictionary, which lint catches only for some values, such as literals;
- a lint-disable comment for a type rule that doesn't say why no precise type works.

## Choose the simplest change

The simplest change that meets the issue wins. When a hunk could be shorter, or could use something the repo, a dependency or the platform already provides, name the simpler version in the finding.

## Run tools through Vite+ and pnpm

Repo tasks, package scripts, one-off packages and installs run through `vp` (`vp run`, `vp dlx`, `vp install`), with pnpm as the package manager behind it ([ADR 0001](docs/adr/0001-vite-plus-replaces-turborepo.md)), and `yarn` or `npx` for any of them is a finding. Calling a tool's own CLI directly, such as `node`, `expo`, `git` or `cf`, is fine.

## Use the `cf` CLI for Cloudflare

Cloudflare commands use the `cf` CLI, and Worker config lives in `cloudflare.config.ts` ([ADR 0002](docs/adr/0002-cloudflare-workers-and-d1.md)). A `wrangler` command or `wrangler.*` config file is a finding. `cf` subcommands differ from Wrangler's, so check a new one against `cf --help`.
