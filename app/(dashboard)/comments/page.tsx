"use client";

/**
 * Comments
 *
 * The newest posts as a grid of covers (or a list), with the number of comments
 * still waiting on each. Opening a post slides in a panel with its comments and
 * a way to answer each one: publicly under the comment, or as a private DM.
 * Comments the account owner has already replied to are marked answered.
 * Refreshed by polling.
 */

import type { Locale } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Bookmark,
  Clapperboard,
  ExternalLink,
  Eye,
  Play,
  Heart,
  Layers,
  LayoutGrid,
  List,
  MessageCircle,
  Share2,
  Users,
  X,
} from "lucide-react";
import AccountSelect, { type AccountOption } from "@/components/account-select";
import Avatar, { useInstagramProfiles } from "@/components/avatar";
import GifPicker from "@/components/gif-picker";
import type { PostInsightsResponse } from "@/app/api/instagram/post-insights/route";
import type { PostViewsResponse } from "@/app/api/instagram/post-views/route";
import type {
  CommentPost,
  CommentThread,
} from "@/app/api/instagram/comments/route";

const POLL_MS = 30_000;

type ReplyMode = "public" | "private";
type View = "grid" | "list";
// Instagram crops the profile grid to 3:4; the Reels tab keeps the full 9:16 cover.
type Format = "feed" | "reels";

function formatDay(iso: string | null, locale: Locale): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

