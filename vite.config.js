import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { assetsInlineLimit: 0, sourcemap: false },
  server: { proxy: { "/api": "http://localhost:3000" } },
  // each test starts its own in-memory Postgres, which can take a few seconds on a busy machine
  test: { environment: "node", include: ["tests/**/*.test.js"], testTimeout: 30000 }
});
