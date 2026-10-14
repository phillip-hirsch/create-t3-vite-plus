import { bindings, defineConfig } from "cf/config";

export default defineConfig(({ mode }) => ({
  worker: {
    name: "acme-tanstack-start",
    entrypoint: "@tanstack/react-start/server-entry",
    compatibilityDate: "2026-10-01",
    env: {
      // Placeholder: replace it with the ID that `cf d1 create` prints. Local
      // D1 state is keyed by this ID, so run `db:migrate` again afterwards.
      DB: bindings.d1({ id: "00000000-0000-4000-8000-000000000000" }),
      // In dev these load from the root `.env`.
      AUTH_SECRET: bindings.secret(),
      AUTH_DISCORD_ID: bindings.secret(),
      AUTH_DISCORD_SECRET: bindings.secret(),
      WEB_APP_ORIGIN: bindings.secret(),
      // better-auth reads NODE_ENV from process.env as its modules load, and
      // Vite can't inline that read. Without it, better-auth turns off its
      // production defaults, like rate limiting.
      ...(mode === "production" && { NODE_ENV: bindings.text("production") }),
    },
  },
}));
