import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, esmExternalRequirePlugin, lazyPlugins } from "vite-plus";

import { typecheck } from "@acme/tsconfig/typecheck";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  environments: {
    ssr: {
      build: {
        rolldownOptions: {
          // Keep React requires visible to Nitro so SSR uses one React instance.
          // Rolldown ignores this plugin if it comes from a different
          // vite-plus-core copy than the one building. `vp run` from the repo
          // root builds with the root's copy, so the root devDepends on
          // `@types/node` to resolve the same peer variant as this app.
          plugins: [esmExternalRequirePlugin({ external: ["react"] })],
        },
      },
    },
  },
  server: {
    // Listen on all interfaces so the mobile app can reach the API.
    host: true,
    port: 3000,
    strictPort: true,
  },
  plugins: lazyPlugins(() => [
    nitro(),
    tanstackStart(),
    viteReact(),
    tailwindcss(),
  ]),
  run: {
    tasks: {
      build: {
        command: "vp build",
        // Cached tasks get a clean environment, so pass through (and
        // fingerprint) the variables the app's env schema and Nitro read.
        cache: {
          // Nitro reads its previous output before overwriting it.
          input: [{ auto: true }, "!.nitro/**", "!.output/**"],
          env: [
            "SKIP_ENV_VALIDATION",
            "POSTGRES_URL",
            "AUTH_*",
            "WEB_APP_ORIGIN",
            "NODE_ENV",
            "PORT",
            "NITRO_PRESET",
            "SERVER_PRESET",
            "GITHUB_ACTIONS",
            "NITRO_COMPATIBILITY_DATE",
            "SERVER_COMPATIBILITY_DATE",
            "COMPATIBILITY_DATE",
          ],
        },
      },
      typecheck,
    },
  },
});
