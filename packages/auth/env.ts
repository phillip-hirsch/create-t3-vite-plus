import { createEnv } from "@t3-oss/env-core";
import { z } from "zod/v4";

// Keep only the origin, so a trailing slash or path can't leak into callback URLs.
const origin = z
  .url({
    // Not z.httpUrl(): its domain check rejects localhost and IP addresses.
    protocol: /^https?$/,
    hostname: /./,
    error: (issue) =>
      issue.input === undefined
        ? "Required in production: set it to the web app's origin"
        : "Must be an http(s) URL",
  })
  .transform((url) => new URL(url).origin);

export function authEnv() {
  return createEnv({
    server: {
      // The deployed web app origin. Production can't infer it, so it's required there.
      WEB_APP_ORIGIN:
        process.env.NODE_ENV === "production" ? origin : origin.optional(),
      AUTH_DISCORD_ID: z.string().min(1),
      AUTH_DISCORD_SECRET: z.string().min(1),
      AUTH_SECRET:
        process.env.NODE_ENV === "production"
          ? z.string().min(1)
          : z.string().min(1).optional(),
      NODE_ENV: z.enum(["development", "production"]).optional(),
    },
    runtimeEnv: process.env,
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  });
}
