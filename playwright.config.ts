import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5173" },
  // Uses the already-running dev servers (mock model). Start them with: npx tsx server/dev.ts & npx vite
  reporter: "list",
});
