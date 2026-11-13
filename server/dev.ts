import { serve } from "@hono/node-server";
import { readFileSync, existsSync } from "node:fs";
import { createApp } from "./app";
import { MemoryStore } from "./store";
import { anthropicModel, mockModel } from "./model";

// Minimal .env loader (server side only).
if (existsSync(".env")) for (const l of readFileSync(".env", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const real = process.env.USE_REAL_MODEL === "1" && !!process.env.ANTHROPIC_API_KEY;
const app = createApp({
  store: new MemoryStore(),
  callModel: real ? anthropicModel(process.env.ANTHROPIC_API_KEY!, process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5") : mockModel,
  isRealModel: real, dailyCap: Number(process.env.DAILY_CAP ?? 300), adminToken: process.env.ADMIN_TOKEN || undefined,
});
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => console.log(`API on :${port} model=${real ? "REAL" : "mock"}`));
