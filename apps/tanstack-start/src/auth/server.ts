import { reactStartCookies } from "better-auth/react-start";

import { initAuth } from "@acme/auth";

import { env } from "~/env";
import { getBaseUrl } from "~/lib/url";

export const auth = initAuth({
  baseUrl: getBaseUrl(),
  productionUrl:
    env.AUTH_REDIRECT_PROXY_URL ??
    (env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
      : getBaseUrl()),
  secret: env.AUTH_SECRET,
  discordClientId: env.AUTH_DISCORD_ID,
  discordClientSecret: env.AUTH_DISCORD_SECRET,

  extraPlugins: [reactStartCookies()],
});
