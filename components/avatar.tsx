"use client";

import { useState } from "react";

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
