import { createApp } from "./app";
import { UpstashStore } from "./upstash";
import { anthropicModel, mockModel } from "./model";

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  USE_REAL_MODEL?: string;
  DAILY_CAP?: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    // Only /api/* reaches the Worker first (see wrangler.toml); everything else is a static asset.
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);

    if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
      return Response.json({ error: "server_misconfigured" }, { status: 500 });
    }
    const real = env.USE_REAL_MODEL === "1" && !!env.ANTHROPIC_API_KEY;
    const app = createApp({
      store: new UpstashStore(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN),
      callModel: real ? anthropicModel(env.ANTHROPIC_API_KEY!, env.ANTHROPIC_MODEL ?? "claude-haiku-5-5") : mockModel,
      isRealModel: real,
      dailyCap: Number(env.DAILY_CAP ?? 300),
    });
    const res = await app.fetch(req);
    // API responses must never be cached by the browser, a CDN or the service worker.
    const out = new Response(res.body, res);
    out.headers.set("cache-control", "no-store");
    return out;
  },
};
