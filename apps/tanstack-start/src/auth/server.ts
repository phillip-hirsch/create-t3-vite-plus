import { tanstackStartCookies } from "better-auth/tanstack-start";

import { initAuth } from "@acme/auth";
import { db } from "@acme/db/client";

import { env } from "~/env";
import { getBaseUrl } from "~/lib/url";

const baseUrl = getBaseUrl();

export const auth = initAuth({
  db,
  baseUrl,
  productionUrl: env.WEB_APP_ORIGIN ?? baseUrl,
  secret: env.AUTH_SECRET,
  discordClientId: env.AUTH_DISCORD_ID,
  discordClientSecret: env.AUTH_DISCORD_SECRET,

  extraPlugins: [tanstackStartCookies()],
});
