// Installs the Vite+ git hook dispatcher during `prepare`. Docker and deploy
// builds can lack git or a repository, so setup is skipped there; any other
// `vp config` failure fails the install.
import { execSync, spawnSync } from "node:child_process";

try {
  execSync("git rev-parse --git-dir", { stdio: "ignore" });
} catch {
  console.log("Skipped git hook setup: no git repository");
  process.exit(0);
}

const { status } = spawnSync("vp config --no-agent", {
  shell: true,
  stdio: "inherit",
});
process.exitCode = status ?? 1;
