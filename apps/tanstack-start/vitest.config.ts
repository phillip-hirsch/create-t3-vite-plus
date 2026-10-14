import { defineConfig } from "vite-plus";

// Kept out of vite.config.ts so Vitest doesn't load the web app's plugins:
// the suite only sends HTTP requests to the built Worker.
export default defineConfig({
  test: {
    include: ["smoke/**/*.test.ts"],
    globalSetup: "./smoke/global-setup.ts",
  },
});
