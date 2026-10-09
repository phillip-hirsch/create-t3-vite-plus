import { reactStartCookies } from "better-auth/react-start";

import { initAuth } from "@acme/auth";
import { isSelfHostedProduction } from "@acme/auth/env";

import { env } from "~/env";
import { getBaseUrl } from "~/lib/url";

// On the server, getBaseUrl() is localhost outside Vercel, so self-hosted
// production uses AUTH_REDIRECT_PROXY_URL (required there by env validation).
const baseUrl =
  isSelfHostedProduction && env.AUTH_REDIRECT_PROXY_URL
    ? env.AUTH_REDIRECT_PROXY_URL
    : getBaseUrl();

export const auth = initAuth({
  baseUrl,
  productionUrl:
    env.AUTH_REDIRECT_PROXY_URL ??
    (env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
      : baseUrl),
  secret: env.AUTH_SECRET,
  discordClientId: env.AUTH_DISCORD_ID,
  discordClientSecret: env.AUTH_DISCORD_SECRET,

  extraPlugins: [reactStartCookies()],
});
