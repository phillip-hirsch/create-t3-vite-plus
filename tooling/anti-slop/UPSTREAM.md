# Upstream

Vendored copy of the anti-slop Oxlint plugins. This repository owns these
files: change rules to fit the project and record deviations below.

- Source: https://github.com/dmmulroy/anti-slop
- Commit: `13909c9e07590f5a85d93c62712259fe14a883f7`
- Copied from: `skills/install-anti-slop/assets/anti-slop/` (identical to
  `src/` at that commit, minus the rule tests)
- Installed at: `tooling/anti-slop/` (generic plugin `index.ts`, Effect plugin
  `effect/index.ts`)

## Deviations

- Installed under `tooling/` instead of upstream's suggested
  `tools/oxlint/anti-slop/`, to match the repository layout.
- `@oxlint/plugins` is pinned to 1.87.0 (upstream: 1.78.0) to match the oxlint
  bundled with `vite-plus`.
- The Effect plugin is copied but not registered, because no package depends on
  `effect` directly.
