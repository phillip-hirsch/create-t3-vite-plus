import { defineConfig } from "vite-plus";

import { typecheck } from "@acme/tsconfig/typecheck";

export default defineConfig({
  run: {
    tasks: { typecheck },
  },
});
