# create-t3-vite-plus

A T3 starter monorepo: a web app and a mobile app sharing typed packages, built on the Vite+ toolchain.

## Language

**Web app**:
The TanStack Start app; it also serves the API the mobile app calls.
_Avoid_: Next.js app, server, backend

**Web app origin**:
The public origin the deployed web app is served from; auth callbacks and the mobile app's API calls are built on it.
_Avoid_: redirect proxy URL, production URL, base URL

**Mobile app**:
The Expo app; a client of the web app's API.
_Avoid_: native app, Expo app

**Package**:
A shared workspace library under `packages/`, consumed by apps as TypeScript source, never as a build output.
_Avoid_: lib, module

**Task runner**:
The tool that runs a script across the workspace in dependency order (`vp run`).
_Avoid_: Turbopack (that's Next.js's bundler), Turbo
