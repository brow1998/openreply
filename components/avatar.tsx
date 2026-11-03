"use client";

import { useEffect, useRef, useState } from "react";
import type { InstagramProfile } from "@/lib/meta/client";

// Stable hue per name, so the same person keeps the same color everywhere.
function hueOf(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function initialsOf(name: string): string {
  const clean = name.replace(/^@/, "").trim();
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  const letters = (parts.length > 1 ? parts[0][0] + parts[1][0] : clean.slice(0, 2)) || "?";
  return letters.toUpperCase();
}

/**
 * A round profile photo with an initials fallback. Instagram's CDN photo links
 * expire and some people have none, so a failed or missing image falls back to
 * a tinted monogram instead of a broken icon.
 */
export default function Avatar({
  name,
  src,
  size = 36,
}: {
  name: string;
  src?: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const hue = hueOf(name);
  const box = { width: size, height: size };

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        style={box}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{
        ...box,
        fontSize: Math.round(size * 0.38),
        background: `oklch(0.32 0.05 ${hue})`,
        color: `oklch(0.86 0.07 ${hue})`,
      }}
      className="inline-grid shrink-0 place-items-center rounded-full font-semibold"
    >
      {initialsOf(name)}
    </span>
  );
}

// The profiles endpoint takes at most this many ids per request.
const PROFILE_BATCH = 40;

/**
 * Names and photos for Instagram-scoped ids (DM contacts, commenters), keyed by
 * id. Each id is asked for once per account: Instagram refuses people who never
 * messaged the account, and a refusal must not turn into a retry loop.
 */
export function useInstagramProfiles(
  accountId: string,
  ids: (string | null | undefined)[]
): Record<string, InstagramProfile> {
  const [profiles, setProfiles] = useState<Record<string, InstagramProfile>>({});
  const requested = useRef(new Set<string>());
  const key = [...new Set(ids.filter((id): id is string => Boolean(id)))].join(",");

  useEffect(() => {
    if (!accountId || !key) return;
    const missing = key.split(",").filter((id) => !requested.current.has(`${accountId}:${id}`));
    if (missing.length === 0) return;
    missing.forEach((id) => requested.current.add(`${accountId}:${id}`));
    for (let i = 0; i < missing.length; i += PROFILE_BATCH) {
      const batch = missing.slice(i, i + PROFILE_BATCH);
      fetch(`/api/instagram/profiles?instagramAccountId=${accountId}&ids=${batch.join(",")}`)
        .then((r) => r.json())
        .then((payload) => {
          if (payload.success) setProfiles((prev) => ({ ...prev, ...payload.data.profiles }));
        })
        // Photos are decoration: initials stay, and the ids are not asked for again.
        .catch(() => {});
    }
  }, [accountId, key]);

  return profiles;
}
