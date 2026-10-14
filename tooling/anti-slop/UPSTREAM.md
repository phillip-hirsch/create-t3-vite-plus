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
- `shared/dictionary-types.ts`: `aliasSubstitution` resolves explicit type
  arguments in the caller's scope instead of the alias's own, as
  `aliasSubstitutions` in `shared/type-alias-resolution.ts` does. Before,
  `type Wrap<T> = Pair<unknown, T>` with `type Pair<T, U> = Record<string, U>`
  made `Wrap<string>` an `unknown` dictionary in `no-unsafe-dictionary-type`
  and `no-known-value-widening`.
- `vendor/eslint-stylistic/UPSTREAM.md` names this repository's checks, and
  says the rule tests weren't vendored.

## Known limitations

- `shared/dictionary-types.ts` substitutes type nodes without their scope. A
  generic alias whose body passes its own parameter to another alias that has
  an earlier parameter of the same name, like `Wrap` above, is still reported
  where it is declared. Rename the parameter until substitutions carry their
  scope, as in `shared/type-alias-resolution.ts`.
