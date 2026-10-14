# Research: upgrading the mobile app from Expo SDK 54 to the latest SDK

Researched 2026-10-09. Expo ships an SDK every few months and patches each one weekly, so every claim is pinned to a version, commit or date:

| Source                                                                    | Version / commit                                                                                                            | Date       |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------- |
| npm registry (`npm view`), `expo` dist-tags and publish times             | `latest` 57.0.27, `next` 58.0.6, `sdk-54` 54.0.37                                                                           | 2026-10-09 |
| Expo versions API ([`api.expo.dev/v2/versions/latest`][expo-api])         | `expoGoSdkVersion` 57.0.0; per-SDK React/React Native and Expo Go client versions                                           | 2026-10-09 |
| `bundledNativeModules.json` in the `expo` tarball                         | expo 54.0.37, 55.0.31, 56.0.23, 57.0.27, 58.0.6                                                                             | 2026-10-09 |
| Expo changelog posts                                                      | [SDK 55][cl-55] (2026-02-25), [SDK 56][cl-56] (2026-05-21), [SDK 57][cl-57] (2026-06-30), [SDK 58 beta][cl-58] (2026-09-15) | 2026-10-09 |
| Expo docs source                                                          | `expo/expo` `main` [`942561a`][expo-main]                                                                                   | 2026-10-09 |
| Package changelogs (`expo-router`, `expo-status-bar`, other Expo modules) | `expo/expo` `sdk-57` branch [`b4ce18a`][expo-sdk57]                                                                         | 2026-10-09 |
| `@expo/config-types`, `@expo/cli`, `@expo/metro-config` build output      | 54.0.5 / 54.0.27 / 54.0.17 and 57.0.2 / 57.0.28 / 57.0.13 (npm tarballs)                                                    | 2026-10-09 |
| `expo/fyi` iOS scene life cycle guide                                     | [`0561636`][fyi-scene]                                                                                                      | 2026-09-15 |
| React Native blog                                                         | [0.83][rn-083], [0.84][rn-084], [0.85][rn-085] release posts; `react-native` 0.81.5 to 0.88.0-rc.3 tarballs                 | 2026-10-09 |
| Nativewind / react-native-css                                             | [nativewind 5.0.0-rc.0][nw-rc0], [react-native-css 3.1.0-rc.0][rncss-rc0] GitHub releases                                   | 2026-09-13 |
| Legend List                                                               | [`CHANGELOG.md` at `3d80d16`][ll-changelog]; npm 2.0.19 / 3.6.0                                                             | 2026-10-09 |
| Better Auth                                                               | npm 1.4.0-beta.9 / 1.7.7; issues [#10027][ba-10027], [expo/expo#46806][expo-46806]                                          | 2026-10-09 |
| `expo-doctor`                                                             | 1.20.4 (`latest`), 1.21.4 (`next`)                                                                                          | 2026-10-09 |

"Experiment Ex" means a command I ran on a throwaway clone of this repo under `/tmp` (see [Experiments](#experiments-run-on-throwaway-clones)). Nothing in this repo was modified except this file. The repo has one web app (TanStack Start) and one mobile app; the brief's mention of `apps/nextjs` is out of date ([ADR 0001](../adr/0001-vite-plus-replaces-turborepo.md)).

---

## Summary

- **The latest stable SDK is 57, released 2026-06-30. SDK 58 is in beta.** npm's `latest` tag is `expo@57.0.27` and `next` is `58.0.6` ([npm](#source-npm)). The Expo versions API reports `expoGoSdkVersion: 57.0.0` ([expo-api]). The changelog lists SDK 57 on 2026-06-30 and "Expo SDK 58 Beta is now available" on 2026-09-15 ([cl-57], [cl-58]). Between 54 and 57 lie SDK 55 (2026-02-25) and SDK 56 (2026-05-21).
- **Each SDK pins one React Native and one exact React version.** 54 uses RN 0.81.5 and React 19.1.0. 55 uses RN 0.83 and React 19.2.0. 56 uses RN 0.85 and React 19.2.3. 57 uses RN 0.86.3 and React 19.2.3. The 58 beta uses RN 0.88.0-rc.3 and React 19.3.0 ([bundledNativeModules](#sdk-version-map), [expo-api], [versions table][docs-versions]).
- **The shared `react19` catalog must move to React 19.2.3, and the web app moves with it.** `expo-doctor` checks `react`/`react-dom` against an exact version and already flags today's 19.1.4 (E1). Giving the mobile app its own React makes pnpm resolve `react-dom@19.2.3` against `react@19.1.4` inside `packages/ui`, which breaks the workspace typecheck (E2, E3). With one catalog on 19.2.3, all 9 packages typecheck (E4). TanStack Start, TanStack Query, tRPC and Better Auth all accept React 19.x ([peer deps](#third-party-compatibility-at-sdk-57)).
- **Code changes in the app itself are small, because none of the per-hop breaking changes touch code this app uses.** The app uses `Stack`, `Stack.Screen`, `Link asChild`, `useGlobalSearchParams`, `StatusBar` without props and plain RN components (`apps/expo/src/app/*.tsx`). The changes it does need are in config:
  - Remove `newArchEnabled` (`apps/expo/app.config.ts:15`) and `android.edgeToEdgeEnabled` (`:31`). Both left the config schema in SDK 55, and both fail `tsc` on SDK 57 (E3; [cl-55 breaking changes][cl-55-breaking]).
  - Remove `experiments.reactCanary` (`:41`). It is a no-op from SDK 55 and Expo CLI 57 warns about it ([cl-55-breaking], [CLI 57 source][cli57-canary]).
  - Replace `metro.config.js:4,9-13`. It `require`s `metro-cache`, which is not a dependency of the mobile app. Under SDK 57, `expo-doctor` fails its Metro check on that line (E5).
- **Expo removed the Legacy Architecture in SDK 55, and React Native removed it in 0.84.** This app already runs the New Architecture, so the only change is deleting the flag ([cl-55-legacy], [rn-084]).
- **expo-router went from 6.x to 55/56/57 (versions now follow the SDK) with no breaking change this app hits.** SDK 56 forked React Navigation into expo-router, which only affects `@react-navigation/*` imports, and this app has none ([router 55 to 56][router-5556]). `experiments.typedRoutes`, `tsconfigPaths` and `reactCompiler` still exist in the SDK 57 config schema ([config-types 57][ct57]). The larger router rework arrives in SDK 58 ([router 57 to 58][router-5758]).
- **Metro under pnpm needs no `watchFolders` or resolver settings.** Expo has configured monorepos automatically since SDK 52, supported isolated installs since SDK 54, and turned on `autolinkingModuleResolution` for monorepos in SDK 55 ([monorepos.mdx L184-L247][monorepos], [cl-55-breaking]). SDK 56 added an on-demand filesystem that removes the need for `watchFolders` ([cl-56-cli]). The custom `cacheStores` here is the only non-default Metro setting, and it is the one that breaks (E5).
- **Toolchain minimums:** Node `^22.13` for SDK 57 (the repo pins `^22.21.0`, so it passes), Xcode 26.4+, iOS 16.4+, Android 7+ with `compileSdkVersion` 36 ([versions table][docs-versions], [cl-56-tools]). SDK 56 makes Expo's dependency check want TypeScript `~6.0.3` ([cl-56-tools]). The mobile app still needs TypeScript 6 rather than 7, because SDK 55+ transpiles `app.config.ts` with the project's own TypeScript ([cl-55-breaking]).
- **Expo Go: replace the simulator's Expo Go 54 with Expo Go 57.0.9.** Each Expo Go build runs one SDK. The App Store build moved to SDK 57 on 2026-09-03 and will drop SDK 57 shortly after SDK 58 is stable ([cl-go-57], [cl-58]). Simulator builds of any SDK are downloadable, and the login requirement does not apply to simulators ([expo-api], [cl-go-57]). Development builds made with this machine's Xcode 27 need `expo-build-properties` `ios.enableSceneSupport` on SDK 57 ([fyi-scene]).
- **Third-party libraries all have a working version at SDK 57:**
  - Move Nativewind 5 to the `5.0.0-rc.0` + `react-native-css@3.1.0-rc.0` pair, which targets Expo 57.0.22 exactly ([nw-rc0], [rncss-rc0]).
  - Reanimated 4.5.1 and Worklets 0.10.1 are what `expo install --fix` selects, and they declare RN 0.83-0.86 ([npm peers](#third-party-compatibility-at-sdk-57)).
  - `@legendapp/list` 2.x has `react-native: *` peers. Version 3 is an optional, separate upgrade ([ll-changelog]).
  - `@better-auth/expo@1.4.0-beta.9` keeps working through `>=` peers. It needs `expo-crypto` installed, which `expo-doctor` already reports as missing today (E1). Moving its catalog pin would also move `packages/auth` and the web app, so leave it.
  - tRPC 11 and TanStack Query 5 peer on `react` only ([npm peers](#third-party-compatibility-at-sdk-57)).
- **Procedure:** Expo recommends one SDK at a time ([upgrade walkthrough L11][walkthrough]). `expo install expo@^57 --fix` went straight from 54 to 57 and typechecked after the config fixes above (E2-E4, E8). **`expo install` does not respect `catalog:` specifiers.** It runs `pnpm add`, which replaces `catalog:react19` and the `npm:@typescript/typescript6` alias with literal ranges (E2). It does not touch `pnpm-workspace.yaml`. `vp lint`, `vp fmt --check`, `vp run -r typecheck` and the `sherif` postinstall all pass after the upgrade (E8).
- **Sizing verdict: one session, one ticket, straight to SDK 57.** Do not split it into per-hop tickets. Make SDK 58 a separate follow-up once it is stable. See [Sizing verdict](#sizing-verdict).

---

## SDK version map

From each SDK's `bundledNativeModules.json` (the map `expo install` uses), plus the versions API for Expo Go:

| Package                          | SDK 54 (current) | SDK 55     | SDK 56     | SDK 57 (latest) | SDK 58 beta           |
| -------------------------------- | ---------------- | ---------- | ---------- | --------------- | --------------------- |
| `expo`                           | 54.0.37          | 55.0.31    | 56.0.23    | 57.0.27         | 58.0.6                |
| `react-native`                   | 0.81.5           | 0.83.10    | 0.85.3     | 0.86.3          | 0.88.0-rc.3           |
| `react` / `react-dom` (exact)    | 19.1.0           | 19.2.0     | 19.2.3     | 19.2.3          | 19.3.0                |
| `expo-router`                    | ~6.0.24          | ~55.0.18   | ~56.2.21   | ~57.0.25        | ~58.0.16              |
| `react-native-reanimated`        | ~4.1.1           | 4.2.1      | 4.3.1      | 4.5.1           | 4.7.0                 |
| `react-native-worklets`          | 0.5.1            | 0.7.4      | 0.8.3      | 0.10.1          | 0.13.0                |
| `react-native-gesture-handler`   | ~2.28.0          | ~2.30.0    | ~2.31.1    | ~2.32.0         | ~3.2.1                |
| `react-native-screens`           | ~4.16.0          | ~4.23.0    | ~4.26.0    | ~4.26.0         | ~4.28.0               |
| `react-native-safe-area-context` | ~5.6.0           | ~5.6.2     | ~5.7.0     | ~5.7.0          | ~5.9.1                |
| Expo Go (iOS simulator build)    | 54.0.7           | 55.0.34    | 56.0.4     | 57.0.9          | 58.0.2                |
| Released                         | 2025-09-10       | 2026-02-25 | 2026-05-20 | 2026-06-30      | beta since 2026-09-15 |

Release dates are the npm publish times of `expo@X.0.0` ([npm](#source-npm)). From SDK 55 on, every Expo package's major version equals the SDK number ([cl-55-versioning]). SDK 54 gets critical fixes until the next SDK ships, which Expo expects in September or October 2026 ([cl-57]).

---

## Per-hop changes that affect this app

Every Expo release post lists far more changes than these. This section keeps only what touches a file in this repo, and notes the items I checked and ruled out.

### SDK 54 to 55 (RN 0.83, React 19.2.0)

- **`newArchEnabled` removed.** "You will not be able to use the Legacy Architecture in SDK 55 projects and later. Accordingly, the `newArchEnabled` config option has been removed" ([cl-55-legacy]). Used at `apps/expo/app.config.ts:15`. On SDK 57 it is a type error (E3) because the `ExpoConfig` type no longer has it ([ct57]).
- **`edgeToEdgeEnabled` removed.** "edge-to-edge is now mandatory when targeting Android 16+" ([cl-55-breaking]). Used at `apps/expo/app.config.ts:31`, and a type error on SDK 57 (E3).
- **`experiments.reactCanary` removed.** "React 19 is now the baseline, so the flag is no longer necessary" ([cl-55-breaking]). Used at `apps/expo/app.config.ts:41`. On SDK 54 the flag does real work: Metro redirects `react`, `react-dom` and React Native's renderer to a canary build vendored inside Expo CLI ([CLI 54 `withMetroMultiPlatform.js` L171, L595-L632][cli54-canary]). The mobile app therefore runs a vendored canary today, not the catalog's 19.1.4. From SDK 55 the app runs whatever `react` resolves to, so the catalog version starts to matter. Expo CLI 57 only logs "Remove unused experiments.reactCanary flag" ([cli57-canary]).
- **`app.config.ts` is transpiled with the project's TypeScript** ([cl-55-breaking]). This is why the mobile app must keep a TypeScript with a JS API (TS 6), as the Vite+ migration already does by aliasing `typescript` to `@typescript/typescript6` (`apps/expo/package.json:50`, commit `95b35ec`).
- **`autolinkingModuleResolution` on by default in monorepos; the fast resolver flag is gone** ([cl-55-breaking]). This needs no action. `metro.config.js` sets neither.
- **Deprecated `expo-status-bar` props** (`backgroundColor`, `translucent`, `networkActivityIndicatorVisible`) ([cl-55-deprecations]). `apps/expo/src/app/_layout.tsx:30` renders `<StatusBar />` with no props, so it is unaffected.
- **Tooling:** minimum Xcode 26 (the docs table says 26.2+), Node `^20.19.4 || ^22.13.0 || ^24.3.0 || ^25` ([cl-55-tools], [docs-versions]).
- **Ruled out:** the `expo-router` 55 breaking changes (headless tabs `reset` renamed to `resetOnFocus`, NativeTabs changes, `ExpoRequest`/`ExpoResponse` removal) touch APIs this app does not import ([router-changelog]).
- **React Native 0.82 to 0.83:** "the first release with no user facing breaking changes" ([rn-083]).

### SDK 55 to 56 (RN 0.85, React 19.2.3)

- **expo-router no longer depends on React Navigation.** Imports from `@react-navigation/*` must move to `expo-router/*` entry points ([router-5556], [cl-56-router]). `grep` finds no `@react-navigation` import under `apps/expo/src`, so nothing to do.
- **`expo/fetch` replaces `globalThis.fetch`** ([cl-56-breaking]). This app's network calls go through tRPC's `httpBatchLink` (`apps/expo/src/utils/api.tsx:31`) and Better Auth's client (`apps/expo/src/utils/auth.ts:7`), both of which use the global `fetch`. I found no reported incompatibility. Runtime behaviour is unverified, so test sign-in and a tRPC mutation. `EXPO_PUBLIC_USE_RN_FETCH=1` opts out.
- **`expo-status-bar` removed the props deprecated in 55** ([status-bar changelog 56.0.0][statusbar-changelog]). Unaffected, as above.
- **On-demand filesystem and a native Node watcher replace `watchFolders` and Watchman** ([cl-56-cli]). This makes the custom Metro config even less necessary.
- **TypeScript 6.0.3 becomes the checked version** ([cl-56-tools]). `@typescript/typescript6` stops at 6.0.2 on npm, so `expo-doctor` reports a patch mismatch (E5). Replacing the alias with plain `typescript: ~6.0.3` clears it and `tsc` still resolves to TS 7 through `@typescript/native` (E6, E8).
- **Minimum iOS 16.4, Xcode 26.4** ([cl-56-tools]). This only matters for native builds. EAS's default image is newer.
- **Dynamic `import()` regression in `expo@56.0.10`-`56.0.11`.** `@better-auth/expo/client` calls `await import('expo-web-browser')`, and on those patches it crashed with "Requiring unknown module" in dev builds ([ba-10027], [expo-46806]). Expo fixed it in 56.0.12 ([expo-46806]). Only relevant if you stop on SDK 56.
- **Hermes V1 is default and leaks memory with Reanimated/Worklets on 56** ([cl-56-regressions]). Expo recommends SDK 57 (`expo@57.0.17`+) for this. Reanimated and Worklets are installed here because Nativewind needs them ([nw-rc0]). This is a reason not to stop on 56.
- **React Native 0.84/0.85:** Legacy Architecture compiled out on iOS, Node 22.11+ for 0.84, Jest preset moved to `@react-native/jest-preset`, `StyleSheet.absoluteFillObject` removed ([rn-084], [rn-085]). The app has no Jest and no `absoluteFillObject`.

### SDK 56 to 57 (RN 0.86, React unchanged at 19.2.3)

- "React Native 0.86 is intended to have no breaking changes from 0.85", and Expo calls SDK 57 "the easiest Expo SDK upgrade you've ever made" ([cl-57]).
- **Fixes in 57 patches:** `expo@57.0.9` fixes the Hermes V1 memory regression and `57.0.17` fixes slow dev startup ([cl-57-regressions]). `expo install expo@^57 --fix` installs 57.0.27 (E2).
- **Xcode 27.** Apps built with the iOS 27 SDK must use the scene life cycle. On SDK 57 that needs `expo@57.0.23`+ and `expo-build-properties` with `ios.enableSceneSupport: true` ([cl-57-xcode27], [fyi-scene]). This machine has Xcode 27.0 with only an iOS 27 simulator runtime (`xcodebuild -version`, `xcrun simctl list runtimes`). This matters for `expo run:ios` development builds, not for Expo Go. The app does not install `expo-build-properties` today. EAS's `latest` image is still Xcode 26.6 ([cl-58]).
- **`expo prebuild` now cleans by default** ([cl-57]). The app uses Continuous Native Generation (no `ios`/`android` directories are committed), so nothing changes.
- **Node minimum 22.13.x** ([docs-versions]). The repo pins `^22.21.0` (`package.json:5`) and EAS uses 22.21.0 (`apps/expo/eas.json:8`).

### SDK 57 to 58 (beta; for a later ticket)

Not recommended yet. The beta uses an RN release candidate, and Expo will ship the stable SDK "shortly after" RN 0.88 ([cl-58]). Nativewind's release candidate is tested against Expo 57 only ([nw-rc0]). Items that would affect this app:

- **React 19.3.0** for every app sharing the catalog ([bnm-58]).
- **RN 0.87 strict TypeScript API by default.** Deep imports become type errors and ref types change ([cl-58-breaking]). E9 typechecks the mobile app on 58.0.6 without errors, but that does not cover runtime.
- **RN API removals** (`InteractionManager`, `Touchable`, `StatusBar` color props) do not touch this app. React Native's own `SafeAreaView` is still exported but deprecated in 0.86 and 0.88 ([RN 0.86 `index.js` L96-L107][rn-safearea]). `apps/expo/src/app/post/[id].tsx:3` imports it from `react-native`. `index.tsx:6` already uses `react-native-safe-area-context`, so switch the post screen to match.
- **expo-router navigation core rework.** `screen`/`params`/`initial` become plain params and `useRouter()` is preferred ([router-5758] L59-L92). This app navigates only through `<Link href>` with a complete pathname (`index.tsx:19-25`), which is the recommended form.
- **`react-native-gesture-handler` 3.x** ([bnm-58]). This app does not import it directly.
- **`NODE_ENV` handling and browser login for `expo login`** ([cl-58-breaking]) change CLI behaviour, but not app code.

---

## Third-party compatibility at SDK 57

Peer ranges come from `npm view <pkg>@<version> peerDependencies` on 2026-10-09.

| Package                                       | Today                | At SDK 57                                    | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------- | -------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nativewind`                                  | `5.0.0-preview.2`    | `5.0.0-rc.0` (exact)                         | rc.0 "pairs with react-native-css 3.1.0-rc.0 for Expo 57" and targets "Expo 57.0.22, React Native 0.86.3, React 19.2.3, Reanimated 4.5.1, and Worklets 0.10.1". Its peer pins `react-native-css: 3.1.0-rc.0` exactly ([nw-rc0]). npm `latest` is still 4.2.7.                                                                                                                                                                                                                                       |
| `react-native-css`                            | `3.0.1`              | `3.1.0-rc.0` (exact)                         | Same targets ([rncss-rc0]). 3.0.x declares `react-native >=0.81` and `@expo/metro-config >=54`, so preview.2 + 3.0.1 install and typecheck on 57 (E8). Runtime styling on 57 is unverified with that old pair.                                                                                                                                                                                                                                                                                      |
| `react-native-reanimated` / `-worklets`       | ~4.1.3 / ~0.5.1      | 4.5.1 / 0.10.1 (set by `expo install --fix`) | Peers `react-native: 0.83-0.86`, `react-native-worklets: 0.10.x` (npm). Expo pins these exactly (E2).                                                                                                                                                                                                                                                                                                                                                                                               |
| `@legendapp/list`                             | ^2.0.14 (2.0.19 max) | keep 2.x                                     | 2.x peers `react: *`, `react-native: *`. 3.0.0 (2026-05-28) is a major with a `maintainVisibleContentPosition` behaviour change and web support ([ll-changelog]). `estimatedItemSize` (`index.tsx:157`) still exists in 3.6.0's types. Optional, separate.                                                                                                                                                                                                                                          |
| `@better-auth/expo` / `better-auth` (catalog) | 1.4.0-beta.9         | keep 1.4.0-beta.9; add `expo-crypto`         | 1.4.0-beta.9 peers are `>=` ranges (`expo-constants >=17`, `expo-linking >=7`, `expo-web-browser >=14`, `expo-secure-store >=14`, `expo-crypto >=13`). `expo-crypto` is missing today (E1). Latest is 1.7.7 with peers `better-auth ^1.7.7` and `@better-auth/core ^1.7.7`, plus new `expo-network`. The catalog also feeds `packages/auth` (`packages/auth/src/index.ts:1` imports `expo` from `@better-auth/expo`) and the web app, so bumping it is a server-side upgrade, not part of this one. |
| `@tanstack/react-query`                       | ^5.90.8              | unchanged                                    | Peer `react: ^18 \|\| ^19` (5.104.1).                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `@trpc/*`                                     | ^11.7.1              | unchanged                                    | `@trpc/tanstack-react-query` 11.19.0 peers `react >=18.2.0`, `typescript >=5.7.2`.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `@tanstack/react-start` (web app)             | ^1.135.2             | unchanged on React 19.2.3                    | Peers `react >=18.0.0 \|\| >=19.0.0` (1.168.60).                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

The `rc.0` release notes list three breaking changes from `react-native-css@3.0.7` ([nw-rc0]):

- `@cssInterop`/`@react-native` directives now error. The mobile app's CSS (`apps/expo/src/styles.css`, `tooling/tailwind/theme.css`) has none.
- `:root.dark` selectors now error on native. The shared theme uses `@variant dark` (`tooling/tailwind/theme.css:51`). Only the web app redefines `dark` as a class variant (`apps/tanstack-start/src/styles.css:9`), so on mobile it stays a `prefers-color-scheme` media query. I have not run this to confirm.
- Old prop declarations such as `placeholderClassName` are gone. The app does not use them.

---

## The React catalog question

`pnpm-workspace.yaml:26-30` defines `react19` (`react`/`react-dom` 19.1.4, `@types/react`/`@types/react-dom` ~19.1.0). The mobile app, the web app and `packages/ui` all use it.

- Expo's dependency check treats the bundled `react` version as exact. On SDK 54, `expo-doctor` already reports `react expected 19.1.0, found 19.1.4` (E1).
- A separate mobile-only React does not stay contained. After E2 left the mobile app on 19.2.3 and the catalog on 19.1.4, `pnpm peers check` reported `packages/ui: unmet peer react 19.1.4, wanted ^19.2.3 by react-dom@19.2.3`. pnpm had resolved Radix's `react-dom` peer to the mobile app's 19.2.3. `packages/ui` then failed `tsc` in `src/toast.tsx:15`, where `sonner`'s `CSSProperties` came from the other React types (E3). The baseline typechecks 9/9 (E1).
- One catalog on 19.2.3 (`@types/react ~19.2.18`, `@types/react-dom ~19.2.7`) typechecks 9/9 and clears the `packages/ui` peer warning (E4). TanStack Start's peers allow it. The web app's runtime on 19.2.3 (SSR, the single-React fix from the Vite+ migration) is unverified.

Recommendation: bump `react19` to exactly the version in `bundledNativeModules.json` (19.2.3 for SDK 57) and keep `catalog:react19` in the mobile app. The catalog name stays accurate. If a later SDK needs a React the web app cannot take, revisit then.

---

## Recommended procedure

1. On a branch, from `apps/expo`, run `pnpm exec expo install expo@^57.0.0 --fix` (E2). Going straight to 57 is fine for this app. Expo's general advice is one SDK at a time ([walkthrough]), so if the runtime check in step 7 fails, redo the upgrade as three commits (`expo@^55`, `^56`, `^57`) to bisect. Skip SDK 56 as a stopping point (memory regression, dynamic import bug).
2. Undo what `expo install` did to the specifiers: set `react`, `react-dom` and `@types/react` back to `catalog:react19` and move the catalog to `react`/`react-dom` 19.2.3, `@types/react ~19.2.18`, `@types/react-dom ~19.2.7` (E4). Set `typescript` to `~6.0.3` (or keep the `@typescript/typescript6` alias and add `typescript` to `expo.install.exclude` ([package-json docs L12-L29][pkgjson])).
3. In `app.config.ts`, delete `newArchEnabled`, `android.edgeToEdgeEnabled` and `experiments.reactCanary` (E3).
4. Replace `metro.config.js` with `getDefaultConfig` + `withNativewind`, dropping the `metro-cache` `FileStore` (E6). Expo's default config already keeps a file cache under the OS temp directory (`@expo/metro-config` 57.0.13 `ExpoMetroConfig.js` L206). The custom location existed for Turborepo's output caching, which `vp run` does not use for `dev`.
5. `pnpm exec expo install expo-crypto` (E6), and move Nativewind to `nativewind@5.0.0-rc.0` + `react-native-css@3.1.0-rc.0` with exact versions ([nw-rc0]).
6. Re-resolve the lockfile. With the edited lockfile, `expo-doctor` still reports duplicate `expo`/`expo-asset` copies (peer variants), and `pnpm dedupe` does not fix it (E7). A fresh resolution passes 21/21 (E8), but it moves every workspace dependency to the newest version its range allows (+5,121/−7,100 lockfile lines). Review that diff, or narrow it with targeted `pnpm update` if the web app churn is unwanted. This is an open question.
7. Verify: `vp run -r typecheck`, `vp lint`, `vp fmt --check`, `pnpm dlx expo-doctor@latest`. Then install Expo Go 57.0.9 on the simulator (`xcrun simctl install` from the [`iosClientUrl`][expo-api] tarball), run the mobile app through the existing `simctl openurl` route and the web app on port 3000, and check sign-in (Discord through `expo-web-browser`), post create/delete, and dark mode styling.

### Interaction with Vite+

- `expo install` writes `apps/expo/package.json` through `pnpm add`. The root `fmt` config sets `sortPackageJson: false` (`vite.config.ts`), and `vp fmt --check` passed after the rewrite (E8).
- The `sherif` postinstall (`package.json` `postinstall`) passed after every install in E2-E8, including while the mobile app's React differed from the catalog. It did not catch the split. `pnpm peers check` and the typecheck did.
- The `typecheck` task's cache inputs include `pnpm-lock.yaml` (`tooling/typescript/typecheck.ts`), so the upgrade invalidates every package's cached typecheck. That is expected.
- `vp lint` (type-aware) passed on the upgraded tree (E8).

---

## Experiments (run on throwaway clones)

All runs used `git clone` of this worktree at `95b35ec` into `/tmp/expo-research/{e0,e1}`, Node 24.21.0, pnpm 12.10.1, vp 1.1.0, `expo-doctor@1.20.4` unless noted. No dev servers, simulators or native builds ran.

- **E1 (baseline).** `pnpm install --frozen-lockfile`; `pnpm exec tsc --noEmit` in `apps/expo` passes; `pnpm exec vp run -r typecheck` passes 9/9. `pnpm dlx expo-doctor@latest` reports 15/18 checks passed and 3 failed: missing peer `expo-crypto` (required by `@better-auth/expo`); duplicate native modules (`react-native@0.82.0` and extra `expo`/`expo-constants`/`expo-linking`/`expo-web-browser` copies, pulled in by `@acme/auth`'s `@better-auth/expo` peers); version mismatches including `react 19.1.4` vs `19.1.0` and `typescript 6.0.2` vs `~5.9.2`.
- **E2.** `CI=1 pnpm exec expo install expo@^57.0.0 --fix` in `apps/expo`. It installed `expo ^57.0.27`, the Expo modules at `~57.x`, `react`/`react-dom` `19.2.3`, `react-native 0.86.3`, `react-native-reanimated 4.5.1`, `react-native-worklets 0.10.1`, `react-native-gesture-handler ~2.32.0`, `react-native-screens ~4.26.2` and `react-native-safe-area-context ~5.7.0`. It then ran `pnpm add --save-dev @types/react@~19.2.4 typescript@~6.0.3`. pnpm warned `Replaced "@types/react" ("catalog:react19") with "@types/react@~19.2.4"` and `Replaced "typescript" ("npm:@typescript/typescript6@^6.0.2") with "typescript@~6.0.3"`. `react`/`react-dom` also became literal `19.2.3`. `pnpm-workspace.yaml` was untouched. `nativewind`, `react-native-css`, `@legendapp/list` and `@better-auth/expo` were untouched. `pnpm peers check` added `packages/ui: unmet peer react 19.1.4, wanted ^19.2.3 by react-dom@19.2.3`.
- **E3.** `tsc --noEmit` in `apps/expo` reported `app.config.ts(31,5): error TS2353 ... 'edgeToEdgeEnabled' does not exist in type 'Android'`. After deleting that line it reported `app.config.ts(15,3): error TS2353 ... 'newArchEnabled' does not exist in type 'ExpoConfig'`. After deleting both, it passed. `vp run -r typecheck` then failed in `@acme/ui` (`src/toast.tsx:15:7 TS2322 Type 'CSSProperties' is not assignable...`, from `sonner@2.0.7_react-dom@19.2.3_react@19.1.4`). `@acme/auth` was SIGKILLed (exit 137) because `vp run` stops sibling tasks on failure.
- **E4.** Set the `react19` catalog to `react`/`react-dom` 19.2.3, `@types/react ~19.2.18`, `@types/react-dom ~19.2.7`, and restored `catalog:react19` and the TS 6 alias in `apps/expo/package.json`. `pnpm install`, then `vp run -r typecheck` passed 9/9. The `packages/ui` peer warning was gone.
- **E5.** `expo-doctor` reported 17/21. `Check for issues with Metro config` hit an unexpected error: `Cannot find module 'metro-cache'` from `apps/expo/metro.config.js`. It also reported missing `expo-crypto`, duplicate `expo`/`expo-asset`, and `typescript expected ~6.0.3, found 6.0.2`. Loading the same file with SDK 54's own loader in the E1 clone (`@expo/metro/metro-config` `resolveConfig`) also failed ("could not be loaded with Node.js"), and plain `require.resolve('metro-cache')` fails from `apps/expo` on both SDKs. The file is broken in a clean install of `HEAD` too; SDK 54's `expo-doctor` simply did not report it. I could not determine how `expo start` loads it on SDK 54 today (unverified).
- **E6.** Replaced `metro.config.js` with `getDefaultConfig` + `withNativewind`, set `typescript` to `~6.0.3`, `pnpm install`, then `CI=1 pnpm exec expo install expo-crypto` (installed `expo-crypto ~57.0.3`). `expo-doctor` reported 20/21. Only the duplicate `expo`/`expo-asset` check failed, caused by several peer-variant copies of `expo@57.0.27` in `node_modules/.pnpm`.
- **E7.** `pnpm dedupe` left the same `expo-doctor` failure.
- **E8.** Deleted every `node_modules` and `pnpm-lock.yaml`, then ran `pnpm install`. `expo-doctor` reported "21/21 checks passed. No issues detected!" `vp run -r typecheck` passed 9/9, `vp lint` exited 0, and `vp fmt --check` reported "All matched files use the correct format" (103 files). The diff came to `app.config.ts` (−2), `metro.config.js` (−8), `apps/expo/package.json`, `pnpm-workspace.yaml` (catalog) and `pnpm-lock.yaml` (+5,121/−7,100).
- **E9 (SDK 58 beta, on top of E8).** `CI=1 pnpm exec expo install expo@next --fix` installed `expo 58.0.6`, `react-native 0.88.0-rc.3`, `react`/`react-dom 19.3.0` (again replacing `catalog:react19`), `react-native-gesture-handler 3.2.1`, `react-native-reanimated 4.7.0` and `react-native-worklets 0.13.0`. `tsc --noEmit` in `apps/expo` passed with 0 errors. `pnpm dlx expo-doctor@next` (1.21.4) reported 18/20: duplicate native modules, and `@types/react expected ~19.3.0, found 19.2.18`.

---

## Sizing verdict

**One session, one ticket, straight to SDK 57.** The findings support this:

- The app's own code needs no changes for 55, 56 or 57. Every listed breaking change either targets an API this app does not import (React Navigation imports, NativeTabs, `ExpoRequest`, status bar color props, `absoluteFillObject`, Jest preset) or is a config flag. E3 and E8 show the mobile app typechecking on 57 after deleting two lines.
- The real work is a fixed list of about six edits: the three config flags, the Metro config, the React catalog, the TypeScript pin, `expo-crypto`, the Nativewind rc pair and the lockfile. E2 to E8 performed all of them on a clone.
- Per-hop tickets would mean landing SDK 55 and 56, which carry known regressions this app would hit (Hermes V1 memory with Reanimated/Worklets on 56; the 56.0.10-56.0.11 dynamic import crash with `@better-auth/expo`). That is wasted effort.
- The risks are runtime, not code: Nativewind's styling on the rc pair, the global `fetch` swap for auth cookies, and the web app on React 19.2.3. A single simulator and browser smoke test covers them. If that check fails, fall back to per-hop commits within the same branch to bisect.

Out of scope, as separate tickets:

1. SDK 58, after it leaves beta and RN 0.88 is stable.
2. Better Auth 1.4.0-beta.9 to 1.7.x. It moves `packages/auth` and the web app, and adds `expo-network`.
3. `@legendapp/list` 3.
4. Expo Go 57 leaves the App Store when SDK 58 ships, so the simulator workflow will need Expo Go 58 or a development build then.

---

## Open questions

1. **Does `expo start` on SDK 54 load `metro.config.js` today?** In a clean install it cannot resolve `metro-cache` (E5). Whatever lets it work locally, the file must change for SDK 57.
2. **Runtime on Expo Go 57.0.9 with the iOS 27 simulator.** Not run (no simulators in this research). Check the Nativewind theme in light and dark, `LegendList`, Discord sign-in through `expo-web-browser` (dynamic `import()` on 57), and tRPC calls under `expo/fetch`.
3. **Web app on React 19.2.3.** Typecheck passes (E4). SSR and the production build were not run. The Vite+ migration fixed a two-React SSR bug, so run `vp build` and a smoke test.
4. **Lockfile strategy.** Full re-resolution passes `expo-doctor` but moves every dependency within its range (E8). A targeted approach was not found (E7). Decide whether that churn is acceptable in this ticket.
5. **Development builds with Xcode 27.** On SDK 57, add `expo-build-properties` with `ios.enableSceneSupport` ([fyi-scene]) if you build `expo-dev-client` locally. Not tested.
6. **Nativewind preview.2 on SDK 57 without moving to rc.0.** It installs and typechecks (E8), but nothing tests it at runtime and its release notes name no Expo 57 target. Moving to rc.0 is the documented path.

---

<a id="source-npm"></a>**npm queries (2026-10-09):** `npm view expo dist-tags` (`latest: 57.0.27`, `next: 58.0.6`, `sdk-54: 54.0.37`), `npm view expo time` (`54.0.0: 2025-09-10`, `55.0.0: 2026-02-25`, `56.0.0: 2026-05-20`, `57.0.0: 2026-06-30`, `58.0.0: 2026-09-29` published under `next`), `npm view react-native@<v> peerDependencies engines` (0.81.5 `react ^19.1.0`; 0.86.3 `react ^19.2.3`, Node `^20.19.4||^22.13.0||^24.3.0||>=25.0.0`; 0.88.0-rc.3 `react ^19.3.0`, Node `^22.13.0||^24.3.0||>=26.0.0`), and peer ranges for every third-party package above. `bundledNativeModules.json` was read from `npm pack expo@<v>`.

[expo-api]: https://api.expo.dev/v2/versions/latest
[expo-main]: https://github.com/expo/expo/tree/942561ab5c2b8e4c94e4345eff542ddedd736ec9
[expo-sdk57]: https://github.com/expo/expo/tree/b4ce18a018e70c4a7687d0839d9fbb59d51d2391
[cl-55]: https://expo.dev/changelog/sdk-55
[cl-55-legacy]: https://expo.dev/changelog/sdk-55#dropped-support-for-the-legacy-architecture
[cl-55-versioning]: https://expo.dev/changelog/sdk-55#new-expo-sdk-package-versioning-scheme
[cl-55-deprecations]: https://expo.dev/changelog/sdk-55#deprecations
[cl-55-breaking]: https://expo.dev/changelog/sdk-55#notable-breaking-changes
[cl-55-tools]: https://expo.dev/changelog/sdk-55#tool-version-bumps
[cl-56]: https://expo.dev/changelog/sdk-56
[cl-56-cli]: https://expo.dev/changelog/sdk-56#expo-cli
[cl-56-router]: https://expo.dev/changelog/sdk-56#expo-router
[cl-56-breaking]: https://expo.dev/changelog/sdk-56#notable-breaking-changes
[cl-56-tools]: https://expo.dev/changelog/sdk-56#tool-version-bumps
[cl-56-regressions]: https://expo.dev/changelog/sdk-56#known-regressions
[cl-57]: https://expo.dev/changelog/sdk-57
[cl-57-regressions]: https://expo.dev/changelog/sdk-57#known-regressions
[cl-57-xcode27]: https://expo.dev/changelog/sdk-57#building-with-xcode-27-and-the-ios-27-sdk
[cl-58]: https://expo.dev/changelog/sdk-58-beta
[cl-58-breaking]: https://expo.dev/changelog/sdk-58-beta#notable-breaking-changes
[cl-go-57]: https://expo.dev/changelog/expo-go-57-login
[docs-versions]: https://docs.expo.dev/versions/latest/#each-expo-sdk-version-depends-on-a-react-native-version
[bnm-58]: https://unpkg.com/expo@58.0.6/bundledNativeModules.json
[ct57]: https://unpkg.com/@expo/config-types@57.0.2/build/ExpoConfig.d.ts
[cli57-canary]: https://unpkg.com/@expo/cli@57.0.28/build/src/start/server/metro/instantiateMetro.js
[cli54-canary]: https://unpkg.com/@expo/cli@54.0.27/build/src/start/server/metro/withMetroMultiPlatform.js
[router-5556]: https://github.com/expo/expo/blob/942561ab5c2b8e4c94e4345eff542ddedd736ec9/docs/pages/router/migrate/sdk-55-to-56.mdx#L9-L52
[router-5758]: https://github.com/expo/expo/blob/942561ab5c2b8e4c94e4345eff542ddedd736ec9/docs/pages/router/migrate/sdk-57-to-58.mdx#L59-L92
[router-changelog]: https://github.com/expo/expo/blob/b4ce18a018e70c4a7687d0839d9fbb59d51d2391/packages/expo-router/CHANGELOG.md
[statusbar-changelog]: https://github.com/expo/expo/blob/b4ce18a018e70c4a7687d0839d9fbb59d51d2391/packages/expo-status-bar/CHANGELOG.md
[monorepos]: https://github.com/expo/expo/blob/942561ab5c2b8e4c94e4345eff542ddedd736ec9/docs/pages/guides/monorepos.mdx#L184-L247
[walkthrough]: https://github.com/expo/expo/blob/942561ab5c2b8e4c94e4345eff542ddedd736ec9/docs/pages/workflow/upgrading-expo-sdk-walkthrough.mdx#L11
[pkgjson]: https://github.com/expo/expo/blob/942561ab5c2b8e4c94e4345eff542ddedd736ec9/docs/pages/versions/unversioned/config/package-json.mdx#L12-L29
[fyi-scene]: https://github.com/expo/fyi/blob/05616364102ca826ed905e15797a1f89dd53afe3/ios-scene-lifecycle.md#staying-on-sdk-57-with-xcode-27
[rn-083]: https://reactnative.dev/blog/2025/12/10/react-native-0.83
[rn-084]: https://reactnative.dev/blog/2026/02/11/react-native-0.84
[rn-085]: https://reactnative.dev/blog/2026/04/07/react-native-0.85
[rn-safearea]: https://unpkg.com/react-native@0.86.3/index.js
[nw-rc0]: https://github.com/nativewind/nativewind/releases/tag/5.0.0-rc.0
[rncss-rc0]: https://github.com/nativewind/react-native-css/releases/tag/3.1.0-rc.0
[ll-changelog]: https://github.com/LegendApp/legend-list/blob/3d80d167e243cbaa089fda9f2dbcca5ea59da9d8/CHANGELOG.md
[ba-10027]: https://github.com/better-auth/better-auth/issues/10027
[expo-46806]: https://github.com/expo/expo/issues/46806
