# create-t3-vite-plus

> [!NOTE]
>
> The web app uses TanStack Start and serves the API for the Expo mobile app. It runs on Cloudflare Workers with a D1 database.

## Installation

> [!NOTE]
>
> Make sure to follow the system requirements specified in [`package.json#engines`](./package.json#L4) before proceeding.
>
> The commands below use the global `vp` CLI. Install it with `curl -fsSL https://vite.plus | bash`, or see the [Vite+ docs](https://viteplus.dev/guide/global-cli) for Windows.

Use this repository as a template:

![use-as-template](https://github.com/t3-oss/create-t3-turbo/assets/51714798/bb6c2e5d-d8b6-416e-aeb3-b3e50e2ca994)

## About

Ever wondered how to migrate your T3 application into a monorepo? Stop right here! This is the perfect starter repo to get you running with the perfect stack!

It uses [Vite+](https://viteplus.dev) and contains:

```text
.github
  └─ workflows
        └─ CI with pnpm cache setup
.vscode
  └─ Recommended extensions and settings for VSCode users
apps
  ├─ expo
  │   ├─ Expo SDK 54
  │   ├─ React Native 0.81 using React 19
  │   ├─ Navigation using Expo Router
  │   ├─ Tailwind CSS v4 using NativeWind v5
  │   └─ Typesafe API calls using tRPC
  └─ tanstack-start
      ├─ Tanstack Start v1 (rc)
      ├─ React 19
      ├─ Tailwind CSS v4
      ├─ E2E Typesafe API Server & Client
      └─ Runs on Cloudflare Workers
packages
  ├─ api
  │   └─ tRPC v11 router definition
  ├─ auth
  │   └─ Authentication using better-auth.
  ├─ db
  │   └─ Typesafe db calls using Drizzle & Cloudflare D1
  ├─ generator
  │   └─ `vp create` template for new packages
  └─ ui
      └─ Start of a UI package for the webapp using shadcn-ui
tooling
  ├─ tailwind
  │   └─ shared tailwind theme and configuration
  └─ typescript
      └─ shared tsconfig you can extend from
```

> In this template, we use `@acme` as a placeholder for package names. As a user, you might want to replace it with your own organization or project name. You can use find-and-replace to change all the instances of `@acme` to something like `@my-company` or `@project-name`.

## Quick Start

> **Note**
> The web app deploys to [Cloudflare Workers](https://developers.cloudflare.com/workers), and the [db](./packages/db) package uses [Cloudflare D1](https://developers.cloudflare.com/d1). Local development needs no Cloudflare account. See [Deployment](#deployment) for production.

To get it running, follow the steps below:

### 1. Setup dependencies

```bash
# Install dependencies
vp install

# Configure environment variables
# There is an `.env.example` in the root directory you can use for reference
cp .env.example .env

# Apply the migrations to the local D1 database
vp run db:migrate
```

Run `vp run dev` to start the web app at `http://localhost:3000`. The mobile app uses the same port for API requests. Start it with `vp run dev:expo` in a second terminal, so Expo's keyboard shortcuts and QR code get their own terminal.

`vp run dev` warns about a missing `WEB_APP_ORIGIN` secret until you set one. You can ignore the warning in dev.

### 2. Database

The [db](./packages/db) package uses [Drizzle](https://orm.drizzle.team) with [Cloudflare D1](https://developers.cloudflare.com/d1), a SQLite database. The web app reaches it through its `DB` binding, so there is no connection string to configure. In dev the database is a local file under `apps/tanstack-start/.cloudflare/state`. `vp run db:migrate` creates its tables from the SQL files in [`packages/db/migrations`](./packages/db/migrations).

After you change the [schema](./packages/db/src/schema.ts), generate a migration and apply it:

```bash
# Generate a SQL migration from the schema. Commit the new files.
vp run db:generate

# Apply the migrations to the local D1 database
vp run db:migrate
```

To browse the local data, open the Local Explorer at `http://localhost:3000/cdn-cgi/local/explorer` while `vp run dev` is running. The starter doesn't include Drizzle Studio, because it can't read D1 without an API token or extra setup.

[Deployment](#deployment) covers the production database.

### 3. Generate Better Auth Schema

This project uses [Better Auth](https://www.better-auth.com) for authentication. The Better Auth CLI generates the Drizzle schema for the auth tables. The generated file is committed, so you only need to run the CLI after you change the auth setup, for example when you add a plugin.

```bash
# Generate the Better Auth schema
vp run auth:generate

# Then generate and apply a migration for the changed tables
vp run db:generate
vp run db:migrate
```

The CLI asks before it overwrites the schema file. Run `vp run auth:generate --yes` to skip the question.

`vp run auth:generate` runs the Better Auth CLI with the following configuration:

- **Config file**: `packages/auth/script/auth-cli.ts` - A CLI-only configuration file (isolated from src to prevent imports)
- **Output**: `packages/db/src/auth-schema.ts` - Generated Drizzle schema for authentication tables

The generation process:

1. Reads the Better Auth configuration from `packages/auth/script/auth-cli.ts`
2. Generates the appropriate database schema based on your auth setup
3. Outputs a Drizzle-compatible schema file to the `@acme/db` package

> **Note**: The `auth-cli.ts` file is placed in the `script/` directory (instead of `src/`) to prevent accidental imports from other parts of the codebase. This file is exclusively for CLI schema generation and should **not** be used directly in your application. For runtime authentication, use the configuration from `packages/auth/src/index.ts`.

For more information about the Better Auth CLI, see the [official documentation](https://www.better-auth.com/docs/concepts/cli#generate).

### 4. Configure Expo `dev`-script

#### Use iOS Simulator

1. Make sure you have XCode and XCommand Line Tools installed [as shown on expo docs](https://docs.expo.dev/workflow/ios-simulator).

   > **NOTE:** If you just installed XCode, or if you have updated it, you need to open the simulator manually once. Run `vp exec expo start` from `apps/expo`, and then enter `I` to launch Expo Go. After the manual launch, you can run `vp run dev:expo` in the root directory.

   ```diff
   +  "dev": "expo start --ios",
   ```

2. Run `vp run dev:expo` at the project root folder.

#### Use Android Emulator

1. Install Android Studio tools [as shown on expo docs](https://docs.expo.dev/workflow/android-studio-emulator).

2. Change the `dev` script at `apps/expo/package.json` to open the Android emulator.

   ```diff
   +  "dev": "expo start --android",
   ```

3. Run `vp run dev:expo` at the project root folder.

### 5. Configuring Better-Auth to work with Expo

In order to get Better-Auth to work with Expo, you must either:

#### Deploy the Auth Proxy (RECOMMENDED)

Better Auth comes with an [auth proxy plugin](https://www.better-auth.com/docs/plugins/oauth-proxy). [Deploy the web app](#web-app), then set `WEB_APP_ORIGIN` in your root `.env` to the Web app origin, such as `https://acme-tanstack-start.<your-subdomain>.workers.dev`. The deployed web app already has the same value as a secret.

The auth package uses the Web app origin for both the OAuth proxy and the Discord callback, so Discord only needs the callback you registered when deploying: `<Web app origin>/api/auth/callback/discord`. The mobile app's sign-in then completes the OAuth flow through the deployed web app. Without `WEB_APP_ORIGIN`, local development uses the local web app's URL for both.

#### Add your local IP to your OAuth provider

You can alternatively add your local IP (e.g. `192.168.x.y:$PORT`) to your OAuth provider. This may not be as reliable as your local IP may change when you change networks. Some OAuth providers may also only support a single callback URL for each app making this approach unviable for some providers (e.g. GitHub).

### 6a. When it's time to add a new UI component

Run the `ui-add` script to add a new UI component using the interactive `shadcn/ui` CLI:

```bash
vp run ui-add
```

When the component(s) has been installed, you should be good to go and start using it in your app.

### 6b. When it's time to add a new package

Run the package generator in the monorepo root:

```bash
vp create package
```

It asks for a package name (the `@acme/` prefix is optional) and the dependencies to install, then creates the package in `packages/` with a `package.json`, `tsconfig.json`, `src/index.ts` and a `vite.config.ts` for the cached typecheck. Dependencies that are in the pnpm catalog get `catalog:`. Vite+ then offers to add workspace packages as dependencies, installs everything and formats the new package. Lint and format are configured at the root, so the package needs no config of its own.

To skip the prompts, pass the options after `--`:

```bash
vp create package --no-interactive -- --name my-package --deps "zod superjson"
```

The generator lives in `packages/generator` and is registered in the root `vite.config.ts`.

## FAQ

### Does this pattern leak the web app's API code to my client applications?

No, it does not. The `api` package should only be a production dependency in the web app where it's served. The mobile app, and all other apps you may add in the future, should only add the `api` package as a dev dependency. This lets you have full typesafety in your client applications, while keeping the web app's API code safe.

If you need to share runtime code between the client and server, such as input validation schemas, you can create a separate `shared` package for this and import it on both sides.

## Deployment

### Web app

The web app deploys to [Cloudflare Workers](https://developers.cloudflare.com/workers) and keeps its data in [D1](https://developers.cloudflare.com/d1). Deploy it before using the mobile app in production. It serves both the tRPC API and the auth routes.

Steps 1 to 5 are one-time setup. Run the commands from `apps/tanstack-start`. The `cf` CLI is installed there, so `vp exec cf` finds it.

1. Log in to Cloudflare.

   ```bash
   cd apps/tanstack-start
   vp exec cf auth login
   ```

2. Create the D1 database.

   ```bash
   vp exec cf d1 create --name acme-tanstack-start
   ```

   Copy the database ID from the output into [`cloudflare.config.ts`](./apps/tanstack-start/cloudflare.config.ts), where it replaces the placeholder ID of the `DB` binding. Commit the change. `cf deploy` can create a missing database for you, but it doesn't write the ID to the config, and the remote migrations need that ID. So create the database yourself.

3. Apply the migrations.

   ```bash
   # Local D1 state is keyed by the database ID, so the local database is empty again
   vp run db:migrate

   # Apply the same migrations to the database you just created
   vp run db:migrate:remote
   ```

   Run `vp run db:migrate:remote` again whenever you add a migration, before you deploy the code that needs it.

4. Choose the Web app origin and register the Discord callback.

   The Web app origin is the public origin the deployed web app is served from. Without a custom domain it is `https://acme-tanstack-start.<your-subdomain>.workers.dev`. `acme-tanstack-start` is the Worker's `name` in `cloudflare.config.ts`, and the Cloudflare dashboard shows your `workers.dev` subdomain under Workers & Pages.

   In the [Discord developer portal](https://discord.com/developers/applications), add `<Web app origin>/api/auth/callback/discord` as a redirect of your application.

5. Deploy for the first time, with the secrets.

   The Worker needs four secrets: `AUTH_SECRET`, `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET` and `WEB_APP_ORIGIN`. `cf deploy` won't create a Worker while one of them is missing, and you can't set a secret on a Worker that doesn't exist yet. So the first deploy uploads them from a file.

   Create `.env.production.local` in the repository root. Git ignores it.

   ```bash
   # Generate one with `openssl rand -base64 32`
   AUTH_SECRET="..."
   AUTH_DISCORD_ID="..."
   AUTH_DISCORD_SECRET="..."
   WEB_APP_ORIGIN="https://acme-tanstack-start.<your-subdomain>.workers.dev"
   ```

   ```bash
   # The path is relative to apps/tanstack-start
   vp run deploy --secrets-file ../../.env.production.local
   ```

   Delete the file afterwards. The Worker keeps its secrets.

6. Deploy again whenever you want to ship.

   ```bash
   vp run deploy
   ```

   `vp run deploy` builds the web app and then runs `cf deploy --prebuilt`. The build comes from the cache when nothing changed. The deploy step is never cached, and it doesn't upload secrets. `vpr deploy` does the same, and both also work from the repository root.

7. Point the mobile app's [`getBaseUrl`](./apps/expo/src/utils/base-url.ts) at the Web app origin.

#### Changing a secret

```bash
vp exec cf workers secrets update AUTH_SECRET --worker acme-tanstack-start --type secret_text
```

`cf` asks for the new value and masks what you type. The command is the same for `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET` and `WEB_APP_ORIGIN`. In a script, pipe the value to the command on stdin. `--text <value>` works too, but it leaves the secret in your shell history and shows it in the process list.

The new value can take a while to apply everywhere. Cloudflare runs the Worker in isolates, and the web app reads its env once per isolate, when the isolate loads the Worker's code. Changing a secret doesn't change the code, so Cloudflare [may reuse the isolates that are already running](https://developers.cloudflare.com/workers/runtime-apis/bindings/#making-changes-to-bindings), and those keep the old value until Cloudflare replaces them. Cloudflare doesn't say when that happens. `vp run deploy` may not replace them either while the code is unchanged, because it uploads the same code.

When the old value must stop working promptly, for example after `AUTH_SECRET` leaked, change the secret and then deploy a change to the web app's code, one that changes the built output. Isolates that load the new code read the new value.

#### Workers Free or Paid

The Workers Free plan may be enough to try the starter. Workers Paid is recommended for anything you rely on. The limits you are most likely to hit on Free:

- 10 ms of CPU time per request. Cloudflare says requests that handle authentication or server-side rendering typically use 10 to 20 ms.
- 50 D1 queries per Worker invocation, against 1,000 on Paid.
- 500 MB per D1 database, against 10 GB on Paid.

### Expo

Deploying your mobile app works differently from deploying the web app. Instead of "deploying" your app online, you need to submit production builds of your app to app stores, like [Apple App Store](https://www.apple.com/app-store) and [Google Play](https://play.google.com/store/apps). You can read the full [guide to distributing your app](https://docs.expo.dev/distribution/introduction), including best practices, in the Expo docs.

1. Make sure to modify the `getBaseUrl` function to point to the Web app origin:

   [`apps/expo/src/utils/base-url.ts`](./apps/expo/src/utils/base-url.ts)

2. Let's start by setting up [EAS Build](https://docs.expo.dev/build/introduction), which is short for Expo Application Services. The build service helps you create builds of your app, without requiring a full native development setup. The commands below are a summary of [Creating your first build](https://docs.expo.dev/build/setup).

   ```bash
   # Install the EAS CLI
   vp install -g eas-cli

   # Log in with your Expo account
   eas login

   # Configure the mobile app
   cd apps/expo
   eas build:configure
   ```

3. After the initial setup, you can create your first build. You can build for Android and iOS platforms and use different [`eas.json` build profiles](https://docs.expo.dev/build-reference/eas-json) to create production builds or development, or test builds. Let's make a production build for iOS.

   ```bash
   eas build --platform ios --profile production
   ```

   > If you don't specify the `--profile` flag, EAS uses the `production` profile by default.

4. Now that you have your first production build, you can submit this to the stores. [EAS Submit](https://docs.expo.dev/submit/introduction) can help you send the build to the stores.

   ```bash
   eas submit --platform ios --latest
   ```

   > You can also combine build and submit in a single command, using `eas build ... --auto-submit`.

5. Before you can get your app in the hands of your users, you'll have to provide additional information to the app stores. This includes screenshots, app information, privacy policies, etc. _While still in preview_, [EAS Metadata](https://docs.expo.dev/eas/metadata) can help you with most of this information.

6. Once everything is approved, your users can finally enjoy your app. Let's say you spotted a small typo; you'll have to create a new build, submit it to the stores, and wait for approval before you can resolve this issue. In these cases, you can use EAS Update to quickly send a small bugfix to your users without going through this long process. Let's start by setting up EAS Update.

   The steps below summarize the [Getting started with EAS Update](https://docs.expo.dev/eas-update/getting-started/#configure-your-project) guide.

   ```bash
   # Add the `expo-updates` library to the mobile app
   cd apps/expo
   vp exec expo install expo-updates

   # Configure EAS Update
   eas update:configure
   ```

7. Before we can send out updates to your app, you have to create a new build and submit it to the app stores. For every change that includes native APIs, you have to rebuild the app and submit the update to the app stores. See steps 2 and 3.

8. Now that everything is ready for updates, let's create a new update for `production` builds. With the `--auto` flag, EAS Update uses your current git branch name and commit message for this update. See [How EAS Update works](https://docs.expo.dev/eas-update/how-eas-update-works/#publishing-an-update) for more information.

   ```bash
   cd apps/expo
   eas update --auto
   ```

   > Your OTA (Over The Air) updates must always follow the app store's rules. You can't change your app's primary functionality without getting app store approval. But this is a fast way to update your app for minor changes and bug fixes.

9. Done! Now that you have created your production build, submitted it to the stores, and installed EAS Update, you are ready for anything!
