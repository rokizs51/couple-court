import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import worker from "../server/worker";
import { SECURITY_HEADERS } from "../server/headers";

const assets = { ASSETS: { fetch: async () => new Response("ok", { headers: { "content-type": "text/html" } }) } } as any;

describe("security headers", () => {
  // In production run_worker_first = ["/api/*"], so static assets bypass this
  // Worker branch and are covered by public/_headers instead (tested below).
  it("are applied to static asset responses", async () => {
    const res = await worker.fetch(new Request("https://couple-court.example/"), assets);
    expect(res.status).toBe(200);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) expect(res.headers.get(k)).toBe(v);
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=31536000");
  });
  it("include the directives the PWA and share card need", () => {
    const csp = SECURITY_HEADERS["content-security-policy"];
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("worker-src 'self'");
    expect(csp).toContain("img-src 'self' data: blob:");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain("unsafe-eval");
  });
  it("public/_headers stays in sync with SECURITY_HEADERS", () => {
    const raw = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");
    const parsed: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s+([A-Za-z0-9-]+):\s*(.+?)\s*$/);
      if (m) parsed[m[1].toLowerCase()] = m[2];
    }
    expect(parsed).toEqual(SECURITY_HEADERS);
  });
});