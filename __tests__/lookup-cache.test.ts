import { describe, expect, it } from "vitest";
import { createLookupCache } from "@/lib/meta/client";

describe("createLookupCache", () => {
  it("keeps hits for the hit TTL and misses for the shorter miss TTL", () => {
    let t = 0;
    const cache = createLookupCache<string>(100, 10, () => t);
    cache.set("hit", "photo");
    cache.set("miss", null);
    t = 9;
    expect(cache.get("hit")).toEqual({ value: "photo" });
    expect(cache.get("miss")).toEqual({ value: null });
    t = 10;
    expect(cache.get("miss")).toBeUndefined();
    expect(cache.get("hit")).toEqual({ value: "photo" });
    t = 100;
    expect(cache.get("hit")).toBeUndefined();
  });

  it("returns undefined for keys never stored", () => {
    expect(createLookupCache<string>(1, 1).get("nope")).toBeUndefined();
  });
});
