#!/usr/bin/env node

import fs from "node:fs";
import { parseArgs } from "node:util";

import * as prompts from "@clack/prompts";
import { createSystemContext, runTemplate } from "bingo";

import template from "../src/template.ts";

// `vp create` runs this with the chosen parent directory (e.g. packages/) as
// the working directory. Instead of Bingo's interactive CLI, which asks for a
// directory before the name, the name is asked for first and used as the
// directory.
const { values } = parseArgs({
  options: {
    name: { type: "string" },
    deps: { type: "string" },
    "skip-requests": { type: "boolean" },
  },
});
const interactive = process.env.VP_CREATE_INTERACTIVE !== "0";

const toName = (value = "") => value.trim().replace(/^@acme\//, "");

function validateName(value?: string) {
  const name = toName(value);
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) {
    return "Use lowercase letters, digits, dots, dashes or underscores.";
  }
  if (fs.existsSync(name)) {
    return `Directory already exists: ${name}`;
  }
}

async function main() {
  let { name, deps } = values;
  if (interactive) {
    name ??= await ask(
      prompts.text({
        message: "Package name (you can skip the @acme/ prefix)",
        validate: validateName,
      }),
    );
    deps ??= await ask(
      prompts.text({
        message: "Dependencies to install (space separated)",
        placeholder: "none",
      }),
    );
  }
  if (name === undefined) {
    throw new Error(
      "Missing --name. Pass generator options after -- in vp create.",
    );
  }
  const error = validateName(name);
  if (error) throw new Error(error);
  name = toName(name);

  // Bingo's runner doesn't reject when a script fails, which would let a
  // failed dependency install exit 0.
  const { runner } = createSystemContext({ directory: name });
  await runTemplate(template, {
    directory: name,
    mode: "setup",
    options: { name, deps: deps?.split(/\s+/).filter(Boolean) ?? [] },
    skips: { requests: values["skip-requests"] },
    runner: async (command) => {
      const result = await runner(command);
      if (result instanceof Error) {
        throw new Error(`\`${command}\` failed in ${name}/\n${result.message}`);
      }
      return result;
    },
  });
}

async function ask(answer: Promise<string | symbol>) {
  const value = await answer;
  if (prompts.isCancel(value)) {
    prompts.cancel("Cancelled");
    process.exit(1);
  }
  return value;
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
