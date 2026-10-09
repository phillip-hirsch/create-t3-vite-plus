import { reactStartCookies } from "better-auth/react-start";

import { initAuth } from "@acme/auth";

import { env } from "~/env";
import { getBaseUrl } from "~/lib/url";

const baseUrl = getBaseUrl();

export const auth = initAuth({
  baseUrl,
  productionUrl: env.WEB_APP_ORIGIN ?? baseUrl,
  secret: env.AUTH_SECRET,
  discordClientId: env.AUTH_DISCORD_ID,
  discordClientSecret: env.AUTH_DISCORD_SECRET,

  extraPlugins: [reactStartCookies()],
});
