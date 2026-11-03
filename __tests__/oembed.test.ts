import { afterEach, describe, expect, it, vi } from "vitest";
import { getInstagramOEmbed, isInstagramPostUrl } from "@/lib/meta/oembed";

describe("isInstagramPostUrl", () => {
  it("accepts post, reel and tv links on instagram.com", () => {
    expect(isInstagramPostUrl("https://www.instagram.com/reel/De2ZvqehjcP/")).toBe(true);
    expect(isInstagramPostUrl("https://instagram.com/p/DfGJZbOR4cy")).toBe(true);
    expect(isInstagramPostUrl("https://www.instagram.com/someone/reel/De2ZvqehjcP/")).toBe(true);
  });

  it("rejects other hosts, profiles and plain http", () => {
    expect(isInstagramPostUrl("http://www.instagram.com/reel/abc/")).toBe(false);
    expect(isInstagramPostUrl("https://evil.test/reel/abc/")).toBe(false);
    expect(isInstagramPostUrl("https://www.instagram.com/someone/")).toBe(false);
    expect(isInstagramPostUrl("https://www.instagram.com.evil.test/reel/abc/")).toBe(false);
  });
});

describe("getInstagramOEmbed", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns null without calling Meta when the app credentials are missing", async () => {
    vi.stubEnv("FACEBOOK_APP_ID", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await getInstagramOEmbed("https://www.instagram.com/reel/aaaa1111/")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps the response and remembers a refusal instead of asking again", async () => {
    vi.stubEnv("FACEBOOK_APP_ID", "123");
    vi.stubEnv("FACEBOOK_APP_SECRET", "secret");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ author_name: "ana", title: "legenda", thumbnail_url: "https://cdn/x.jpg" })))
      .mockResolvedValueOnce(new Response("{}", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await getInstagramOEmbed("https://www.instagram.com/reel/okok1111/")).toEqual({
      authorName: "ana",
      title: "legenda",
      thumbnailUrl: "https://cdn/x.jpg",
    });

    const refused = "https://www.instagram.com/reel/nono2222/";
    expect(await getInstagramOEmbed(refused)).toBeNull();
    expect(await getInstagramOEmbed(refused)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
