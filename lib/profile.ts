import { z } from "zod";

const RESERVED = new Set([
  "admin", "administrator", "root", "support", "help", "openreply", "settings",
  "api", "login", "logout", "dashboard", "system", "null", "undefined", "me",
]);

export type UsernameError = "length" | "chars" | "reserved";

/** Lowercased handle, or why it is refused. 3-30 chars of a-z 0-9 _ . */
export function checkUsername(raw: string): { ok: true; value: string } | { ok: false; error: UsernameError } {
  const value = raw.trim().toLowerCase();
  if (value.length < 3 || value.length > 30) return { ok: false, error: "length" };
  if (!/^[a-z0-9_.]+$/.test(value)) return { ok: false, error: "chars" };
  if (RESERVED.has(value)) return { ok: false, error: "reserved" };
  return { ok: true, value };
}

const PREFIX = "data:image/jpeg;base64,";
/** The client resizes to 256x256 JPEG; anything much bigger was not made by our form. */
export const MAX_PHOTO_BYTES = 120 * 1024;

export type PhotoError = "format" | "size";

/** Accepts only a base64 JPEG data URL under the size cap. */
export function checkPhotoDataUrl(value: string): { ok: true } | { ok: false; error: PhotoError } {
  if (!value.startsWith(PREFIX)) return { ok: false, error: "format" };
  const b64 = value.slice(PREFIX.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return { ok: false, error: "format" };
  const bytes = Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
  if (bytes > MAX_PHOTO_BYTES) return { ok: false, error: "size" };
  // JPEG magic bytes: FF D8 FF.
  if (!b64.startsWith("/9j/")) return { ok: false, error: "format" };
  return { ok: true };
}

/** PATCH body: every field optional; `image: null` removes the photo, `username: ""` clears it. */
export const profileUpdateSchema = z.object({
  name: z.string().trim().max(80).optional(),
  username: z.string().max(60).optional(),
  image: z.string().max(200_000).nullable().optional(),
});
