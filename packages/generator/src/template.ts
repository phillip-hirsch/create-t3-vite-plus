import fs from "node:fs";

import { createTemplate } from "bingo";
import { parse } from "yaml";
import { z } from "zod";

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const { catalog = {} } = parse(
  fs.readFileSync(
    new URL("../../../pnpm-workspace.yaml", import.meta.url),
    "utf8",
  ),
) as { catalog?: Record<string, string> };
const inCatalog = (dep: string) => Object.hasOwn(catalog, dep);

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
    // Dependencies in the default catalog get `catalog:`, like in the other
    // packages. `pnpm add` picks the latest version of the rest.
    const catalogDeps = options.deps.filter(inCatalog).sort();
    const otherDeps = options.deps.filter((dep) => !inCatalog(dep));

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
          ...(catalogDeps.length > 0 && {
            dependencies: Object.fromEntries(
              catalogDeps.map((dep) => [dep, "catalog:"]),
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

export default defineConfig({
  run: {
    tasks: {
      typecheck: {
        command: "tsc --noEmit",
        // tsc rewrites its own build info, which would block caching.
        cache: { input: [{ auto: true }, "!.cache/tsbuildinfo.json"] },
      },
    },
  },
});
`,
        src: {
          "index.ts": `export const name = "${options.name}";\n`,
        },
      },
      scripts: otherDeps.length > 0 ? [`pnpm add ${otherDeps.join(" ")}`] : [],
    };
  },
});
