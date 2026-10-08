// The cached `typecheck` task for each package's vite.config.ts. Vite+ can't
// inherit tasks from the root config.
const workspace = (pattern: string) => ({
  pattern,
  base: "workspace" as const,
});

export const typecheck = {
  command: "tsc --noEmit",
  cache: {
    // Automatic tracking only sees TypeScript 7's Node launcher, not the files
    // its native compiler reads, so list them. Packages import each other's
    // source, so any change in the workspace invalidates every package.
    input: [
      workspace("**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,json}"),
      workspace("pnpm-lock.yaml"),
      workspace("!**/node_modules/**"),
      // tsc rewrites its own build info, which would block caching.
      workspace("!**/.cache/**"),
      workspace("!**/{.nitro,.output}/**"),
    ],
  },
};
