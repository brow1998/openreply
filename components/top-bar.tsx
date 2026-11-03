"use client";

/**
 * Top Bar
 *
 * Page title, mobile hamburger, and connection status.
 */

import type { StaticMessageKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Avatar from "@/components/avatar";

const pageTitles: Record<string, StaticMessageKey> = {
  "/dashboard": "Dashboard",
  "/overview": "Overview",
  "/inbox": "Inbox",
  "/comments": "Comments",
  "/campaigns/import": "Import campaigns",
  "/campaigns": "Campaigns",
  "/campaigns/new": "New Campaign",
  "/automations": "Campaigns",
  "/automations/new": "New Campaign",
  "/logs": "DM Logs",
  "/settings": "Settings",
  "/settings/api": "Settings",
  "/settings/diagnostics": "Settings",
  "/settings/profile": "Settings",
};

interface TopBarProps {
  onMenuClick: () => void;
  instagramUsername: string | null;
  instagramAccountCount: number;
  user: { name: string; image: string | null };
}

export default function TopBar({
  onMenuClick,
  instagramUsername,
  instagramAccountCount,
  user,
}: TopBarProps) {
  const { t } = useI18n();
  const pathname = usePathname();
  const title: StaticMessageKey = pageTitles[pathname] ?? (
    pathname.endsWith("/edit") ? "Edit campaign"
      : pathname.startsWith("/campaigns/") ? "Campaign details" : "Dashboard"
  );

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 lg:px-8 border-b border-border bg-background"
      // Installed to the home screen the app starts at the very top of the
      // display, so without this the title sits under the clock and battery.
      // The inset is 0 in a browser tab and on desktop.
      style={{
        height: "calc(4rem + env(safe-area-inset-top))",
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <button
          onClick={onMenuClick}
          className="lg:hidden shrink-0 px-2.5 py-1.5 rounded border border-border text-sm text-muted hover:text-foreground"
          aria-label={t("Toggle sidebar")}
        >
          {t("Menu")}
        </button>
        <h1 className="truncate text-base font-semibold sm:text-lg">{t(title)}</h1>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {instagramAccountCount > 0 ? (
          <p className="shrink-0 truncate text-sm text-muted">
            {instagramAccountCount > 1
              ? t("{count} accounts", { count: instagramAccountCount })
              : `@${instagramUsername}`}
          </p>
        ) : (
          <a
            href="/api/instagram/connect"
            className="shrink-0 whitespace-nowrap text-sm font-medium px-3 py-1.5 rounded bg-accent text-accent-foreground hover:bg-accent-hover"
          >
            {/* Full label needs more room than a 360px header has to spare. */}
            <span className="sm:hidden">{t("Connect")}</span>
            <span className="hidden sm:inline">{t("Connect Instagram")}</span>
          </a>
        )}
        <Link
          href="/settings/profile"
          aria-label={t("Profile")}
          title={user.name}
          className="flex shrink-0 items-center gap-2 rounded-full border border-border py-0.5 pl-0.5 pr-0.5 transition-colors duration-(--dur-ui) ease-(--ease-out-quart) hover:bg-surface-hover sm:pr-3"
        >
          <Avatar name={user.name || "?"} src={user.image} size={28} />
          <span className="hidden max-w-[10rem] truncate text-sm text-foreground sm:inline">{user.name}</span>
        </Link>
      </div>
    </header>
  );
}
