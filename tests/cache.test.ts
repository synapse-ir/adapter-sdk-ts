import { describe, expect, it, vi } from "vitest";
import { CalendarBuffer, RouteCache } from "../src/cache.js";

// ── RouteCache ────────────────────────────────────────────────────────────────

describe("RouteCache constructor", () => {
  it("throws for capacity ≤ 0", () => {
    expect(() => new RouteCache(0)).toThrow(RangeError);
    expect(() => new RouteCache(-1)).toThrow(RangeError);
  });

  it("starts empty", () => {
    const cache = new RouteCache<string, string>(10);
    expect(cache.size).toBe(0);
  });
});

describe("RouteCache.get / set", () => {
  it("returns undefined for missing key", () => {
    const cache = new RouteCache<string, number>(5);
    expect(cache.get("x")).toBeUndefined();
  });

  it("stores and retrieves a value", () => {
    const cache = new RouteCache<string, string>(5);
    cache.set("route-a", "adapter-v1");
    expect(cache.get("route-a")).toBe("adapter-v1");
  });

  it("updates an existing key without growing size", () => {
    const cache = new RouteCache<string, number>(5);
    cache.set("k", 1);
    cache.set("k", 2);
    expect(cache.size).toBe(1);
    expect(cache.get("k")).toBe(2);
  });

  it("reports correct size after insertions", () => {
    const cache = new RouteCache<string, number>(10);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.size).toBe(3);
  });
});

describe("RouteCache.has / delete", () => {
  it("has returns true for existing key", () => {
    const cache = new RouteCache<string, number>(5);
    cache.set("x", 42);
    expect(cache.has("x")).toBe(true);
  });

  it("has returns false for missing key", () => {
    const cache = new RouteCache<string, number>(5);
    expect(cache.has("x")).toBe(false);
  });

  it("delete removes the entry and returns true", () => {
    const cache = new RouteCache<string, number>(5);
    cache.set("x", 1);
    expect(cache.delete("x")).toBe(true);
    expect(cache.has("x")).toBe(false);
    expect(cache.size).toBe(0);
  });

  it("delete returns false for missing key", () => {
    const cache = new RouteCache<string, number>(5);
    expect(cache.delete("x")).toBe(false);
  });
});

describe("RouteCache LRU eviction", () => {
  it("evicts the LRU entry when capacity is exceeded", () => {
    const cache = new RouteCache<string, number>(3);
    cache.set("a", 1); // LRU order: a
    cache.set("b", 2); // LRU order: b, a
    cache.set("c", 3); // LRU order: c, b, a
    cache.set("d", 4); // evicts a → LRU order: d, c, b
    expect(cache.has("a")).toBe(false);
    expect(cache.has("b")).toBe(true);
    expect(cache.has("c")).toBe(true);
    expect(cache.has("d")).toBe(true);
    expect(cache.size).toBe(3);
  });

  it("get promotes entry, protecting it from eviction", () => {
    const cache = new RouteCache<string, number>(3);
    cache.set("a", 1); // order: a
    cache.set("b", 2); // order: b, a
    cache.set("c", 3); // order: c, b, a
    cache.get("a"); //  order: a, c, b  (a is now MRU)
    cache.set("d", 4); // evicts b → order: d, a, c
    expect(cache.has("b")).toBe(false);
    expect(cache.has("a")).toBe(true);
  });

  it("set on existing key promotes entry", () => {
    const cache = new RouteCache<string, number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.set("a", 99); // promotes a to MRU
    cache.set("d", 4); // should evict b (LRU), not a
    expect(cache.has("a")).toBe(true);
    expect(cache.get("a")).toBe(99);
    expect(cache.has("b")).toBe(false);
  });

  it("never exceeds capacity", () => {
    const cap = 5;
    const cache = new RouteCache<number, number>(cap);
    for (let i = 0; i < 20; i++) {
      cache.set(i, i);
      expect(cache.size).toBeLessThanOrEqual(cap);
    }
  });
});

