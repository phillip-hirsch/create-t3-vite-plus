import { z } from "zod/v4";

import config from "../cloudflare.config.ts";

// What the Local Explorer API answers: a result per statement, with rows
// only for statements that return any.
const D1ResponseSchema = z.object({
  result: z.array(
    z.object({
      results: z
        .object({
          rows: z
            .array(z.array(z.union([z.number(), z.string(), z.null()])))
            .optional(),
        })
        .optional(),
    }),
  ),
});

// Runs SQL on a previewed Worker's local D1 database, through the Local
// Explorer API that the preview server exposes, and returns the rows of the
// first statement. `cf d1 query --local` isn't implemented yet.
export async function queryD1(workerUrl: string | undefined, sql: string) {
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

  const { result } = D1ResponseSchema.parse(await response.json());

  return result[0]?.results?.rows ?? [];
}
