import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, esmExternalRequirePlugin } from "vite";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  environments: {
    ssr: {
      build: {
        rolldownOptions: {
          // Keep React requires visible to Nitro so SSR uses one React instance.
          plugins: [esmExternalRequirePlugin({ external: ["react"] })],
        },
      },
    },
  },
  server: {
    port: 3000,
    strictPort: true,
  },
  plugins: [nitro(), tanstackStart(), viteReact(), tailwindcss()],
});
