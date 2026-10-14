import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, lazyPlugins } from "vite-plus";

import { typecheck } from "@acme/tsconfig/typecheck";

// The smoke suite sets this to preview against its own local state, and
// without the inspector: previews that start together can pick the same free
// port for it, and then the one that loses answers every request with a 500.
const smokeStateDir = process.env.SMOKE_STATE_DIR;

// The web app's local port, for `vp dev` and `vp preview`. The mobile app reads
// the same variable in `apps/expo/app.config.ts`.
const port = Number(process.env.WEB_APP_PORT || 3000);

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    // Listen on all interfaces so the mobile app can reach the API.
    host: true,
    port,
    strictPort: true,
  },
  // Host and strictPort default to the server's.
  preview: { port },
  // The Worker only sees declared bindings, so `~/lib/url` gets the port here.
  define: { "process.env.WEB_APP_PORT": JSON.stringify(String(port)) },
  plugins: lazyPlugins(() => [
    cloudflare({
      viteEnvironment: { name: "ssr" },
      persistState: { path: smokeStateDir ?? ".cloudflare/state" },
      inspectorPort: smokeStateDir ? false : undefined,
    }),
    tanstackStart(),
    viteReact(),
    tailwindcss(),
  ]),
  run: {
    tasks: {
      build: {
        command: "vp build",
        // Cached tasks get a clean environment, so pass through (and
        // fingerprint) the variables the build reads.
        cache: {
          // The Cloudflare plugin reads its previous output before
          // overwriting it.
          input: [
            { auto: true },
            "!.cloudflare/**",
            "!.wrangler/**",
            "!dist/**",
          ],
          env: ["NODE_ENV", "CLOUDFLARE_ENV"],
        },
      },
      deploy: {
        command: "cf deploy --prebuilt",
        dependsOn: ["build"],
        cache: false,
      },
      typecheck,
    },
  },
});
