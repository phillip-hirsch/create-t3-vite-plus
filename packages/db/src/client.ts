// The reference travels with this file into every project that imports it.
// eslint-disable-next-line typescript/triple-slash-reference
/// <reference path="./cloudflare.d.ts" />
import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";

export const db = drizzle(env.DB, {
  schema,
  casing: "snake_case",
});
