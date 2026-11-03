import { describe, expect, it } from "vitest";
import { normalizeMessage } from "@/lib/instagram/normalize-message";

describe("normalizeMessage", () => {
  it("returns empty extras for a plain text message", () => {
    expect(normalizeMessage({ id: "1", message: "oi" })).toEqual({
      attachments: [],
      shares: [],
      story: null,
      unsupported: false,
    });
  });

  it("reads a forwarded post or reel", () => {
    const r = normalizeMessage({
      id: "2",
      shares: { data: [{ link: "https://instagram.com/reel/x", name: "Titulo", image_url: "https://cdn/i.jpg" }] },
    });
    expect(r.shares).toEqual([
      { link: "https://instagram.com/reel/x", title: "Titulo", description: null, imageUrl: "https://cdn/i.jpg" },
    ]);
  });

  it("classifies attachments by mime type and video data", () => {
    const r = normalizeMessage({
      id: "3",
      attachments: {
        data: [
          { mime_type: "image/jpeg", image_data: { url: "https://cdn/a.jpg" } },
          { mime_type: "video/mp4", video_data: { url: "https://cdn/v.mp4", preview_url: "https://cdn/p.jpg" } },
          { mime_type: "audio/mp4", file_url: "https://cdn/a.m4a" },
          { name: "doc.pdf" },
        ],
      },
    });
    expect(r.attachments.map((a) => a.kind)).toEqual(["image", "video", "audio", "file"]);
    expect(r.attachments[1].previewUrl).toBe("https://cdn/p.jpg");
  });

  it("tells a story mention from a story reply", () => {
    expect(normalizeMessage({ id: "4", story: { mention: { link: "l1" } } }).story).toEqual({ kind: "mention", link: "l1" });
    expect(normalizeMessage({ id: "5", reply_to: { story: { link: "l2" } } }).story).toEqual({ kind: "reply", link: "l2" });
  });

  it("flags unsupported messages", () => {
    expect(normalizeMessage({ id: "6", is_unsupported: true }).unsupported).toBe(true);
  });
});
