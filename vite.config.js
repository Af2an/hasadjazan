import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { assetsInlineLimit: 0, sourcemap: false },
  server: { proxy: { "/api": "http://localhost:3000" } },
  test: { environment: "node", include: ["tests/**/*.test.js"] }
});
