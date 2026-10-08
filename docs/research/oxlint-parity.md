# Oxlint parity with the ESLint baseline (#7)

Compares type-aware `vp lint` with `docs/research/eslint-baseline.txt` from #2.

## Output

Run from the repo root with Vite+ 1.1.0 (Oxlint 1.87.0, tsgolint 7.0.2003) on Node 22.23.3, without `.env` or `SKIP_ENV_VALIDATION`:

```
$ vp lint --format default
Found 0 warnings and 0 errors.
Finished in 1.0s on 45 files with 159 rules using 12 threads.
```

The ESLint baseline also had zero findings, so no finding appears or disappears. `vp lint --type-check` reports nothing either.

## Rules

The rule list comes from `@oxlint/migrate@1.87.0 --type-aware` run on each old package config. The 159 rules in `vite.config.ts` are exactly the active rules it produced across the web app, the mobile app, and the `api`, `auth` and `ui` packages. Severities and options carry over: `no-unused-vars` ignore patterns, `consistent-type-imports` as a warning, `no-misused-promises` with `checksVoidReturn.attributes: false`, and `import/consistent-type-specifier-style`. `categories.correctness` is off, so Oxlint adds no rules of its own.

- Base rules apply everywhere. The 16 `eslint:recommended` rules that typescript-eslint turns off for TS files stay limited to `**/*.js`.
- The React and React Hooks rules apply to `apps/**` and `packages/ui/**`.
- The `process.env` restriction applies to the web app and `packages/auth`, except `env.ts`.
- Probes confirmed `no-floating-promises`, `jsx-key`, `no-restricted-properties` (web app only) and unused-disable-directive reports. Existing `eslint-disable` comments still apply.

ESLint rules without an Oxlint equivalent:

| ESLint rule                                                                               | Why it is not ported                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@typescript-eslint/no-unnecessary-condition`, `@typescript-eslint/prefer-optional-chain` | Accepted loss: nursery only                                                                                                                                                                                                                      |
| `no-octal`                                                                                | Accepted loss: strict mode makes octal literals a syntax error                                                                                                                                                                                   |
| `react-hooks/config`, `react-hooks/gating`                                                | Accepted loss: React Compiler config rules                                                                                                                                                                                                       |
| `turbo/no-undeclared-env-vars`                                                            | Accepted loss: Turborepo is gone. Its last two findings were turbo.json errors after #6 removed turbo.json (`NODE_ENV` in `apps/expo/src/utils/api.tsx`, `PORT` in `apps/tanstack-start/src/lib/url.ts`)                                         |
| `react-hooks/component-hook-factories`                                                    | Deprecated upstream; folded into `react/static-components`, which is on                                                                                                                                                                          |
| `react/jsx-uses-vars`                                                                     | `no-unused-vars` already counts JSX usage                                                                                                                                                                                                        |
| `react/prop-types`                                                                        | TypeScript checks props                                                                                                                                                                                                                          |
| `react/no-deprecated`                                                                     | React 19's types drop the APIs it flags (`render`, `findDOMNode`, …), and the repo has no class components. The suggested replacement, `typescript/no-deprecated`, is broader and would be a new rule; it flags `SafeAreaView` in the mobile app |
| `react/require-render-return`                                                             | Nursery only; the repo has no class components                                                                                                                                                                                                   |
| `no-undef`, `no-dupe-args`                                                                | Off for TS files under typescript-eslint. For `.js` files, `tsc` with `checkJs` reports undefined names, and duplicate args are a syntax error in ES modules                                                                                     |

## Files

Both linters skip `.gitignore`d files, `**/*.config.*` and `packages/auth/script/**`. Differences:

- Now linted: `apps/tanstack-start/src/env.ts`, `packages/auth/env.ts` (ESLint ignored them globally to exempt them from the `process.env` rule) and `tooling/prettier/index.js` (had no `lint` script). None has findings.
- Not linted: `turbo/**`, the legacy generator. ESLint never linted it. It has no tsconfig, and Oxlint reports 10 `no-unsafe-*`/`require-await` findings there.
