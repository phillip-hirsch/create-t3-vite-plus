// The secrets the global setup passes to the previewed Workers, shared with
// the tests that check them.
export const secrets = {
  AUTH_SECRET: "smoke-test-secret-of-at-least-32-characters",
  AUTH_DISCORD_ID: "smoke-discord-id",
  AUTH_DISCORD_SECRET: "smoke-discord-secret",
  WEB_APP_ORIGIN: "https://smoke.example",
};
