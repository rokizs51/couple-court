import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, Server } from "node:http";
import { UpstashStore } from "../server/upstash";
import { MemoryStore, Store } from "../server/store";

/** Minimal fake of the Upstash REST API (single command POST + /multi-exec). TTLs are tracked but not expired. */
function fakeUpstash() {
  const db = new Map<string, { v: string; ttl: number | null }>();
  const run = (c: (string | number)[]): unknown => {
    const [op, key, ...rest] = c as string[];
    switch (op.toUpperCase()) {
      case "GET": return db.get(key)?.v ?? null;
      case "DEL": return db.delete(key) ? 1 : 0;
      case "SET": {
        const nx = rest.includes("NX"); const ex = rest.indexOf("EX");
        if (nx && db.has(key)) return null;
        db.set(key, { v: rest[0], ttl: ex >= 0 ? Number(rest[ex + 1]) : null }); return "OK";
      }
      case "INCR": { const e = db.get(key); const n = (e ? Number(e.v) : 0) + 1; db.set(key, { v: String(n), ttl: e?.ttl ?? null }); return n; }
      case "EXPIRE": { const e = db.get(key); if (!e) return 0; if (rest.includes("NX") && e.ttl !== null) return 0; e.ttl = Number(rest[0]); return 1; }
      default: throw new Error("unsupported " + op);
    }
  };
  const server: Server = createServer((req, res) => {
    let body = ""; req.on("data", (d) => (body += d));
    req.on("end", () => {
      if (req.headers.authorization !== "Bearer tok") { res.statusCode = 401; return res.end(JSON.stringify({ error: "bad token" })); }
      try {
        const j = JSON.parse(body); res.setHeader("content-type", "application/json");
        if (req.url === "/multi-exec") res.end(JSON.stringify((j as any[]).map((c) => ({ result: run(c) }))));
        else res.end(JSON.stringify({ result: run(j) }));
      } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: "x" })); }
    });
  });
  return { server, db };
}

describe("UpstashStore matches the Store contract", () => {
  let fake: ReturnType<typeof fakeUpstash>; let url = ""; let up: Store;
  beforeAll(async () => {
    fake = fakeUpstash();
    await new Promise<void>((r) => fake.server.listen(0, "127.0.0.1", r));
    url = `http://127.0.0.1:${(fake.server.address() as any).port}`;
    up = new UpstashStore(url, "tok");
  });
  afterAll(() => fake.server.close());

  it("round-trips JSON and returns null for a missing key", async () => {
    expect(await up.get("nope")).toBeNull();
    await up.set("k", { a: 1, s: "héllo \"quoted\"" }, 60);
    expect(await up.get("k")).toEqual({ a: 1, s: "héllo \"quoted\"" });
  });
  it("sets a TTL in whole seconds", async () => {
    await up.set("t", 1, 12.2);
    expect(fake.db.get("t")!.ttl).toBe(13);
  });
  it("setNX only writes when absent (lock semantics)", async () => {
    expect(await up.setNX("lock", 1, 10)).toBe(true);
    expect(await up.setNX("lock", 1, 10)).toBe(false);
    await up.del("lock");
    expect(await up.setNX("lock", 1, 10)).toBe(true);
  });
  it("incr counts atomically and always leaves a TTL", async () => {
    expect(await up.incr("c", 100)).toBe(1);
    expect(await up.incr("c", 100)).toBe(2);
    expect(await up.incr("c", 100)).toBe(3);
    expect(fake.db.get("c")!.ttl).toBe(100);
  });
  it("errors do not leak response bodies", async () => {
    const bad = new UpstashStore(url, "wrong");
    await expect(bad.get("k")).rejects.toThrow(/^store_http_401$/);
  });
  it("behaves the same as MemoryStore for the same call sequence", async () => {
    const mem = new MemoryStore(); const u = new UpstashStore(url, "tok");
    for (const s of [mem, u] as Store[]) {
      await s.set("seq", { n: 1 }, 30);
    }
    expect(await u.get("seq")).toEqual(await mem.get("seq"));
    expect(await u.setNX("seq", 2, 5)).toBe(await mem.setNX("seq", 2, 5));
    expect(await u.incr("cnt2", 9)).toBe(await mem.incr("cnt2", 9));
  });
});
