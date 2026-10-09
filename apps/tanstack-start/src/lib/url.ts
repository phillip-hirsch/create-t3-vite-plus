import { env } from "~/env";

export function getBaseUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  // Env validation requires WEB_APP_ORIGIN in production.
  // eslint-disable-next-line no-restricted-properties
  if (process.env.NODE_ENV === "production" && env.WEB_APP_ORIGIN) {
    return env.WEB_APP_ORIGIN;
  }

  // eslint-disable-next-line no-restricted-properties
  return `http://localhost:${process.env.PORT ?? 3000}`;
}
