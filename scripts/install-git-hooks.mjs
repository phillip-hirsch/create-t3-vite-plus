// Installs the Vite+ git hook dispatcher during `prepare`. Docker and deploy
// builds can lack git or a repository, so setup is skipped there; any other
// failure fails the install. `vp config` alone would report a repository that
// git refuses to read (for example, dubious ownership) as missing and exit 0.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

function skip(reason) {
  console.log(`Skipped git hook setup: ${reason}`);
  process.exit(0);
}

if (!existsSync(".git")) skip("not a git repository");

const git = spawnSync("git", ["rev-parse", "--git-dir"], {
  stdio: ["ignore", "ignore", "inherit"],
});
if (git.error?.code === "ENOENT") skip("git is not installed");
if (git.status !== 0) process.exit(git.status ?? 1);

const { status } = spawnSync("vp config --no-agent", {
  shell: true,
  stdio: "inherit",
});
process.exitCode = status ?? 1;
