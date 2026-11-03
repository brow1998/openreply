import { describe, expect, it } from "vitest";
import { GifUnavailableError, isHttpsUrl, sendGif } from "@/lib/instagram/send-messages";

describe("isHttpsUrl", () => {
  it("accepts https and rejects everything else", () => {
    expect(isHttpsUrl("https://media.giphy.com/a.gif")).toBe(true);
    expect(isHttpsUrl("http://media.giphy.com/a.gif")).toBe(false);
    expect(isHttpsUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpsUrl("not a url")).toBe(false);
  });
});

describe("sendGif", () => {
  const zernio = { provider: "ZERNIO", apiKey: "k", accountId: "a", instagramId: "i" } as never;

  it("is refused on a Zernio connection", async () => {
    await expect(
      sendGif({ context: zernio, instagramAccountId: "i", userId: "u", url: "https://x.test/a.gif" })
    ).rejects.toBeInstanceOf(GifUnavailableError);
  });

  it("refuses a non-https link before calling Meta", async () => {
    const meta = { provider: "META", accessToken: "t" } as never;
    await expect(
      sendGif({ context: meta, instagramAccountId: "i", userId: "u", url: "http://x.test/a.gif" })
    ).rejects.toThrow("https");
  });
});
