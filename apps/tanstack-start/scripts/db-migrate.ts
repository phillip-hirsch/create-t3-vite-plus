import { spawn } from "node:child_process";

import config from "../cloudflare.config.ts";

const { id } = config.worker.env.DB;
if (!id) {
  throw new Error("The DB binding in cloudflare.config.ts needs an id.");
}

// Applies the migrations in `packages/db` to the D1 database from
// `cloudflare.config.ts`. Extra arguments are passed on to `cf`.
const cf = spawn(
  "cf",
  [
    "d1",
    "migrations",
    "apply",
    id,
    "--dir",
    "../../packages/db/migrations",
    ...process.argv.slice(2),
  ],
  { stdio: ["inherit", "pipe", "inherit"] },
);

// With `--local`, cf 1.0.0-beta.14 prints its result and then never exits.
// Failures exit by themselves, so a complete result means it's done. Stop cf
// a second later: it ignores the signal while its local runtime shuts down.
let result = "";
cf.stdout.on("data", (chunk: Buffer) => {
  process.stdout.write(chunk);
  result += chunk.toString();
  if (isJson(result)) setTimeout(() => cf.kill(), 1000);
});
cf.on("exit", (code) => {
  process.exitCode = code ?? 0;
});

function isJson(text: string) {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}
