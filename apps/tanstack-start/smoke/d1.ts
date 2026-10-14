import config from "../cloudflare.config.ts";

// Runs SQL on a previewed Worker's local D1 database, through the Local
// Explorer API that the preview server exposes. `cf d1 query --local` isn't
// implemented yet.
export async function queryD1(
  workerUrl: string | undefined,
  sql: string,
): Promise<unknown> {
  const { id } = config.worker.env.DB;

  const response = await fetch(
    new URL(`/cdn-cgi/local/explorer/api/d1/database/${id}/raw`, workerUrl),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql }),
    },
  );

  if (!response.ok) {
    throw new Error(`D1 query failed: ${await response.text()}`);
  }

  return response.json();
}
