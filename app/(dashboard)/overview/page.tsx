"use client";

/**
 * Instagram Overview Page
 *
 * Aggregate reach/engagement across your recent posts, plus a per-post table.
 * Views / reach / saved / shares come from Instagram media insights (requires
 * the insights permission); likes and comments are always available.
 */

import type { Locale } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import { useEffect, useState } from "react";
import AccountSelect from "@/components/account-select";
import StatCard from "@/components/stat-card";
import { Bookmark, Eye, Heart, LayoutGrid, List, MessageCircle, Share2, Users } from "lucide-react";
import OverviewPostGrid, { MediaTypeIcon } from "@/components/overview-post-grid";
import FollowerChart from "@/components/follower-chart";
import type { OverviewResponse } from "@/app/api/instagram/overview/route";

function formatNumber(n: number | null, locale: Locale): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString(locale);
}

function formatDate(iso: string, locale: Locale): string {
  const d = new Date(iso);
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

const COUNT_OPTIONS = [
  { value: "25", label: "Last 25" },
  { value: "50", label: "Last 50" },
  { value: "100", label: "Last 100" },
  { value: "all", label: "All time" },
] as const;

export default function OverviewPage() {
  const { t, locale } = useI18n();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState("all");
  const [count, setCount] = useState("50");
  const [view, setView] = useState<"list" | "grid">("list");

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedAccountId !== "all") {
      params.set("instagramAccountId", selectedAccountId);
    }
    params.set("count", count);

    fetch(`/api/instagram/overview?${params}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setData(res.data);
          setError(null);
        } else {
          setError(res.error ?? "Failed to load overview");
        }
      })
      .catch(() => setError("Failed to load overview"))
      .finally(() => setLoading(false));
  }, [selectedAccountId, count]);

  function handleAccountChange(accountId: string) {
    setLoading(true);
    setSelectedAccountId(accountId);
  }

  function handleCountChange(next: string) {
    setLoading(true);
    setCount(next);
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="panel h-[5.5rem] animate-pulse p-4">
            <div className="h-4 w-16 bg-surface-hover rounded" />
            <div className="mt-3 h-6 w-20 bg-surface-hover rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel p-8 text-center">
        <p className="text-sm text-error">{error === "Failed to load overview" ? t("Failed to load overview") : error}</p>
        {error.includes("connect") && (
          <a
            href="/api/instagram/connect"
            className="mt-4 inline-block text-sm text-accent hover:underline"
          >
            {t("Connect Instagram")}
          </a>
        )}
      </div>
    );
  }

  if (!data) return null;

  const { totals, posts, accounts, insightsAvailable, followers, followerHistory } =
    data;

  return (
    <div className="space-y-8">
      {data.limitations?.map(note => <p key={note} className="text-sm text-muted">{note}</p>)}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted">
            {data.provider !== "ZERNIO" && data.requestedCount === "all" ? t("All-time") : t("Recent")} —{" "}
            {t(totals.posts === 1 ? "{count} post" : "{count} posts", { count: totals.posts })} {t("from @")}
            {data.account.username}
            {data.truncated ? t(" (capped at {count})", { count: totals.posts }) : ""}
          </p>
          {followers !== null && (
            // Kept out of the tile row below: that row sums the selected posts,
            // whereas this is a current account-level total.
            <p className="mt-1 text-sm text-muted">
              {followers.toLocaleString(locale)} {t("followers")}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              {t("Range")}
            </span>
            <select
              value={count}
              onChange={(e) => handleCountChange(e.target.value)}
              className="border-0 bg-transparent py-2 pr-1 text-sm text-foreground outline-none"
            >
              {COUNT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.label)}
                </option>
              ))}
            </select>
          </label>
          {accounts.length > 1 && (
            <AccountSelect
              accounts={accounts.map((a) => ({
                id: a.id,
                username: a.username,
                instagramId: a.id,
              }))}
              value={selectedAccountId}
              onChange={handleAccountChange}
            />
          )}
        </div>
      </div>

      {!insightsAvailable && (
        <div className="panel p-4">
          <p className="text-sm text-foreground">
            {t("Views, reach, saved and shares need the insights permission.")}
          </p>
          <p className="text-sm text-muted mt-1">
            {t("Reconnect your account to grant it — likes and comments are shown in the meantime.")}
          </p>
          <a
            href="/api/instagram/connect"
            className="mt-3 inline-block text-sm text-accent hover:underline"
          >
            {t("Reconnect Instagram")}
          </a>
        </div>
      )}

      {/* Aggregate totals */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <StatCard icon={Eye} label={t("Views")} value={formatNumber(totals.views, locale)} />
        <StatCard icon={Users} label={t("Reach")} value={formatNumber(totals.reach, locale)} />
        <StatCard icon={Heart} label={t("Likes")} value={formatNumber(totals.likes, locale)} />
        <StatCard icon={MessageCircle} label={t("Comments")} value={formatNumber(totals.comments, locale)} />
        <StatCard icon={Bookmark} label={t("Saved")} value={formatNumber(totals.saved, locale)} />
        <StatCard icon={Share2} label={t("Shares")} value={formatNumber(totals.shares, locale)} />
      </div>

      {/* Follower trend — account-level, independent of the post range */}
      <FollowerChart data={followerHistory} followers={followers} />

      {/* Per-post table */}
      <div className="panel p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">{t("Posts")}</h2>
          <div className="flex gap-1 rounded-lg border border-border p-0.5">
            {([
              ["list", List, t("List view")],
              ["grid", LayoutGrid, t("Grid view")],
            ] as const).map(([v, Icon, viewLabel]) => (
              <button
                key={v}
                type="button"
                aria-label={viewLabel}
                aria-pressed={view === v}
                title={viewLabel}
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
        {posts.length === 0 ? (
          <p className="text-sm text-muted py-8 text-center">{t("No posts found")}</p>
        ) : view === "grid" ? (
          <OverviewPostGrid posts={posts} format={formatNumber} locale={locale} />
        ) : (
          // Eight metric columns can't compress into a phone; let the table keep
          // its natural width and scroll inside the panel instead.
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="py-2 pr-4 font-medium">{t("Post")}</th>
                  <th className="py-2 px-3 font-medium text-right">{t("Views")}</th>
                  <th className="py-2 px-3 font-medium text-right">{t("Reach")}</th>
                  <th className="py-2 px-3 font-medium text-right">{t("Likes")}</th>
                  <th className="py-2 px-3 font-medium text-right">{t("Comments")}</th>
                  <th className="py-2 px-3 font-medium text-right">{t("Saved")}</th>
                  <th className="py-2 px-3 font-medium text-right">{t("Shares")}</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="max-w-sm py-2.5 pr-4">
                      <a
                        href={p.permalink ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex min-w-0 items-center gap-3"
                      >
                        {p.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.thumbnailUrl} alt="" loading="lazy" className="h-16 w-14 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <span className="h-16 w-14 shrink-0 rounded-lg bg-surface-hover" />
                        )}
                        <span className="min-w-0">
                          <span className="line-clamp-2 text-sm leading-snug text-foreground group-hover:text-accent">
                            {p.caption || t("{type} post", { type: p.mediaType })}
                          </span>
                          <span className="mt-1 flex items-center gap-1.5 font-mono text-xs text-muted">
                            <MediaTypeIcon type={p.mediaType} />
                            {formatDate(p.timestamp, locale)}
                          </span>
                        </span>
                      </a>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-muted">
                      {formatNumber(p.views, locale)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-muted">
                      {formatNumber(p.reach, locale)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-muted">
                      {formatNumber(p.likes, locale)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-muted">
                      {formatNumber(p.comments, locale)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-muted">
                      {formatNumber(p.saved, locale)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-muted">
                      {formatNumber(p.shares, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
