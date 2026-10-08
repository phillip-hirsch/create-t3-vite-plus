import fs from "node:fs";

import { createTemplate } from "bingo";
import { parse } from "yaml";
import { z } from "zod";

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const root = new URL("../../../", import.meta.url);
const readJson = (path: string) =>
  JSON.parse(fs.readFileSync(new URL(path, root), "utf8")) as unknown;

const { packages, catalog = {} } = parse(
  fs.readFileSync(new URL("pnpm-workspace.yaml", root), "utf8"),
) as { packages: string[]; catalog?: Record<string, string> };

// Reuse the version specifiers the workspace already has, so sherif doesn't
// flag a second version. The default catalog wins over pinned versions.
const knownVersions = new Map<string, string>();
for (const path of fs.globSync(
  packages.map((dir) => `${dir}/package.json`),
  { cwd: root },
)) {
  const { dependencies, devDependencies } = readJson(path) as Partial<
    Record<"dependencies" | "devDependencies", Record<string, string>>
  >;
  for (const [dep, version] of Object.entries({
    ...devDependencies,
    ...dependencies,
  })) {
    knownVersions.set(dep, version);
  }
}
for (const dep of Object.keys(catalog)) knownVersions.set(dep, "catalog:");

export default createTemplate({
  about: {
    name: "@acme/generator",
    description: "Generate a new @acme package",
  },

  options: {
    name: z.string().describe("package name, without the @acme/ prefix"),
    deps: z.array(z.string()).describe("dependencies to install"),
  },

  produce({ options }) {
    // Dependencies the workspace already uses get the same specifier.
    // `vp add` picks the latest version of the rest.
    const knownDeps = options.deps.filter((dep) => knownVersions.has(dep));
    const otherDeps = options.deps.filter((dep) => !knownVersions.has(dep));

    return {
      files: {
        "package.json": json({
          name: `@acme/${options.name}`,
          private: true,
          type: "module",
          exports: {
            ".": {
              types: "./src/index.ts",
              default: "./src/index.ts",
            },
          },
          license: "MIT",
          scripts: {
            clean: "git clean -xdf .cache dist node_modules",
          },
          ...(knownDeps.length > 0 && {
            dependencies: Object.fromEntries(
              knownDeps.sort().map((dep) => [dep, knownVersions.get(dep)]),
            ),
          }),
          devDependencies: {
            "@acme/tsconfig": "workspace:*",
            typescript: "catalog:",
            "vite-plus": "catalog:",
          },
        }),
        "tsconfig.json": json({
          extends: "@acme/tsconfig/base.json",
          include: ["src"],
          exclude: ["node_modules"],
        }),
        "vite.config.ts": `import { defineConfig } from "vite-plus";

import { typecheck } from "@acme/tsconfig/typecheck";

export default defineConfig({
  run: {
    tasks: { typecheck },
  },
});
`,
        src: {
          "index.ts": `export const name = "${options.name}";\n`,
        },
      },
      // Install here, where a failure exits non-zero. `vp create` ignores a
      // failed install of its own, which then finds nothing left to do.
      scripts: [
        otherDeps.length > 0 ? `vp add ${otherDeps.join(" ")}` : "vp install",
      ],
    };
  },
});
