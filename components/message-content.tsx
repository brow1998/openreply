"use client";

import { useI18n } from "@/lib/i18n/provider";
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
}: {
  share: ThreadMessage["shares"][number];
  fallbackTitle: string;
  openLabel: string;
}) {
  const src = embedUrl(share.link);
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
  return (
    <div className="w-[min(100%,20.5rem)] overflow-hidden rounded-xl border border-border bg-white">
      {/* The embed is taller than the card: the bottom is the like/comment row, which would not work here. */}
      <div className="h-[30.5rem] overflow-hidden">
        <iframe
          src={src}
          title={share.title || fallbackTitle}
          loading="lazy"
          scrolling="no"
          sandbox="allow-scripts allow-same-origin allow-popups"
          className="h-[34rem] w-full border-0"
        />
      </div>
      <a
        href={share.link ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="block border-t border-black/10 bg-white px-3 py-2 text-xs font-medium text-[#3d5afe]"
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
        <ShareCard key={`share-${i}`} share={s} fallbackTitle={t("Shared a post or reel")} openLabel={t("Open on Instagram")} />
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
