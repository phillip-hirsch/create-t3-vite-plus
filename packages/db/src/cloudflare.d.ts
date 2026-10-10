// Types the `DB` binding for projects without the web app's generated Worker
// types. Those declare `cloudflare:workers` exactly, which wins over a pattern.
declare module "cloudflare:*" {
  import type { D1Database } from "@cloudflare/workers-types";

  export const env: { DB: D1Database };
}
