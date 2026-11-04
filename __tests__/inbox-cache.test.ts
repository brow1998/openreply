import { describe, expect, it, vi } from "vitest";
import { createSwrCache } from "@/lib/instagram/inbox-cache";

function setup() {
  let t = 0;
  const cache = createSwrCache<string>({ freshMs: 5, maxAgeMs: 100, maxEntries: 2 }, () => t);
  const deferred: (() => Promise<void>)[] = [];
  const defer = (task: () => Promise<void>) => void deferred.push(task);
  const runDeferred = () => Promise.all(deferred.splice(0).map((task) => task()));
  return { cache, defer, runDeferred, tick: (ms: number) => (t += ms) };
}

describe("createSwrCache", () => {
  it("loads once, then serves the copy while fresh", async () => {
    const { cache, defer } = setup();
    const loader = vi.fn().mockResolvedValue("a");
    expect(await cache.read("k", loader, defer)).toBe("a");
    expect(await cache.read("k", loader, defer)).toBe("a");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("serves a stale copy right away and refreshes it once behind the response", async () => {
    const { cache, defer, runDeferred, tick } = setup();
    await cache.read("k", async () => "old", defer);
    tick(10);
    const loader = vi.fn().mockResolvedValue("new");
    expect(await cache.read("k", loader, defer)).toBe("old");
    expect(await cache.read("k", loader, defer)).toBe("old");
    await runDeferred();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(await cache.read("k", loader, defer)).toBe("new");
  });

  it("waits on the loader once the copy is too old", async () => {
    const { cache, defer, tick } = setup();
    await cache.read("k", async () => "old", defer);
    tick(100);
    expect(await cache.read("k", async () => "new", defer)).toBe("new");
  });

  it("keeps serving the old copy when the background refresh fails, and retries", async () => {
    const { cache, defer, runDeferred, tick } = setup();
    await cache.read("k", async () => "old", defer);
    tick(10);
    await cache.read("k", () => Promise.reject(new Error("meta")), defer);
    await runDeferred();
    const loader = vi.fn().mockResolvedValue("new");
    expect(await cache.read("k", loader, defer)).toBe("old");
    await runDeferred();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("drops by prefix, and a refresh started before the drop does not write back", async () => {
    const { cache, defer, runDeferred, tick } = setup();
    await cache.read("acc:1", async () => "old", defer);
    tick(10);
    let resolve!: (v: string) => void;
    await cache.read("acc:1", () => new Promise<string>((r) => (resolve = r)), defer);
    const inFlight = runDeferred(); // the refresh has asked Meta...
    cache.dropPrefix("acc:"); // ...a DM arrives...
    resolve("from-before-the-drop"); // ...and the answer from before it lands.
    await inFlight;
    expect(await cache.read("acc:1", async () => "after", defer)).toBe("after");
  });

  it("evicts the oldest entry past maxEntries", async () => {
    const { cache, defer } = setup();
    for (const k of ["a", "b", "c"]) await cache.read(k, async () => k, defer);
    const loader = vi.fn().mockResolvedValue("a2");
    expect(await cache.read("a", loader, defer)).toBe("a2");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("warm loads only what is missing", async () => {
    const { cache, defer } = setup();
    await cache.read("k", async () => "a", defer);
    const loader = vi.fn().mockResolvedValue("b");
    await cache.warm("k", loader);
    await cache.warm("j", loader);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(await cache.read("j", async () => "x", defer)).toBe("b");
  });
});
