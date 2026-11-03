"use client";

/**
 * Dashboard Home Page
 *
 * Overview cards, 7-day chart, and recent activity feed.
 */

import { useI18n } from "@/lib/i18n/provider";
import { useEffect, useState } from "react";
import AccountSelect, { type AccountOption } from "@/components/account-select";
import StatCard from "@/components/stat-card";
import { Hash, MousePointerClick, Percent, Send, SkipForward, TriangleAlert, Zap } from "lucide-react";
import StatusBadge from "@/components/status-badge";

interface DashboardStats {
  userName: string | null;
  contactsCount: number;
  totalAutomations: number;
  activeAutomations: number;
  dmsSentToday: number;
  dmsSentWeek: number;
  dmsSentMonth: number;
  dmsSkippedMonth: number;
  dmsFailedMonth: number;
  totalDMs: number;
  clicksThisMonth: number;
  totalClicks: number;
  ctrThisMonth: number;
  instagramAccounts: AccountOption[];
  selectedInstagramAccountId: string | null;
  topKeywords: { keyword: string; count: number }[];
  dailyDMs: { date: string; count: number }[];
  recentLogs: Array<{
    id: string;
    commenterName: string | null;
    commentText: string;
    status: string;
    createdAt: string;
    automation: { name: string };
    instagramAccount?: { username: string };
  }>;
}

export default function DashboardPage() {
  const { t, label } = useI18n();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState("all");

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedAccountId !== "all") {
      params.set("instagramAccountId", selectedAccountId);
    }

    fetch(`/api/dashboard/stats${params.size ? `?${params}` : ""}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setStats(data.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedAccountId]);

  function handleAccountChange(accountId: string) {
    setLoading(true);
    setSelectedAccountId(accountId);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="panel h-[5.5rem] animate-pulse p-4">
              <div className="h-3 w-20 rounded bg-surface-hover" />
              <div className="mt-3 h-6 w-14 rounded bg-surface-hover" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const maxDM = Math.max(...(stats?.dailyDMs.map((d) => d.count) ?? [1]), 1);

  const connectedCount = stats?.instagramAccounts.length ?? 0;

  return (
    <div className="space-y-8">
      {/* Greeting header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {t("Hello, {name}!", { name: stats?.userName ?? t("there") })}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {t(connectedCount === 1 ? "{count} connected account" : "{count} connected accounts", { count: connectedCount })}
            {" · "}
            {t(stats?.contactsCount === 1 ? "{count} contact" : "{count} contacts", { count: stats?.contactsCount ?? 0 })}
            {" · "}
            <a href="/logs" className="text-accent hover:underline">
              {t("See activity")}
            </a>
          </p>
        </div>
        {stats && stats.instagramAccounts.length > 1 && (
          <AccountSelect
            accounts={stats.instagramAccounts}
            value={selectedAccountId}
            onChange={handleAccountChange}
          />
        )}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        <StatCard
          icon={Zap}
          label={t("Active Campaigns")}
          value={stats?.activeAutomations ?? 0}
        />
        <StatCard icon={Send} label={t("DMs Sent")} value={stats?.dmsSentMonth ?? 0} />
        <StatCard icon={SkipForward} label={t("Skipped")} value={stats?.dmsSkippedMonth ?? 0} />
        <StatCard icon={TriangleAlert} label={t("Failed")} value={stats?.dmsFailedMonth ?? 0} />
        <StatCard icon={MousePointerClick} label={t("Clicks")} value={stats?.clicksThisMonth ?? 0} />
        <StatCard icon={Percent} label={t("CTR")} value={`${stats?.ctrThisMonth ?? 0}%`} />
      </div>

      {/* Chart + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-6 gap-4 sm:gap-6">
        {/* 7-Day Chart */}
        <div className="lg:col-span-3 panel p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-foreground mb-6">{t("DMs — Last 7 Days")}</h2>
          <div className="flex items-end gap-1.5 h-40 sm:gap-2">
            {stats?.dailyDMs.map((day) => (
              <div key={label(day.date)} className="min-w-0 flex-1 h-full flex flex-col items-center gap-2">
                <span className="font-mono text-xs font-medium tabular-nums text-muted">{day.count}</span>
                {/* A percentage height needs a parent with a definite height, so
                    the bar sits in a wrapper that fills the column's free space. */}
                <div className="w-full min-h-0 flex-1 flex items-end">
                  <div
                    className="w-full rounded-t-md bg-accent min-h-[4px]"
                    style={{ height: `${Math.max((day.count / maxDM) * 100, 4)}%` }}
                  />
                </div>
                {/* Seven labels share a phone's width, so they must not wrap. */}
                <span className="w-full truncate text-center font-mono text-[10px] text-muted">
                  {label(day.date)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Keywords */}
        <div className="lg:col-span-1 panel p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-foreground mb-4">{t("Top Keywords")}</h2>
          <div className="space-y-3">
            {stats?.topKeywords.length === 0 && (
              <div className="py-6 text-sm">
                <Hash size={18} strokeWidth={1.75} className="text-muted" aria-hidden="true" />
                <p className="mt-2 text-foreground">{t("No keyword matches yet")}</p>
                <p className="mt-1 text-xs text-muted">{t("When someone comments a campaign keyword, it shows up here.")}</p>
              </div>
            )}
            {stats?.topKeywords.map((keyword) => (
              <div key={keyword.keyword} className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-medium text-foreground">
                  {keyword.keyword}
                </span>
                <span className="font-mono text-xs tabular-nums text-muted">{keyword.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="lg:col-span-2 panel p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-foreground mb-4">{t("Recent Activity")}</h2>
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {stats?.recentLogs.length === 0 && (
              <div className="py-6 text-center text-sm">
                <p className="text-foreground">{t("No activity yet")}</p>
                <p className="mt-1 text-xs text-muted">{t("Every DM your campaigns send, skip or fail is listed here.")}</p>
              </div>
            )}
            {stats?.recentLogs.map((log) => (
              <div
                key={log.id}
                className="flex min-h-12 items-center justify-between gap-3 border-b border-border py-2 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    @{log.commenterName ?? "unknown"}
                  </p>
                  <p className="text-xs text-muted truncate">
                    {log.instagramAccount
                      ? `@${log.instagramAccount.username} · `
                      : ""}
                    {log.commentText}
                  </p>
                </div>
                <StatusBadge status={log.status} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