function formatTime(iso: string | null, locale: Locale): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${formatDay(iso, locale)} ${d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}`;
}

const formatCount = (n: number, locale: Locale) =>
  new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(n);

const pendingCount = (p: CommentPost) =>
  p.comments.filter((c) => !c.fromMe && !c.answered).length;

// Only the newest comments are fetched; more on the post means the count is a floor.
const pendingLabel = (p: CommentPost) =>
  `${pendingCount(p)}${p.commentsCount > p.comments.length ? "+" : ""}`;

function Cover({ post, className }: { post: CommentPost; className: string }) {
  return post.thumbnailUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={post.thumbnailUrl} alt="" loading="lazy" className={`${className} object-cover`} />
  ) : (
    <span className={`${className} bg-surface-hover`} />
  );
}

function Metrics({
  post,
  insights,
  locale,
}: {
  post: CommentPost;
  insights: PostInsightsResponse | undefined;
  locale: Locale;
}) {
  const { t } = useI18n();
  const loaded = insights ?? null;
  const tiles: [typeof Heart, string, number | null][] = [
    [Heart, t("Likes"), post.likeCount],
    [MessageCircle, t("Comments"), post.commentsCount],
    [Eye, t("Views"), loaded?.views ?? null],
    [Users, t("Reach"), loaded?.reach ?? null],
    [Bookmark, t("Saved"), loaded?.saved ?? null],
    [Share2, t("Shares"), loaded?.shares ?? null],
    [Activity, t("Interactions"), loaded?.totalInteractions ?? null],
  ];
  const shown = tiles.filter(([, , value], i) => i < 2 || value !== null);

  return (
    <div className="shrink-0 border-b border-border px-4 py-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {shown.map(([Icon, label, value]) => (
          <div key={label} className="rounded-lg bg-surface px-2.5 py-2">
            <div className="flex items-center gap-1.5 text-muted">
              <Icon size={12} strokeWidth={1.75} aria-hidden="true" />
              <span className="truncate text-[11px]">{label}</span>
            </div>
            <p className="mt-0.5 font-mono text-sm font-medium text-foreground">
              {value === null ? "—" : formatCount(value, locale)}
            </p>
          </div>
        ))}
        {insights === undefined &&
          [0, 1, 2].map((i) => (
            <div key={i} className="h-[3.1rem] animate-pulse rounded-lg bg-surface-hover" />
          ))}
      </div>
      {loaded?.unavailable && (
        <p className="mt-2 text-xs text-muted">{t("Metrics unavailable for this post.")}</p>
      )}
    </div>
  );
}

export default function CommentsPage() {
  const { t, locale } = useI18n();
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [posts, setPosts] = useState<CommentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("grid");
  const [format, setFormat] = useState<Format>(() => {
    if (typeof window === "undefined") return "feed";
    try {
      return window.localStorage.getItem("openreply-grid-format") === "reels" ? "reels" : "feed";
    } catch {
      return "feed";
    }
  });
  const [views, setViews] = useState<Record<string, number | null>>({});
  const requestedViews = useRef(new Set<string>());
  const [onlyPostsWithPending, setOnlyPostsWithPending] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [onlyPending, setOnlyPending] = useState(true);

  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [mode, setMode] = useState<ReplyMode>("public");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [gifOpen, setGifOpen] = useState(false);
  const [insights, setInsights] = useState<Record<string, PostInsightsResponse>>({});
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

  // View counts for the grid tiles, asked once per post.
  useEffect(() => {
    if (!selectedAccountId) return;
    const ids = posts
      .map((p) => p.id)
      .filter((id) => !requestedViews.current.has(`${selectedAccountId}:${id}`));
    if (ids.length === 0) return;
    ids.forEach((id) => requestedViews.current.add(`${selectedAccountId}:${id}`));
    fetch(`/api/instagram/post-views?instagramAccountId=${selectedAccountId}&ids=${ids.join(",")}`)
      .then((r) => r.json())
      .then((payload: { success: boolean; data?: PostViewsResponse }) => {
        if (payload.success && payload.data) setViews((prev) => ({ ...prev, ...payload.data!.views }));
      })
      .catch(() => {
        // Counts are decoration; tiles just show likes and comments.
      });
  }, [posts, selectedAccountId]);

  // Metrics for the open post, fetched once per post. Absent means still loading.
  const requestedInsights = useRef(new Set<string>());
  useEffect(() => {
    const post = posts.find((p) => p.id === activeId);
    if (!post || !selectedAccountId || requestedInsights.current.has(post.id)) return;
    requestedInsights.current.add(post.id);
    const none: PostInsightsResponse = {
      views: null, reach: null, saved: null, shares: null, totalInteractions: null, unavailable: true,
    };
    fetch(
      `/api/instagram/post-insights?instagramAccountId=${selectedAccountId}&mediaId=${post.id}&mediaType=${post.mediaType}`
    )
      .then((r) => r.json())
      .then((payload) =>
        setInsights((prev) => ({ ...prev, [post.id]: payload.success ? payload.data : none }))
      )
      .catch(() => setInsights((prev) => ({ ...prev, [post.id]: none })));
  }, [activeId, posts, selectedAccountId]);

  // Escape closes the panel.
  useEffect(() => {
    if (!activeId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId]);

  function openPost(id: string) {
    setActiveId(id);
    setReplyingTo(null);
    setOnlyPending(true);
  }

  function startReply(c: CommentThread) {
    setReplyingTo(c.id);
    setDraft("");
    setSendError(null);
    setMode("public");
    setGifOpen(false);
  }

  async function handleSend(c: CommentThread, gifUrl?: string) {
    const text = draft.trim();
    if ((!text && !gifUrl) || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch("/api/instagram/comments/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instagramAccountId: selectedAccountId,
          commentId: c.id,
          ...(gifUrl ? { gifUrl } : { text }),
          mode: gifUrl ? "private" : mode,
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
                    mode === "public" && !gifUrl
                      ? [
                          ...x.replies,
                          {
                            id: `local-${crypto.randomUUID()}`,
                            text,
                            username: null,
                            userId: null,
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
      setGifOpen(false);
    } catch {
      setSendError("Failed to send reply");
    } finally {
      setSending(false);
    }
  }

  const shownPosts = (onlyPostsWithPending
    ? posts.filter((p) => pendingCount(p) > 0)
    : posts
  ).filter((p) => format === "feed" || p.mediaType === "REEL");
  // Photos for the open post's commenters. Most never messaged the account, so
  // Instagram refuses them and they keep their initials.
  const commenterProfiles = useInstagramProfiles(
    selectedAccountId,
    active ? active.comments.flatMap((c) => [c.userId, ...c.replies.map((r) => r.userId)]) : []
  );

  const visibleComments = active
    ? active.comments.filter((c) => !onlyPending || (!c.fromMe && !c.answered))
    : [];

  const chip = (selected: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs transition-colors duration-(--dur-ui) ease-(--ease-out-quart) ${
      selected
        ? "border-accent/50 bg-accent/10 text-accent"
        : "border-border text-muted hover:text-foreground"
    }`;

  return (
    <div className="space-y-5">
      <div className="mx-auto flex max-w-[58rem] flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setOnlyPostsWithPending(false)} className={chip(!onlyPostsWithPending)}>
            {t("All posts")}
          </button>
          <button type="button" onClick={() => setOnlyPostsWithPending(true)} className={chip(onlyPostsWithPending)}>
            {t("Needs reply")}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {accounts.length > 1 && (
            <AccountSelect
              accounts={accounts}
              value={selectedAccountId}
              onChange={setSelectedAccountId}
              includeAll={false}
            />
          )}
          {view === "grid" && (
            <div className="flex gap-1 rounded-lg border border-border p-0.5">
              {(["feed", "reels"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={format === f}
                  onClick={() => {
                    setFormat(f);
                    try {
                      window.localStorage.setItem("openreply-grid-format", f);
                    } catch {
                      // Private mode: the choice lasts until reload.
                    }
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs transition-colors duration-(--dur-ui) ease-(--ease-out-quart) ${
                    format === f ? "bg-surface-hover text-foreground" : "text-muted hover:text-foreground"
                  }`}
                >
                  {f === "feed" ? t("Feed") : t("Reels")}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1 rounded-lg border border-border p-0.5">
            {([
              ["grid", LayoutGrid, t("Grid view")],
              ["list", List, t("List view")],
            ] as const).map(([v, Icon, label]) => (
              <button
                key={v}
                type="button"
                aria-label={label}
                aria-pressed={view === v}
                title={label}
                onClick={() => setView(v)}
                className={`rounded-md p-1.5 transition-colors duration-(--dur-ui) ease-(--ease-out-quart) ${
                  view === v ? "bg-surface-hover text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                <Icon size={16} strokeWidth={1.75} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && posts.length === 0 ? (
        <div className="mx-auto grid max-w-[58rem] grid-cols-3 gap-1">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse bg-surface-hover" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-error">
          {error === "Failed to load comments" ? t("Failed to load comments") : error}
        </p>
      ) : shownPosts.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">{t("No posts yet.")}</p>
      ) : view === "grid" ? (
        // Same shape as Instagram's own profile grid: three columns, hairline gaps, 3:4 tiles.
        <div className={`mx-auto grid gap-1 ${format === "reels" ? "max-w-[64rem] grid-cols-3 sm:grid-cols-4" : "max-w-[52rem] grid-cols-3"}`}>
          {shownPosts.map((p) => {
            const pending = pendingCount(p);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => openPost(p.id)}
                aria-label={p.caption || t("Comments")}
                className={`group relative overflow-hidden bg-surface focus-visible:z-10 ${format === "reels" ? "aspect-[9/16]" : "aspect-[3/4]"}`}
              >
                <Cover post={p} className="absolute inset-0 h-full w-full" />
                {p.mediaType === "REEL" && (
                  <Clapperboard size={18} strokeWidth={1.75} aria-hidden="true" className="absolute right-2 top-2 text-white drop-shadow" />
                )}
                {p.mediaType === "CAROUSEL_ALBUM" && (
                  <Layers size={18} strokeWidth={1.75} aria-hidden="true" className="absolute right-2 top-2 text-white drop-shadow" />
                )}
                {format === "reels" && views[p.id] != null && (
                  // Legibility scrim for the count over bright covers.
                  <span className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/60 to-transparent" />
                )}
                {format === "reels" && views[p.id] != null && (
                  <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 font-mono text-xs font-medium text-white drop-shadow">
                    <Play size={12} strokeWidth={2} fill="currentColor" aria-hidden="true" />
                    {formatCount(views[p.id]!, locale)}
                  </span>
                )}
                {pending > 0 && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 font-mono text-xs font-medium text-accent-foreground">
                    <MessageCircle size={12} strokeWidth={2} aria-hidden="true" />
                    {pendingLabel(p)}
                  </span>
                )}
                {/* As on Instagram: likes and comments appear over the cover on hover. */}
                <span className="absolute inset-0 flex items-center justify-center gap-4 bg-black/50 font-mono text-sm font-medium text-white opacity-0 transition-opacity duration-(--dur-ui) ease-(--ease-out-quart) group-hover:opacity-100 group-focus-visible:opacity-100">
                  {views[p.id] != null && (
                    <span className="inline-flex items-center gap-1.5">
                      <Play size={15} strokeWidth={2} fill="currentColor" aria-hidden="true" />
                      {formatCount(views[p.id]!, locale)}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5">
                    <Heart size={16} strokeWidth={2} fill="currentColor" aria-hidden="true" />
                    {formatCount(p.likeCount, locale)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <MessageCircle size={16} strokeWidth={2} fill="currentColor" aria-hidden="true" />
                    {formatCount(p.commentsCount, locale)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mx-auto max-w-[58rem] overflow-hidden rounded-xl border border-border">
          {shownPosts.map((p) => {
            const pending = pendingCount(p);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => openPost(p.id)}
                className="flex w-full items-center gap-4 border-b border-border bg-surface px-4 py-3 text-left transition-colors duration-(--dur-ui) ease-(--ease-out-quart) last:border-b-0 hover:bg-surface-hover"
              >
                <Cover post={p} className="h-16 w-16 shrink-0 rounded-lg" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{p.caption || "—"}</span>
                  <span className="mt-1 flex items-center gap-3 font-mono text-xs text-muted">
                    <span>{formatDay(p.timestamp, locale)}</span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle size={12} strokeWidth={1.75} aria-hidden="true" />
                      {p.commentsCount}
                    </span>
                  </span>
                </span>
                {pending > 0 && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 font-mono text-xs font-medium text-accent-foreground">
                    <MessageCircle size={12} strokeWidth={2} aria-hidden="true" />
                    {pendingLabel(p)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {active && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label={t("Close")}
            onClick={() => setActiveId(null)}
            className="absolute inset-0 bg-black/60"
          />
          <aside className="relative flex h-full w-full flex-col border-l border-border bg-background sm:max-w-[30rem]">
            <header
              className="flex shrink-0 items-start gap-3 border-b border-border p-4"
              style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}
            >
              <Cover post={active} className="h-16 w-16 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm text-foreground">{active.caption || "—"}</p>
                <div className="mt-1.5 flex items-center gap-3 font-mono text-xs text-muted">
                  <span>{formatDay(active.timestamp, locale)}</span>
                  <span className="inline-flex items-center gap-1">
                    <MessageCircle size={12} strokeWidth={1.75} aria-hidden="true" />
                    {active.commentsCount}
                  </span>
                  {active.permalink && (
                    <a
                      href={active.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-sans text-accent hover:text-accent-hover"
                    >
                      <ExternalLink size={12} strokeWidth={1.75} aria-hidden="true" />
                      {t("Open on Instagram")}
                    </a>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveId(null)}
                aria-label={t("Close")}
                className="shrink-0 rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-foreground"
              >
                <X size={18} strokeWidth={1.75} />
              </button>
            </header>

            <Metrics post={active} insights={insights[active.id]} locale={locale} />

            <div className="flex shrink-0 gap-2 border-b border-border px-4 py-2.5">
              <button type="button" onClick={() => setOnlyPending(true)} className={chip(onlyPending)}>
                {t("Needs reply")}
              </button>
              <button type="button" onClick={() => setOnlyPending(false)} className={chip(!onlyPending)}>
                {t("All")}
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {visibleComments.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">{t("No comments to show.")}</p>
              ) : (
                visibleComments.map((c) => (
                  <div key={c.id} className="flex gap-3">
                    <Avatar name={c.username ?? "?"} src={c.userId ? commenterProfiles[c.userId]?.profilePic : null} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {c.fromMe ? t("You") : `@${c.username ?? "unknown"}`}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-muted">
                          {formatTime(c.timestamp, locale)}
                        </span>
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">{c.text}</p>

                      {c.replies.map((r) => (
                        <div key={r.id} className="mt-2 flex gap-2 text-xs">
                          <Avatar name={r.fromMe ? "You" : (r.username ?? "?")} src={r.userId ? commenterProfiles[r.userId]?.profilePic : null} size={20} />
                          <p className="min-w-0 text-muted">
                            <span className="font-medium text-foreground">
                              {r.fromMe ? t("You") : `@${r.username ?? "unknown"}`}
                            </span>{" "}
                            {r.text}
                          </p>
                        </div>
                      ))}

                      <div className="mt-2 flex items-center gap-3">
                        {c.likeCount > 0 && (
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted">
                            <Heart size={11} strokeWidth={1.75} aria-hidden="true" />
                            {c.likeCount}
                          </span>
                        )}
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
                        <div className="mt-3 space-y-2 rounded-xl border border-border bg-surface p-3">
                          <div className="flex flex-wrap gap-2">
                            {(["public", "private"] as const).map((m) => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => {
                                  setMode(m);
                                  if (m === "public") setGifOpen(false);
                                }}
                                className={chip(mode === m && !gifOpen)}
                              >
                                {m === "public" ? t("Reply publicly") : t("Send as DM")}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => {
                                setMode("private");
                                setGifOpen((v) => !v);
                              }}
                              className={chip(gifOpen)}
                            >
                              {t("GIF")}
                            </button>
                          </div>
                          {gifOpen && (
                            <>
                              <p className="text-xs text-muted">{t("GIFs go out as a DM, not as a public reply.")}</p>
                              <GifPicker sending={sending} onSend={(url) => void handleSend(c, url)} />
                            </>
                          )}
                          <textarea
                            hidden={gifOpen}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            rows={2}
                            autoFocus
                            placeholder={t("Write a reply…")}
                            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent/50 focus:outline-none"
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
                              className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
                            >
                              {sending ? t("Sending…") : t("Send")}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
