# Vite+ replaces Turborepo; no Next.js; diverge from upstream

This repo exists to be a T3 starter built on Vite+, so Vite+ is the whole toolchain: `vp run` replaces Turborepo, `vp lint` (Oxlint) replaces ESLint, `vp fmt` (Oxfmt) replaces Prettier. Next.js can never build on Vite, so it is dropped and TanStack Start is the web app (and the mobile app's API server). Rewriting every tooling file makes upstream `create-t3-turbo` merges impractical, so the fork diverges; upstream fixes are ported by hand when they matter.

## Consequences

- No watch mode in `vp run`. Avoided rather than worked around: internal packages expose their source as `types`, so nothing needs rebuilding during dev.
- No remote task cache (unreleased in Vite+ 1.1). CI caches only the pnpm store.
- Lint parity loses `no-unnecessary-condition`, `prefer-optional-chain`, `no-octal`, the React Compiler config rules and `eslint-plugin-turbo`.
- Oxfmt's import sorting replaces the `@ianvs` Prettier plugin's ordering.
- The `turbo gen` package generator is ported to `vp create`.
