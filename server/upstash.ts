import type { Store } from "./store";

/**
 * Store backed by Upstash Redis over its REST API (fetch only, so it runs on Workers).
 * Same contract as MemoryStore: JSON values, TTL in seconds, atomic setNX and incr.
 */
export class UpstashStore implements Store {
  constructor(private url: string, private token: string) {
    this.url = url.replace(/\/+$/, "");
  }

  private async cmd<T = unknown>(command: (string | number)[]): Promise<T> {
    const r = await fetch(this.url, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify(command),
    });
    // Never include the response body in errors: it can echo stored statements.
    if (!r.ok) throw new Error("store_http_" + r.status);
    const j = (await r.json()) as { result?: T; error?: string };
    if (j.error) throw new Error("store_error");
    return j.result as T;
  }

  async get<T>(key: string): Promise<T | null> {
    const v = await this.cmd<string | null>(["GET", key]);
    return v == null ? null : (JSON.parse(v) as T);
  }

  async set(key: string, val: unknown, ttlSec: number) {
    await this.cmd(["SET", key, JSON.stringify(val), "EX", Math.max(1, Math.ceil(ttlSec))]);
  }

  async setNX(key: string, val: unknown, ttlSec: number) {
    const r = await this.cmd<string | null>(["SET", key, JSON.stringify(val), "NX", "EX", Math.max(1, Math.ceil(ttlSec))]);
    return r === "OK";
  }

  async del(key: string) {
    await this.cmd(["DEL", key]);
  }

  /** INCR + EXPIRE NX in one MULTI/EXEC so a counter can never be left without a TTL. */
  async incr(key: string, ttlSec: number) {
    const r = await fetch(`${this.url}/multi-exec`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify([["INCR", key], ["EXPIRE", key, Math.max(1, Math.ceil(ttlSec)), "NX"]]),
    });
    if (!r.ok) throw new Error("store_http_" + r.status);
    const j = (await r.json()) as { result?: unknown; error?: string }[];
    if (!Array.isArray(j) || j[0]?.error) throw new Error("store_error");
    return Number(j[0].result);
  }
}
