"use client";

/**
 * Waiting for a reply
 *
 * Comments by other people on the newest posts that the account has not
 * answered yet, across the given accounts, newest first. Links to /comments.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCheck, MessageCircle } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import Avatar from "@/components/avatar";
import type { CommentPost, CommentThread } from "@/app/api/instagram/comments/route";

type Waiting = { comment: CommentThread; post: CommentPost };

function relative(iso: string | null, locale: Locale): string {
  if (!iso) return "";
  const minutes = Math.round((Date.parse(iso) - Date.now()) / 60_000);
  if (Number.isNaN(minutes)) return "";
  const fmt = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  if (Math.abs(minutes) < 60) return fmt.format(minutes, "minute");
  if (Math.abs(minutes) < 60 * 24) return fmt.format(Math.round(minutes / 60), "hour");
  return fmt.format(Math.round(minutes / (60 * 24)), "day");
}

export default function WaitingComments({ accountIds }: { accountIds: string[] }) {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<Waiting[] | null>(null);
  // The endpoint loads only the newest comments per post, so the total can be a floor.
  const [partial, setPartial] = useState(false);
  const key = accountIds.join(",");

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    const load = () =>
      Promise.all(
        ids.map((id) =>
          fetch(`/api/instagram/comments?instagramAccountId=${id}`, { cache: "no-store" })
            .then((r) => r.json())
            .then((p) => (p.success ? (p.data.posts as CommentPost[]) : []))
            .catch(() => [] as CommentPost[])
        )
      ).then((results) => {
        const posts = results.flat();
        setPartial(posts.some((p) => p.commentsCount > p.comments.length));
        setItems(
          posts
            .flatMap((post) =>
              post.comments.filter((c) => !c.fromMe && !c.answered).map((comment) => ({ comment, post }))
            )
            .sort((x, y) => Date.parse(y.comment.timestamp ?? "") - Date.parse(x.comment.timestamp ?? ""))
        );
      });
    void load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [key]);

  return (
    <section className="panel p-4 sm:p-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MessageCircle size={16} strokeWidth={1.75} className="text-accent" aria-hidden="true" />
          {t("Waiting for a reply")}
          {items && items.length > 0 && (
            <span className="rounded-full bg-accent px-2 py-0.5 font-mono text-xs font-medium text-accent-foreground">
              {items.length}
              {partial ? "+" : ""}
            </span>
          )}
        </h2>
        <Link href="/comments" className="text-xs text-accent hover:text-accent-hover">
          {t("Open Comments")}
        </Link>
      </div>

      {items === null ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-hover" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="py-6 text-center">
          <CheckCheck size={20} strokeWidth={1.75} className="mx-auto text-success" aria-hidden="true" />
          <p className="mt-2 text-sm text-foreground">{t("All caught up")}</p>
          <p className="mt-1 text-xs text-muted">{t("Every comment on your newest posts has a reply.")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.slice(0, 5).map(({ comment, post }) => (
            <li key={comment.id}>
              <Link
                href="/comments"
                className="flex items-center gap-3 py-2.5 transition-colors duration-(--dur-ui) ease-(--ease-out-quart) hover:bg-surface-hover"
              >
                <Avatar name={comment.username ?? "?"} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      @{comment.username ?? "unknown"}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-muted">
                      {relative(comment.timestamp, locale)}
                    </span>
                  </span>
                  <span className="line-clamp-2 text-xs text-muted">{comment.text}</span>
                </span>
                {post.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={post.thumbnailUrl} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-md object-cover" />
                ) : (
                  <span className="h-10 w-10 shrink-0 rounded-md bg-surface-hover" />
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
