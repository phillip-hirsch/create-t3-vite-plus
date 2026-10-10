import { spawn } from "node:child_process";

import config from "../cloudflare.config.ts";

const { id } = config.worker.env.DB;
if (!id) {
  throw new Error("The DB binding in cloudflare.config.ts needs an id.");
}

// `--quiet` is handled here instead of passed on, because it would hide the
// result this script waits for.
const args = process.argv.slice(2);
const forwarded = args.filter((arg) => arg !== "--quiet" && arg !== "-q");
const quiet = forwarded.length < args.length;

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
    ...forwarded,
  ],
  { stdio: ["inherit", "pipe", "inherit"] },
);

// With `--local`, cf 1.0.0-beta.14 prints its result and then never exits.
// Failures exit by themselves, so a complete result means it's done. Stop cf
// a second later: it ignores the signal while its local runtime shuts down.
// Only that stop counts as success. Any other signal exit is a failure.
let result = "";
let stopped = false;
cf.stdout.on("data", (chunk: Buffer) => {
  if (!quiet) process.stdout.write(chunk);
  result += chunk.toString();
  if (isJson(result)) setTimeout(() => (stopped = cf.kill()), 1000);
});
cf.on("exit", (code, signal) => {
  if (signal && !stopped) console.error(`cf was stopped by ${signal}.`);
  process.exitCode = stopped ? 0 : (code ?? 1);
});

// Whatever else cf does, never wait for it longer than this.
const minutes = 5;
setTimeout(() => {
  console.error(`cf didn't finish within ${minutes} minutes.`);
  cf.kill();
  process.exit(1);
}, minutes * 60_000).unref();

function isJson(text: string) {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}
