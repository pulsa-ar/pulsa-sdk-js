import { defineConfig } from "vite";

// `npm run dev`: serves examples/ against the SDK's source.
export default defineConfig({
  root: "examples",
  server: { port: 5173 },
});
