import { defineConfig } from "vite";

// One self-contained file for a <script type="module"> tag, with MediaPipe bundled in.
export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: () => "pulsa.js",
    },
    sourcemap: true,
  },
});
