import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      typecheck: {
        command: "tsc --noEmit",
        // tsc rewrites its own build info, which would block caching.
        cache: { input: [{ auto: true }, "!.cache/tsbuildinfo.json"] },
      },
    },
  },
});
