"use client";

import { useI18n } from "@/lib/i18n/provider";
import type { ThreadMessage } from "@/app/api/instagram/conversations/[id]/route";

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
        <a
          key={`share-${i}`}
          href={s.link ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="block overflow-hidden rounded border border-border bg-background text-foreground"
        >
          {s.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.imageUrl} alt="" loading="lazy" className="max-h-60 w-full object-cover" />
          )}
          <span className="block px-2 py-1.5 text-xs">
            <span className="block font-medium">{s.title || t("Shared a post or reel")}</span>
            {s.description && <span className="line-clamp-3 text-muted">{s.description}</span>}
          </span>
        </a>
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
        <p className="opacity-70">{t("(no text)")}</p>
      ) : null}
    </div>
  );
}
