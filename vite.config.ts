/// <reference types="vitest/config" />
import { defineConfig } from "vite";

// The npm build: MediaPipe and React stay external, so an app bundles each once.
export default defineConfig({
  build: {
    lib: {
      entry: { index: "src/index.ts", react: "src/react/index.ts" },
      formats: ["es"],
    },
    rollupOptions: {
      external: ["@mediapipe/tasks-vision", "react", /^react\//],
    },
    sourcemap: true,
  },
  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
  },
});
