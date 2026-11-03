import { prisma } from "@/lib/db/client";
import { getUserProfile } from "@/lib/meta/client";

/**
 * Keeps a copy of who wrote to a connected account. Instagram describes a
 * person (name, handle, photo) only for a few hours after their message, and
 * the photo link expires, so the copy is taken when the message arrives.
 */

const MAX_PHOTO_BYTES = 60_000;
// A stored photo is refreshed at most once a day, when the person writes again.
const REFRESH_MS = 24 * 60 * 60 * 1000;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
// Only Instagram's own CDN: the URL comes from an API response and is fetched server-side.
const PHOTO_HOST = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/;

export function isTrustedPhotoUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && PHOTO_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

/** A data URL for a small image, or null when it is not one we are willing to keep. */
export function toPhotoDataUrl(bytes: Uint8Array, contentType: string | null): string | null {
  const type = contentType?.split(";")[0].trim().toLowerCase() ?? "";
  if (!PHOTO_TYPES.has(type)) return null;
  if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) return null;
  return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
}

async function downloadPhoto(url: string): Promise<string | null> {
  if (!isTrustedPhotoUrl(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6_000) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return toPhotoDataUrl(bytes, res.headers.get("content-type"));
  } catch {
    return null;
  }
}

export interface StoredContact {
  name: string | null;
  username: string | null;
  photo: string | null;
}

export function isFresh(existing: { photo: string | null; fetchedAt: Date } | null, now = Date.now()): boolean {
  return Boolean(existing?.photo) && now - existing!.fetchedAt.getTime() < REFRESH_MS;
}

/**
 * Fetches and stores the profile of `igsid` for one connected account. Returns
 * what is stored afterwards (possibly from an earlier capture), or null when
 * Instagram will not describe this person right now and nothing was stored.
 */
export async function captureContactProfile({
  accountId,
  igsid,
  accessToken,
}: {
  /** The InstagramAccount row id (not the Instagram id). */
  accountId: string;
  igsid: string;
  accessToken: string;
}): Promise<StoredContact | null> {
  const existing = await prisma.contactProfile.findUnique({
    where: { instagramAccountId_igsid: { instagramAccountId: accountId, igsid } },
    select: { name: true, username: true, photo: true, fetchedAt: true },
  });
  if (isFresh(existing)) return existing;

  const profile = await getUserProfile(accessToken, igsid);
  // Outside Instagram's window this fails; keep whatever we already had.
  if (!profile) return existing;

  const photo = profile.profilePic ? await downloadPhoto(profile.profilePic) : null;
  const data = {
    name: profile.name,
    username: profile.username,
    photo: photo ?? existing?.photo ?? null,
    fetchedAt: new Date(),
  };
  await prisma.contactProfile.upsert({
    where: { instagramAccountId_igsid: { instagramAccountId: accountId, igsid } },
    create: { instagramAccountId: accountId, igsid, ...data },
    update: data,
  });
  return { name: data.name, username: data.username, photo: data.photo };
}