describe("RouteCache.clear()", () => {
  it("removes all entries", () => {
    const cache = new RouteCache<string, number>(5);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.has("a")).toBe(false);
  });

  it("allows new insertions after clear", () => {
    const cache = new RouteCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    cache.set("c", 3);
    cache.set("d", 4);
    expect(cache.size).toBe(2);
  });
});

// ── CalendarBuffer ────────────────────────────────────────────────────────────

describe("CalendarBuffer constructor", () => {
  it("throws for concurrency ≤ 0", () => {
    expect(() => new CalendarBuffer(0)).toThrow(RangeError);
    expect(() => new CalendarBuffer(-1)).toThrow(RangeError);
  });

  it("starts empty with zero active tasks", () => {
    const buf = new CalendarBuffer(2);
    expect(buf.size).toBe(0);
    expect(buf.activeCount).toBe(0);
  });
});

describe("CalendarBuffer.enqueue()", () => {
  it("resolves with the task return value", async () => {
    const buf = new CalendarBuffer<number>(1);
    const result = await buf.enqueue(async () => 42);
    expect(result).toBe(42);
  });

  it("rejects when the task throws", async () => {
    const buf = new CalendarBuffer<never>(1);
    await expect(
      buf.enqueue(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });

  it("processes tasks in FIFO order with concurrency 1", async () => {
    const buf = new CalendarBuffer<number>(1);
    const order: number[] = [];
    await Promise.all([
      buf.enqueue(async () => {
        order.push(1);
        return 1;
      }),
      buf.enqueue(async () => {
        order.push(2);
        return 2;
      }),
      buf.enqueue(async () => {
        order.push(3);
        return 3;
      }),
    ]);
    expect(order).toEqual([1, 2, 3]);
  });

  it("runs up to `concurrency` tasks simultaneously", async () => {
    const buf = new CalendarBuffer<void>(3);
    let concurrent = 0;
    let maxConcurrent = 0;

    const task = () =>
      new Promise<void>((resolve) => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        setTimeout(() => {
          concurrent--;
          resolve();
        }, 10);
      });

    await Promise.all([
      buf.enqueue(task),
      buf.enqueue(task),
      buf.enqueue(task),
    ]);
    expect(maxConcurrent).toBe(3);
  });

  it("does not exceed concurrency limit", async () => {
    const buf = new CalendarBuffer<void>(2);
    let concurrent = 0;
    let exceeded = false;

    const task = () =>
      new Promise<void>((resolve) => {
        concurrent++;
        if (concurrent > 2) exceeded = true;
        setTimeout(() => {
          concurrent--;
          resolve();
        }, 10);
      });

    await Promise.all(Array.from({ length: 6 }, () => buf.enqueue(task)));
    expect(exceeded).toBe(false);
  });
});

describe("CalendarBuffer.flush()", () => {
  it("resolves after all tasks complete", async () => {
    const buf = new CalendarBuffer<number>(2);
    const results: number[] = [];
    buf.enqueue(async () => {
      results.push(1);
      return 1;
    });
    buf.enqueue(async () => {
      results.push(2);
      return 2;
    });
    await buf.flush();
    expect(results).toHaveLength(2);
  });

  it("resolves immediately when queue is already empty", async () => {
    const buf = new CalendarBuffer(1);
    await expect(buf.flush()).resolves.toBeUndefined();
  });
});

describe("CalendarBuffer size tracking", () => {
  it("size decreases as tasks are drained (concurrency 1)", async () => {
    const buf = new CalendarBuffer<void>(1);
    // Pause execution so we can inspect mid-queue state
    let firstResolve!: () => void;
    const firstDone = new Promise<void>((r) => (firstResolve = r));

    buf.enqueue(() => firstDone);
    buf.enqueue(async () => undefined);
    buf.enqueue(async () => undefined);

    // One task is running, two are queued
    expect(buf.activeCount).toBe(1);
    expect(buf.size).toBe(2);

    firstResolve();
    await buf.flush();
    expect(buf.size).toBe(0);
    expect(buf.activeCount).toBe(0);
  });
});
