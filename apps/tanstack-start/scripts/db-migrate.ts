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

// With `--local`, cf 1.0.0-beta.14 prints its result and then never exits, and
// it can exit 0 after a migration failed. So the result decides whether the
// migrations were applied, not the exit. Stop cf a second after the result:
// it ignores the signal while its local runtime shuts down.
let output = "";
let applied: boolean | undefined;
let stopped = false;
cf.stdout.setEncoding("utf8").on("data", (chunk: string) => {
  if (!quiet) process.stdout.write(chunk);
  output += chunk;
  const result = parse(output);
  if (result === undefined) return;
  const problem = failure(result);
  if (problem) console.error(problem);
  applied = !problem;
  setTimeout(() => (stopped = cf.kill()), 1000).unref();
});
cf.on("exit", (code, signal) => {
  // How cf dies after this script's own stop says nothing, even if it exits
  // non-zero. Before that its exit code stands, and a signal is a failure.
  const exit = stopped ? 0 : (code ?? 1);
  if (signal && !stopped) console.error(`cf was stopped by ${signal}.`);
  if (exit === 0 && applied === undefined) {
    console.error("cf exited without a result.");
  }
  // A clean exit still needs a result with every migration applied.
  process.exitCode = exit === 0 && !applied ? 1 : exit;
});

// Whatever else cf does, never wait for it longer than this.
const minutes = 5;
setTimeout(() => {
  console.error(`cf didn't finish within ${minutes} minutes.`);
  cf.kill();
  process.exit(1);
}, minutes * 60_000).unref();

// What `cf d1 migrations apply` prints: a row for each migration it ran, so
// `[]` when there was nothing to apply.
interface Migration {
  name: string;
  status: string;
}

// The complete result, or `undefined` while cf is still printing it.
function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// Why the result doesn't count as applied, if it doesn't.
function failure(result: unknown) {
  if (!Array.isArray(result) || !result.every(isMigration)) {
    return "cf printed a result this script doesn't understand.";
  }
  const failed = result.filter((row) => row.status !== "✅");
  if (failed.length > 0) {
    return `Failed to apply ${failed.map((row) => row.name).join(", ")}.`;
  }
}

function isMigration(row: unknown): row is Migration {
  return (
    typeof row === "object" &&
    row !== null &&
    "name" in row &&
    typeof row.name === "string" &&
    "status" in row &&
    typeof row.status === "string"
  );
}
