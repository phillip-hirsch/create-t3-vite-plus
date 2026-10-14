import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { queryD1 } from "./d1.ts";

const secrets = {
  AUTH_SECRET: "smoke-test-secret-of-at-least-32-characters",
  AUTH_DISCORD_ID: "smoke-discord-id",
  AUTH_DISCORD_SECRET: "smoke-discord-secret",
  WEB_APP_ORIGIN: "https://smoke.example",
};

// The app directory: `vp test` can run from the repository root too.
const app = fileURLToPath(new URL("..", import.meta.url));

// Runs the built Worker in workerd against a new local D1 database, and a
// second one without WEB_APP_ORIGIN. Returns the teardown.
export default async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "acme-smoke-"));
  // The process groups of everything the setup starts.
  const groups: number[] = [];
  // Synchronous, so that it can also run as the process exits: Vitest doesn't
  // call the teardown when it's interrupted.
  const teardown = () => {
    process.off("exit", teardown);
    stop(groups);
    rmSync(dir, { recursive: true, force: true });
  };
  process.once("exit", teardown);

  try {
    const stateDir = join(dir, "with-origin");
    const log = join(dir, "with-origin.log");
    await migrate(groups, stateDir, log);
    const worker = await preview(groups, log, {
      ...secrets,
      SMOKE_STATE_DIR: stateDir,
    });
    const withoutOriginLog = join(dir, "without-origin.log");
    const workerWithoutOrigin = await preview(groups, withoutOriginLog, {
      ...secrets,
      WEB_APP_ORIGIN: undefined,
      SMOKE_STATE_DIR: join(dir, "without-origin"),
    });
    // Neither the ids nor the insert order follow the creation times.
    await queryD1(
      worker,
      `INSERT INTO post (id, title, content, created_at) VALUES
        ('c', 'Middle post', 'Created second', 2000),
        ('b', 'Newest post', 'Created last', 3000),
        ('a', 'Oldest post', 'Created first', 1000)`,
    );

    // Test files run in other processes, which inherit the environment.
    // eslint-disable-next-line no-restricted-properties
    Object.assign(process.env, {
      SMOKE_WORKER_URL: worker,
      SMOKE_WORKER_LOG: log,
      SMOKE_WORKER_WITHOUT_ORIGIN_URL: workerWithoutOrigin,
      SMOKE_WORKER_WITHOUT_ORIGIN_LOG: withoutOriginLog,
    });
  } catch (error) {
    teardown();
    throw error;
  }
  return teardown;
}

// Starts `vp` in its own process group, because stopping `vp` alone orphans
// what it started. Its output goes to the log, which is shown when the
// command fails.
function start(
  groups: number[],
  log: string,
  args: string[],
  env?: Record<string, string | undefined>,
) {
  const output = openSync(log, "a");
  const child = spawn("vp", args, {
    cwd: app,
    detached: true,
    // eslint-disable-next-line no-restricted-properties
    env: { ...process.env, ...env },
    stdio: ["ignore", output, output],
  });
  closeSync(output);
  if (child.pid !== undefined) groups.push(child.pid);
  return child;
}

// `vp exec` puts the local `cf` on the path. The wrapper script stops `cf`,
// which doesn't exit by itself after a local migration.
async function migrate(groups: number[], stateDir: string, log: string) {
  const child = start(groups, log, [
    "exec",
    "node",
    "scripts/db-migrate.ts",
    "--local",
    "--persist-to",
    stateDir,
    "--quiet",
  ]);
  await once(child, "exit");
  if (child.exitCode !== 0) {
    throw new Error(`The migration failed:\n${readFileSync(log, "utf8")}`);
  }
}

// Starts `vp preview` on a free port and resolves with its URL once it serves.
async function preview(
  groups: number[],
  log: string,
  env: Record<string, string | undefined>,
) {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const child = start(
    groups,
    log,
    ["preview", "--host", "127.0.0.1", "--port", `${port}`, "--strictPort"],
    env,
  );

  const timeout = AbortSignal.timeout(60_000);
  while (child.exitCode === null && !timeout.aborted) {
    try {
      await fetch(url, { signal: timeout });
      return url;
    } catch {
      await delay(100);
    }
  }
  throw new Error(`vp preview didn't start:\n${readFileSync(log, "utf8")}`);
}

// Stops the process groups and waits until nothing in them is running: a
// process that outlives the state directory creates it again.
function stop(groups: number[]) {
  signal(groups, "SIGTERM");
  const patience = Date.now() + 5000;
  while (running(groups)) {
    if (Date.now() > patience) signal(groups, "SIGKILL");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
}

function signal(groups: number[], name: NodeJS.Signals) {
  for (const group of groups) {
    try {
      process.kill(-group, name);
    } catch {
      // The group is already gone.
    }
  }
}

// Asks `ps` instead of sending signal 0: a stopped group leader stays a zombie
// until this process reaps it, which it can't do while it's exiting.
function running(groups: number[]) {
  const { stdout } = spawnSync("ps", ["-A", "-o", "pgid=", "-o", "stat="], {
    encoding: "utf8",
  });
  return stdout.split("\n").some((line) => {
    const [group, state] = line.trim().split(/\s+/);
    return groups.includes(Number(group)) && !state?.startsWith("Z");
  });
}

async function freePort() {
  const server = createServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  server.close();
  await once(server, "close");
  if (address === null || typeof address === "string") {
    throw new Error("Couldn't find a free port.");
  }
  return address.port;
}
