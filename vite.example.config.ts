import { defineConfig } from "vite";

// `npm run dev`: serves examples/ against the SDK's source.
// `npm run build:demo`: the same page, built for demo.pulsa.ar into demo-dist/.
export default defineConfig({
  root: "examples",
  server: { port: 5173 },
  build: {
    outDir: "../demo-dist",
    emptyOutDir: true,
  },
});
