import { defineConfig } from "vitest/config";

export default defineConfig({
  server: {
    strictPort: true,
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
