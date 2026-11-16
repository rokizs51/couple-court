import { describe, it, expect } from "vitest";
import worker from "../server/worker";
import { SECURITY_HEADERS } from "../server/headers";

const assets = { ASSETS: { fetch: async () => new Response("ok", { headers: { "content-type": "text/html" } }) } } as any;

describe("security headers", () => {
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
});