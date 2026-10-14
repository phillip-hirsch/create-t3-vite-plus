import { readFileSync } from "node:fs";

import { expect, test } from "vite-plus/test";
import { z } from "zod/v4";

import { queryD1 } from "./d1.ts";

// The global setup passes the Workers' URLs, and the output of the Worker
// without WEB_APP_ORIGIN, through the environment.
const {
  SMOKE_WORKER_URL: worker,
  SMOKE_WORKER_WITHOUT_ORIGIN_URL: workerWithoutOrigin,
  SMOKE_WORKER_WITHOUT_ORIGIN_LOG: workerWithoutOriginLog = "",
  // eslint-disable-next-line no-restricted-properties
} = process.env;

// Shows the body when the status is wrong, so that the failure explains itself.
async function expectStatus(response: Response, status: number) {
  const body = await response.clone().text();
  expect(response.status, `${response.status} ${body}`).toBe(status);
}

test("the home page server-renders", async () => {
  const response = await fetch(new URL("/", worker));

  await expectStatus(response, 200);
  expect(response.headers.get("content-type")).toContain("text/html");
  // A seeded post, so the page rendered with data from D1. The hydration
  // scripts carry the posts too, so only the markup outside them counts.
  const markup = (await response.text()).replaceAll(
    /<script.*?<\/script>/gis,
    "",
  );
  expect(markup).toContain("Newest post");
});

test("post.all returns posts newest first", async () => {
  const response = await fetch(new URL("/api/trpc/post.all", worker));

  await expectStatus(response, 200);
  expect(await response.json()).toMatchObject({
    result: {
      data: {
        json: [
          { title: "Newest post" },
          { title: "Middle post" },
          { title: "Oldest post" },
        ],
      },
    },
  });
});

test("post.byId returns a seeded post", async () => {
  const url = new URL("/api/trpc/post.byId", worker);
  url.searchParams.set("input", JSON.stringify({ json: { id: "b" } }));
  const response = await fetch(url);

  await expectStatus(response, 200);
  expect(await response.json()).toMatchObject({
    result: {
      data: {
        json: {
          id: "b",
          title: "Newest post",
          content: "Created last",
          createdAt: "1970-01-01T00:00:03.000Z",
        },
      },
    },
  });
});

function mutate(procedure: string, input: unknown) {
  return fetch(new URL(`/api/trpc/${procedure}`, worker), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ json: input }),
  });
}

test("post.create returns 401 without a session", async () => {
  const response = await mutate("post.create", { title: "New", content: "-" });

  await expectStatus(response, 401);
});

test("post.delete returns 401 without a session", async () => {
  const response = await mutate("post.delete", "a");

  await expectStatus(response, 401);
});

test("production tRPC errors contain no stack trace", async () => {
  const response = await mutate("post.create", { title: "New", content: "-" });
  const error: unknown = await response.json();

  expect(error).toMatchObject({
    error: { json: { data: { code: "UNAUTHORIZED" } } },
  });
  expect(error).not.toHaveProperty("error.json.data.stack");
});

test("better-auth get-session responds", async () => {
  const response = await fetch(new URL("/api/auth/get-session", worker));

  await expectStatus(response, 200);
  expect(await response.json()).toBeNull();
});

test("Discord sign-in returns an authorization URL and writes a verification row", async () => {
  const countVerifications = "SELECT count(*) FROM verification";
  expect(await queryD1(worker, countVerifications)).toMatchObject({
    result: [{ results: { rows: [[0]] } }],
  });

  const response = await fetch(new URL("/api/auth/sign-in/social", worker), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "discord", callbackURL: "/" }),
  });

  await expectStatus(response, 200);
  const { url } = z.object({ url: z.url() }).parse(await response.json());
  const authorization = new URL(url);
  expect(authorization.origin + authorization.pathname).toBe(
    "https://discord.com/api/oauth2/authorize",
  );
  expect(authorization.searchParams.get("client_id")).toBe("smoke-discord-id");
  // Built on the Web app origin that the global setup configures.
  expect(authorization.searchParams.get("redirect_uri")).toBe(
    "https://smoke.example/api/auth/callback/discord",
  );
  expect(await queryD1(worker, countVerifications)).toMatchObject({
    result: [{ results: { rows: [[1]] } }],
  });
});

// Each plugin's route rejects a request without its query parameters. Without
// the plugin, the route would be a 404.
test.each(["expo-authorization-proxy", "oauth-proxy-callback"])(
  "the %s endpoint responds",
  async (endpoint) => {
    const response = await fetch(new URL(`/api/auth/${endpoint}`, worker));

    await expectStatus(response, 400);
    expect(await response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  },
);

// The same request succeeds on the Worker that has the variable.
test("without WEB_APP_ORIGIN, the production Worker fails env validation", async () => {
  const response = await fetch(new URL("/", workerWithoutOrigin));

  await expectStatus(response, 500);
  // The response doesn't say why, but the Worker logs the failed validation.
  // Only WEB_APP_ORIGIN's validation has this message.
  await expect
    .poll(() => readFileSync(workerWithoutOriginLog, "utf8"))
    .toContain("Required in production: set it to the web app's origin");
});
