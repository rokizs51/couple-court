export interface Store {
  get<T>(key: string): Promise<T | null>;
  set(key: string, val: unknown, ttlSec: number): Promise<void>;
  /** Set only if absent. Returns true if written. Basis for locks and unique codes. */
  setNX(key: string, val: unknown, ttlSec: number): Promise<boolean>;
  del(key: string): Promise<void>;
  incr(key: string, ttlSec: number): Promise<number>;
}

/** In-memory store with TTL. For dev and tests. Production uses Upstash (same interface). */
export class MemoryStore implements Store {
  private m = new Map<string, { v: string; exp: number }>();
  constructor(private now: () => number = Date.now) {}
  private live(key: string) {
    const e = this.m.get(key);
    if (!e) return null;
    if (e.exp <= this.now()) { this.m.delete(key); return null; }
    return e;
  }
  async get<T>(key: string) { const e = this.live(key); return e ? (JSON.parse(e.v) as T) : null; }
  async set(key: string, val: unknown, ttlSec: number) { this.m.set(key, { v: JSON.stringify(val), exp: this.now() + ttlSec * 1000 }); }
  async setNX(key: string, val: unknown, ttlSec: number) {
    if (this.live(key)) return false;
    await this.set(key, val, ttlSec); return true;
  }
  async del(key: string) { this.m.delete(key); }
  async incr(key: string, ttlSec: number) {
    const e = this.live(key);
    const n = (e ? Number(JSON.parse(e.v)) : 0) + 1;
    this.m.set(key, { v: JSON.stringify(n), exp: e ? e.exp : this.now() + ttlSec * 1000 });
    return n;
  }
  /** test helper: raw stored JSON of every key */
  dump() { return [...this.m.entries()].map(([k, e]) => [k, e.v] as const); }
  ttlOf(key: string) { const e = this.live(key); return e ? e.exp - this.now() : null; }
}
