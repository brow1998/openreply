import { describe, expect, it } from "vitest";
import { checkPhotoDataUrl, checkUsername, MAX_PHOTO_BYTES } from "@/lib/profile";

describe("checkUsername", () => {
  it("lowercases and trims a valid handle", () => {
    expect(checkUsername("  Bruno.Andrade_1 ")).toEqual({ ok: true, value: "bruno.andrade_1" });
  });

  it("refuses bad length, characters and reserved words", () => {
    expect(checkUsername("ab")).toEqual({ ok: false, error: "length" });
    expect(checkUsername("a".repeat(31))).toEqual({ ok: false, error: "length" });
    expect(checkUsername("bruno andrade")).toEqual({ ok: false, error: "chars" });
    expect(checkUsername("bruno-andrade")).toEqual({ ok: false, error: "chars" });
    expect(checkUsername("Admin")).toEqual({ ok: false, error: "reserved" });
  });
});

describe("checkPhotoDataUrl", () => {
  const jpeg = (b64: string) => `data:image/jpeg;base64,${b64}`;

  it("accepts a small JPEG data URL", () => {
    expect(checkPhotoDataUrl(jpeg("/9j/4AAQSkZJRg=="))).toEqual({ ok: true });
  });

  it("refuses other types, broken base64 and non-JPEG bytes", () => {
    expect(checkPhotoDataUrl("data:image/png;base64,iVBORw0KGgo=")).toEqual({ ok: false, error: "format" });
    expect(checkPhotoDataUrl(jpeg("not base64!"))).toEqual({ ok: false, error: "format" });
    expect(checkPhotoDataUrl(jpeg("iVBORw0KGgo="))).toEqual({ ok: false, error: "format" });
    expect(checkPhotoDataUrl("https://example.com/a.jpg")).toEqual({ ok: false, error: "format" });
  });

  it("refuses a photo over the size cap", () => {
    const big = "/9j/" + "A".repeat(Math.ceil(((MAX_PHOTO_BYTES + 10) * 4) / 3));
    expect(checkPhotoDataUrl(jpeg(big))).toEqual({ ok: false, error: "size" });
  });
});
