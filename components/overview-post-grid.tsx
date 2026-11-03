"use client";

/**
 * Overview posts as Instagram's own profile grid: three columns, hairline gaps,
 * 3:4 tiles. Hover or focus shows the post's numbers; a click opens the post.
 */

import { Bookmark, Clapperboard, Eye, Heart, Layers, MessageCircle, Users } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import type { OverviewPost } from "@/app/api/instagram/overview/route";

export function MediaTypeIcon({ type, className }: { type: string; className?: string }) {
  if (type === "REEL" || type === "VIDEO")
    return <Clapperboard size={16} strokeWidth={1.75} aria-hidden="true" className={className} />;
  if (type === "CAROUSEL_ALBUM")
    return <Layers size={16} strokeWidth={1.75} aria-hidden="true" className={className} />;
  return null;
}

export default function OverviewPostGrid({
  posts,
  format,
  locale,
}: {
  posts: OverviewPost[];
  format: (n: number | null, locale: Locale) => string;
  locale: Locale;
}) {
  const { t } = useI18n();
  return (
    <div className="mx-auto grid max-w-[58rem] grid-cols-3 gap-1">
      {posts.map((p) => {
        const stats = [
          [Eye, p.views],
          [Heart, p.likes],
          [MessageCircle, p.comments],
          [Users, p.reach],
          [Bookmark, p.saved],
        ] as const;
        return (
          <a
            key={p.id}
            href={p.permalink ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={p.caption || t("{type} post", { type: p.mediaType })}
            className="group relative aspect-[3/4] overflow-hidden bg-surface focus-visible:z-10"
          >
            {p.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.thumbnailUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <span className="absolute inset-0 bg-surface-hover" />
            )}
            <MediaTypeIcon type={p.mediaType} className="absolute right-2 top-2 text-white drop-shadow" />
            <span className="absolute inset-0 flex flex-wrap content-center items-center justify-center gap-x-4 gap-y-2 bg-black/55 p-3 font-mono text-sm font-medium text-white opacity-0 transition-opacity duration-(--dur-ui) ease-(--ease-out-quart) group-hover:opacity-100 group-focus-visible:opacity-100">
              {stats
                .filter(([, value]) => value !== null)
                .map(([Icon, value], i) => (
                  <span key={i} className="inline-flex items-center gap-1.5">
                    <Icon size={15} strokeWidth={2} aria-hidden="true" />
                    {format(value, locale)}
                  </span>
                ))}
            </span>
          </a>
        );
      })}
    </div>
  );
}
