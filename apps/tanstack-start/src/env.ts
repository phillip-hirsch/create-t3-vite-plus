import { createEnv } from "@t3-oss/env-core";
import { z } from "zod/v4";

import { authEnv } from "@acme/auth/env";

export const env = createEnv({
  clientPrefix: "VITE_",
  extends: [authEnv()],
  shared: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },
  /**
   * Specify your server-side environment variables schema here.
   * This way you can ensure the app isn't built with invalid env vars.
   */
  server: {},

  /**
   * Specify your client-side environment variables schema here.
   * For them to be exposed to the client, prefix them with `VITE_`.
   */
  client: {
    // VITE_CLIENTVAR: z.string(),
  },
  /**
   * Destructure all variables from `process.env` to make sure they aren't tree-shaken away.
   * NODE_ENV is read by name, so that Vite inlines it: the browser bundle's
   * `process.env` is empty.
   */
  runtimeEnv: { ...process.env, NODE_ENV: process.env.NODE_ENV },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
