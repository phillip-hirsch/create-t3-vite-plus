import type { ChildProcess } from "node:child_process";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { rmSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

import { queryD1 } from "./d1.ts";

const secrets = {
  AUTH_SECRET: "smoke-test-secret-of-at-least-32-characters",
  AUTH_DISCORD_ID: "smoke-discord-id",
  AUTH_DISCORD_SECRET: "smoke-discord-secret",
  WEB_APP_ORIGIN: "https://smoke.example",
};

// Runs the built Worker in workerd against a new local D1 database, and a
// second one without WEB_APP_ORIGIN. Returns the teardown.
export default async function setup() {
  const stateDir = await mkdtemp(join(tmpdir(), "acme-smoke-"));
  const previews: ChildProcess[] = [];
  // Vitest exits without calling the teardown when it's interrupted.
  const stopOnExit = () => {
    for (const child of previews) signalGroup(child, "SIGTERM");
    rmSync(stateDir, { recursive: true, force: true });
  };
  process.once("exit", stopOnExit);
  const teardown = async () => {
    process.off("exit", stopOnExit);
    await Promise.all(previews.map(stop));
    await rm(stateDir, { recursive: true, force: true });
  };

  try {
    await migrate(stateDir);
    // One at a time: previews that start together race for the inspector port.
    const worker = await preview(previews, {
      ...secrets,
      SMOKE_STATE_DIR: stateDir,
    });
    const workerWithoutOrigin = await preview(previews, {
      ...secrets,
      WEB_APP_ORIGIN: undefined,
      SMOKE_STATE_DIR: join(stateDir, "without-origin"),
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
      SMOKE_WORKER_WITHOUT_ORIGIN_URL: workerWithoutOrigin,
    });
  } catch (error) {
    await teardown();
    throw error;
  }
  return teardown;
}

// `vp exec` puts the local `cf` on the path. The wrapper script stops `cf`,
// which doesn't exit by itself after a local migration.
async function migrate(stateDir: string) {
  await promisify(execFile)("vp", [
    "exec",
    "node",
    "scripts/db-migrate.ts",
    "--local",
    "--persist-to",
    stateDir,
    "--quiet",
  ]);
}

// Starts `vp preview` on a free port and resolves with its URL once it serves.
async function preview(
  previews: ChildProcess[],
  env: Record<string, string | undefined>,
) {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(
    "vp",
    ["preview", "--host", "127.0.0.1", "--port", `${port}`, "--strictPort"],
    {
      // Its own process group, because stopping `vp` alone orphans workerd.
      detached: true,
      // eslint-disable-next-line no-restricted-properties
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  previews.push(child);
  // Only shown when the preview doesn't start.
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));

  const timeout = AbortSignal.timeout(60_000);
  while (child.exitCode === null && !timeout.aborted) {
    try {
      await fetch(url, { signal: timeout });
      return url;
    } catch {
      await delay(100);
    }
  }
  throw new Error(`vp preview didn't start:\n${output}`);
}

// Stops a preview and waits until its whole process group is gone.
async function stop(child: ChildProcess) {
  const patience = AbortSignal.timeout(5000);
  signalGroup(child, "SIGTERM");
  // Signal 0 only checks that the group still has a process.
  while (signalGroup(child, patience.aborted ? "SIGKILL" : 0)) {
    await delay(50);
  }
}

// Returns false once no process is left in the preview's group.
function signalGroup(child: ChildProcess, signal: NodeJS.Signals | 0) {
  try {
    return child.pid !== undefined && process.kill(-child.pid, signal);
  } catch {
    return false;
  }
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
