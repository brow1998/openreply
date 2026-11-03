"use client";

import { useEffect, useState } from "react";
import { Clapperboard } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import type { InstagramOEmbed } from "@/lib/meta/oembed";
import type { ThreadMessage } from "@/app/api/instagram/conversations/[id]/route";

/** The shortcode URL Instagram's public embed accepts, e.g. /reel/XYZ/ or /p/XYZ/. */
function embedUrl(link: string | null): string | null {
  if (!link) return null;
  try {
    const u = new URL(link);
    if (!/(^|\.)instagram\.com$/.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/(?:[^/]+\/)?(reel|reels|p|tv)\/([\w-]+)/);
    return m ? `https://www.instagram.com/${m[1] === "reels" ? "reel" : m[1]}/${m[2]}/embed/` : null;
  } catch {
    return null;
  }
}

// One request per link for the whole session; null means oEmbed has nothing (not approved yet, private post).
const oembedRequests = new Map<string, Promise<InstagramOEmbed | null>>();
function loadOEmbed(link: string): Promise<InstagramOEmbed | null> {
  let request = oembedRequests.get(link);
  if (!request) {
    request = fetch(`/api/instagram/oembed?url=${encodeURIComponent(link)}`)
      .then((r) => r.json())
      .then((payload) => (payload.success ? (payload.data as InstagramOEmbed | null) : null))
      .catch(() => null);
    oembedRequests.set(link, request);
  }
  return request;
}

/**
 * A forwarded post or reel, drawn the way Instagram draws it in a DM: author,
 * cover and caption. Instagram's API only hands us the link, so the card is
 * Instagram's own public embed (no API review needed), cropped to the header
 * and cover. Anything that is not a post link stays a plain link.
 */
function ShareCard({
  share,
  fallbackTitle,
  openLabel,
  previewLabel,
  hideLabel,
}: {
  share: ThreadMessage["shares"][number];
  fallbackTitle: string;
  openLabel: string;
  previewLabel: string;
  hideLabel: string;
}) {
  const src = embedUrl(share.link);
  const [oembed, setOembed] = useState<InstagramOEmbed | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  useEffect(() => {
    if (!share.link || !src) return;
    let alive = true;
    void loadOEmbed(share.link).then((data) => {
      if (alive) setOembed(data);
    });
    return () => {
      alive = false;
    };
  }, [share.link, src]);

  // Meta oEmbed gave us author, caption and cover: draw our own card in the app's look.
  if (oembed?.thumbnailUrl) {
    return (
      <a
        href={share.link ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-[min(100%,20rem)] overflow-hidden rounded-xl border border-border bg-background text-foreground"
      >
        {oembed.authorName && (
          <span className="block px-3 py-2 text-xs font-semibold">@{oembed.authorName}</span>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={oembed.thumbnailUrl} alt="" loading="lazy" className="aspect-[4/5] w-full object-cover" />
        <span className="block px-3 py-2 text-xs">
          {oembed.title && <span className="line-clamp-3 text-muted">{oembed.title}</span>}
          <span className="mt-1 block font-medium text-accent">{openLabel}</span>
        </span>
      </a>
    );
  }

  if (!src) {
    return (
      <a
        href={share.link ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground underline underline-offset-2"
      >
        {share.title || fallbackTitle}
      </a>
    );
  }
  // Without oEmbed all we have is the link: a compact dark card, with Instagram's
  // own (white) embed only when asked for, so a long thread does not load dozens of iframes.
  return (
    <div className="w-[min(100%,20.5rem)] overflow-hidden rounded-xl border border-border bg-background text-foreground">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <Clapperboard size={18} strokeWidth={1.75} className="shrink-0 text-accent" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{share.title || fallbackTitle}</span>
        <button
          type="button"
          onClick={() => setPreviewOpen((v) => !v)}
          aria-expanded={previewOpen}
          className="shrink-0 text-xs font-medium text-accent hover:text-accent-hover"
        >
          {previewOpen ? hideLabel : previewLabel}
        </button>
      </div>
      {previewOpen && (
        <div className="h-[30.5rem] overflow-hidden bg-white">
          <iframe
            src={src}
            title={share.title || fallbackTitle}
            scrolling="no"
            className="h-[34rem] w-full border-0"
          />
        </div>
      )}
      <a
        href={share.link ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="block border-t border-border px-3 py-2 text-xs font-medium text-accent hover:text-accent-hover"
      >
        {openLabel}
      </a>
    </div>
  );
}

/**
 * The body of one chat bubble: text plus whatever else the message carried
 * (photos, videos, forwarded posts and reels, story mentions and replies).
 * Instagram's CDN links expire, so every media tile degrades to a plain link.
 */
export default function MessageContent({ message }: { message: ThreadMessage }) {
  const { t } = useI18n();
  // Threads cached in the browser before these fields existed lack them.
  const attachments = message.attachments ?? [];
  const shares = message.shares ?? [];
  const story = message.story ?? null;
  const m = { ...message, attachments, shares, story };
  const hasExtras =
    attachments.length > 0 || shares.length > 0 || story !== null || Boolean(message.unsupported);
  const linkClass = "underline underline-offset-2 break-all";

  return (
    <div className="space-y-2">
      {m.story && (
        <p className="text-xs opacity-80">
          {m.story.kind === "mention" ? t("Story mention") : t("Story reply")}
          {m.story.link && (
            <>
              {" · "}
              <a href={m.story.link} target="_blank" rel="noopener noreferrer" className={linkClass}>
                {t("Open on Instagram")}
              </a>
            </>
          )}
        </p>
      )}

      {m.shares.map((s, i) => (
        <ShareCard
          key={`share-${i}`}
          share={s}
          fallbackTitle={t("Shared a post or reel")}
          openLabel={t("Open on Instagram")}
          previewLabel={t("Preview")}
          hideLabel={t("Hide preview")}
        />
      ))}

      {m.attachments.map((a, i) => {
        const label =
          a.kind === "image" ? t("Photo") : a.kind === "video" ? t("Video") : a.kind === "audio" ? t("Audio") : t("File");
        const shown = a.kind === "image" ? (a.url ?? a.previewUrl) : a.previewUrl;
        return (
          <a
            key={`att-${i}`}
            href={a.url ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            {shown ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shown} alt={label} loading="lazy" className="max-h-60 rounded object-cover" />
            ) : (
              <span className={linkClass}>{a.name ?? label}</span>
            )}
            {a.kind === "video" && shown && <span className="mt-1 block text-xs opacity-80">{label}</span>}
          </a>
        );
      })}

      {m.unsupported && (
        <p className="text-xs opacity-80">{t("This message type can't be shown here.")}</p>
      )}

      {m.text ? (
        <p className="whitespace-pre-wrap break-words">{m.text}</p>
      ) : !hasExtras ? (
        <p className="italic opacity-70">{t("Unavailable message")}</p>
      ) : null}
    </div>
  );
}
