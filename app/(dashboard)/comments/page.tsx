"use client";

/**
 * Comments
 *
 * The newest posts with their comments for the selected account, and a way to
 * answer each one: publicly under the comment, or as a private DM. Comments the
 * account owner has already replied to are marked answered; the default view
 * shows only what is still waiting. Refreshed by polling.
 */

import type { Locale } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import { useCallback, useEffect, useRef, useState } from "react";
import AccountSelect, { type AccountOption } from "@/components/account-select";
import type {
  CommentPost,
  CommentThread,
} from "@/app/api/instagram/comments/route";

const POLL_MS = 30_000;

type ReplyMode = "public" | "private";

function formatTime(iso: string | null, locale: Locale): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

const pendingCount = (p: CommentPost) =>
  p.comments.filter((c) => !c.fromMe && !c.answered).length;

export default function CommentsPage() {
  const { t, locale } = useI18n();
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [posts, setPosts] = useState<CommentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [onlyPending, setOnlyPending] = useState(true);

  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [mode, setMode] = useState<ReplyMode>("public");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const active = posts.find((p) => p.id === activeId) ?? null;

  useEffect(() => {
    fetch("/api/instagram/accounts")
      .then((r) => r.json())
      .then((payload) => {
        if (!payload.success) return;
        const next: AccountOption[] = payload.data.instagramAccounts ?? [];
        setAccounts(next);
        setSelectedAccountId(
          payload.data.selectedInstagramAccountId || next[0]?.id || ""
        );
      })
      .catch(() => setAccounts([]));
  }, []);

  const load = useCallback(
    async (silent: boolean) => {
      if (!selectedAccountId || inFlight.current) return;
      inFlight.current = true;
      if (!silent) setLoading(true);
      try {
        const res = await fetch(
          `/api/instagram/comments?instagramAccountId=${selectedAccountId}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (data.success) {
          setPosts(data.data.posts);
          setError(null);
        } else if (!silent) {
          setError(data.error ?? "Failed to load comments");
        }
      } catch {
        if (!silent) setError("Failed to load comments");
      } finally {
        inFlight.current = false;
        if (!silent) setLoading(false);
      }
    },
    [selectedAccountId]
  );

  useEffect(() => {
    if (!selectedAccountId) return;
    // Intentional synchronous reset on an account change, as in the Inbox.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveId(null);
    setReplyingTo(null);
    setPosts([]);
    void load(false);
    const timer = setInterval(() => {
      if (!document.hidden) void load(true);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [selectedAccountId, load]);

  function startReply(c: CommentThread) {
    setReplyingTo(c.id);
    setDraft("");
    setSendError(null);
    setMode("public");
  }

  async function handleSend(c: CommentThread) {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch("/api/instagram/comments/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instagramAccountId: selectedAccountId,
          commentId: c.id,
          text,
          mode,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setSendError(data.error ?? "Failed to send reply");
        return;
      }
      // Mark it answered right away; the next poll confirms it.
      setPosts((prev) =>
        prev.map((p) => ({
          ...p,
          comments: p.comments.map((x) =>
            x.id === c.id
              ? {
                  ...x,
                  answered: true,
                  replies:
                    mode === "public"
                      ? [
                          ...x.replies,
                          {
                            id: `local-${Date.now()}`,
                            text,
                            username: null,
                            timestamp: new Date().toISOString(),
                            fromMe: true,
                          },
                        ]
                      : x.replies,
                }
              : x
          ),
        }))
      );
      setReplyingTo(null);
      setDraft("");
    } catch {
      setSendError("Failed to send reply");
    } finally {
      setSending(false);
    }
  }

  const visible = active
    ? active.comments.filter((c) => !onlyPending || (!c.fromMe && !c.answered))
    : [];

  return (
    <div className="space-y-4 p-4 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-foreground">{t("Comments")}</h1>
        {accounts.length > 1 && (
          <AccountSelect
            accounts={accounts}
            value={selectedAccountId}
            onChange={setSelectedAccountId}
            includeAll={false}
          />
        )}
      </div>

      <div className="grid h-[calc(100dvh-11rem)] grid-cols-1 overflow-hidden rounded border border-border sm:grid-cols-[320px_minmax(0,1fr)]">
        <div
          className={`min-h-0 flex-col border-b border-border sm:flex sm:border-b-0 sm:border-r ${
            active ? "hidden" : "flex"
          }`}
        >
          <div className="shrink-0 border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
            {t("Posts")}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && posts.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">{t("Loading…")}</p>
            ) : error ? (
              <p className="px-4 py-6 text-sm text-error">
                {error === "Failed to load comments" ? t("Failed to load comments") : error}
              </p>
            ) : posts.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">{t("No posts yet.")}</p>
            ) : (
              posts.map((p) => {
                const pending = pendingCount(p);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setActiveId(p.id);
                      setReplyingTo(null);
                    }}
                    className={`flex w-full items-center gap-3 border-b border-border px-3 py-3 text-left hover:bg-surface-hover ${
                      p.id === activeId ? "bg-surface" : ""
                    }`}
                  >
                    {p.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.thumbnailUrl}
                        alt=""
                        loading="lazy"
                        className="h-12 w-12 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <span className="h-12 w-12 shrink-0 rounded bg-surface-hover" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">
                        {p.caption || "—"}
                      </span>
                      <span className="block text-xs text-muted">
                        {formatTime(p.timestamp, locale)} · {p.commentsCount}
                      </span>
                    </span>
                    {pending > 0 && (
                      <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-white">
                        {pending}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className={`min-h-0 min-w-0 flex-col ${active ? "flex" : "hidden sm:flex"}`}>
          {!active ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted">
              {t("Select a post to read and reply to its comments.")}
            </div>
          ) : (
            <>
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveId(null)}
                    className="-ml-1 rounded px-2 py-1 text-muted hover:text-foreground sm:hidden"
                    aria-label={t("Back")}
                  >
                    {t("Back")}
                  </button>
                  <span className="truncate font-semibold text-foreground">
                    {active.caption || "—"}
                  </span>
                </div>
                <div className="flex shrink-0 gap-1">
                  {([true, false] as const).map((pendingOnly) => (
                    <button
                      key={String(pendingOnly)}
                      type="button"
                      onClick={() => setOnlyPending(pendingOnly)}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        onlyPending === pendingOnly
                          ? "border-accent/50 text-accent"
                          : "border-border text-muted hover:text-foreground"
                      }`}
                    >
                      {pendingOnly ? t("Needs reply") : t("All")}
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                {visible.length === 0 ? (
                  <p className="text-sm text-muted">{t("No comments to show.")}</p>
                ) : (
                  visible.map((c) => (
                    <div key={c.id} className="rounded border border-border bg-surface p-3 text-sm">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium text-foreground">
                          {c.fromMe ? t("You") : `@${c.username ?? "unknown"}`}
                        </span>
                        <span className="text-xs text-muted">{formatTime(c.timestamp, locale)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-foreground">{c.text}</p>

                      {c.replies.map((r) => (
                        <div key={r.id} className="mt-2 border-l-2 border-border pl-3 text-xs text-muted">
                          <span className="font-medium">
                            {r.fromMe ? t("You") : `@${r.username ?? "unknown"}`}
                          </span>{" "}
                          {r.text}
                        </div>
                      ))}

                      <div className="mt-2 flex items-center gap-3">
                        {c.answered && (
                          <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs text-success">
                            {t("Answered")}
                          </span>
                        )}
                        {!c.fromMe && replyingTo !== c.id && (
                          <button
                            type="button"
                            onClick={() => startReply(c)}
                            className="text-xs font-medium text-accent hover:text-accent-hover"
                          >
                            {t("Reply")}
                          </button>
                        )}
                      </div>

                      {replyingTo === c.id && (
                        <div className="mt-3 space-y-2">
                          <div className="flex gap-1">
                            {(["public", "private"] as const).map((m) => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => setMode(m)}
                                className={`rounded-full border px-3 py-1 text-xs ${
                                  mode === m
                                    ? "border-accent/50 text-accent"
                                    : "border-border text-muted hover:text-foreground"
                                }`}
                              >
                                {m === "public" ? t("Reply publicly") : t("Send as DM")}
                              </button>
                            ))}
                          </div>
                          <textarea
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            rows={2}
                            autoFocus
                            placeholder={t("Write a reply…")}
                            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none"
                          />
                          {sendError && <p className="text-xs text-error">{sendError}</p>}
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setReplyingTo(null)}
                              className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
                            >
                              {t("Cancel")}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleSend(c)}
                              disabled={sending || !draft.trim()}
                              className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                            >
                              {sending ? t("Sending…") : t("Send")}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
