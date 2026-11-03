import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, upsert, getUserProfile } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  getUserProfile: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ prisma: { contactProfile: { findUnique, upsert } } }));
vi.mock("@/lib/meta/client", () => ({ getUserProfile }));

import {
  captureContactProfile,
  isFresh,
  isTrustedPhotoUrl,
  toPhotoDataUrl,
} from "@/lib/profiles/contact-profile";
import { parseIncomingSenders } from "@/lib/meta/webhook";

describe("isTrustedPhotoUrl", () => {
  it("accepts only https URLs on Instagram's CDN", () => {
    expect(isTrustedPhotoUrl("https://scontent-cph2-1.cdninstagram.com/v/a.jpg")).toBe(true);
    expect(isTrustedPhotoUrl("https://scontent.xx.fbcdn.net/v/a.jpg")).toBe(true);
    expect(isTrustedPhotoUrl("http://scontent.cdninstagram.com/a.jpg")).toBe(false);
    expect(isTrustedPhotoUrl("https://evil.test/a.jpg")).toBe(false);
    expect(isTrustedPhotoUrl("https://cdninstagram.com.evil.test/a.jpg")).toBe(false);
    expect(isTrustedPhotoUrl("https://169.254.169.254/latest")).toBe(false);
  });
});

describe("toPhotoDataUrl", () => {
  it("keeps small images and refuses the rest", () => {
    const ok = toPhotoDataUrl(new Uint8Array([1, 2, 3]), "image/jpeg; charset=x");
    expect(ok).toBe("data:image/jpeg;base64,AQID");
    expect(toPhotoDataUrl(new Uint8Array([1]), "text/html")).toBeNull();
    expect(toPhotoDataUrl(new Uint8Array(0), "image/png")).toBeNull();
    expect(toPhotoDataUrl(new Uint8Array(60_001), "image/jpeg")).toBeNull();
    expect(toPhotoDataUrl(new Uint8Array([1]), null)).toBeNull();
  });
});

describe("isFresh", () => {
  const now = Date.parse("2026-11-03T12:00:00Z");
  it("is fresh only with a photo taken in the last day", () => {
    expect(isFresh({ photo: "x", fetchedAt: new Date(now - 3600_000) }, now)).toBe(true);
    expect(isFresh({ photo: "x", fetchedAt: new Date(now - 25 * 3600_000) }, now)).toBe(false);
    expect(isFresh({ photo: null, fetchedAt: new Date(now) }, now)).toBe(false);
    expect(isFresh(null, now)).toBe(false);
  });
});

describe("captureContactProfile", () => {
  beforeEach(() => {
    findUnique.mockReset();
    upsert.mockReset();
    getUserProfile.mockReset();
    vi.unstubAllGlobals();
  });

  it("returns a fresh stored copy without asking Instagram", async () => {
    findUnique.mockResolvedValue({ name: "A", username: "a", photo: "data:x", fetchedAt: new Date() });
    const r = await captureContactProfile({ accountId: "acc", igsid: "1", accessToken: "t" });
    expect(r?.username).toBe("a");
    expect(getUserProfile).not.toHaveBeenCalled();
  });

  it("stores nothing and keeps the old copy when Instagram refuses", async () => {
    findUnique.mockResolvedValue({ name: "A", username: "a", photo: "old", fetchedAt: new Date(0) });
    getUserProfile.mockResolvedValue(null);
    const r = await captureContactProfile({ accountId: "acc", igsid: "1", accessToken: "t" });
    expect(r?.photo).toBe("old");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("downloads the photo and upserts name, handle and photo", async () => {
    findUnique.mockResolvedValue(null);
    getUserProfile.mockResolvedValue({ name: "Ana", username: "ana", profilePic: "https://x.cdninstagram.com/p.jpg" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array([9, 9]), { headers: { "content-type": "image/jpeg" } })));
    const r = await captureContactProfile({ accountId: "acc", igsid: "1", accessToken: "t" });
    expect(r?.photo?.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].create).toMatchObject({ instagramAccountId: "acc", igsid: "1", name: "Ana", username: "ana" });
  });

  it("never fetches a photo from an untrusted host", async () => {
    findUnique.mockResolvedValue(null);
    getUserProfile.mockResolvedValue({ name: "Ana", username: "ana", profilePic: "https://evil.test/p.jpg" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await captureContactProfile({ accountId: "acc", igsid: "1", accessToken: "t" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r?.photo).toBeNull();
  });
});

describe("parseIncomingSenders", () => {
  const payload = (messaging: unknown[]) =>
    ({ object: "instagram", entry: [{ id: "ME", messaging }] }) as never;

  it("lists each sender once, including postbacks, never the account itself or echoes", () => {
    const r = parseIncomingSenders(
      payload([
        { sender: { id: "A" }, message: { mid: "1", text: "oi" } },
        { sender: { id: "A" }, message: { mid: "2", attachments: [{ type: "share" }] } },
        { sender: { id: "B" }, postback: { payload: "x" } },
        { sender: { id: "ME" }, message: { mid: "3", text: "self" } },
        { sender: { id: "C" }, message: { mid: "4", is_echo: true } },
        { sender: { id: "D" }, read: { watermark: 1 } },
      ])
    );
    expect(r.map((x) => x.senderId)).toEqual(["A", "B"]);
  });

  it("ignores non-Instagram payloads", () => {
    expect(parseIncomingSenders({ object: "page", entry: [] } as never)).toEqual([]);
  });
});
