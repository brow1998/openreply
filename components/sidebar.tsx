"use client";

/**
 * Sidebar Navigation
 *
 * Icon + label nav with active state and workspace section.
 */

import { signOutAction } from "@/lib/auth-actions";
import { useI18n } from "@/lib/i18n/provider";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Inbox,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  ScrollText,
  Settings,
  Zap,
} from "lucide-react";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Overview", href: "/overview", icon: BarChart3 },
  { label: "Inbox", href: "/inbox", icon: Inbox },
  { label: "Comments", href: "/comments", icon: MessageSquare },
  { label: "Campaigns", href: "/campaigns", icon: Zap },
  { label: "DM Logs", href: "/logs", icon: ScrollText },
  // Settings stays last; API & MCP and Diagnostics live under it.
  { label: "Settings", href: "/settings", icon: Settings },
] as const;

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({
  isOpen,
  onClose,
}: SidebarProps) {
  const { t } = useI18n();
  const pathname = usePathname();

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 z-50 h-dvh w-64 max-w-[85vw] shrink-0 bg-surface border-r border-border flex flex-col
          transition-transform duration-200 ease-out
          lg:h-full lg:translate-x-0 lg:static lg:z-auto
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Same reason as the top bar: the drawer is full height, so the
            wordmark would otherwise land under the status bar. */}
        <div
          className="px-6 py-5 border-b border-border"
          style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}
        >
          <Link
            href="/dashboard"
            className="font-display text-lg font-semibold tracking-tight"
          >
            Open<span className="text-accent">Reply</span>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                aria-current={isActive ? "page" : undefined}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
                  transition-colors duration-(--dur-ui) ease-(--ease-out-quart)
                  ${
                    isActive
                      ? "bg-surface-hover text-foreground font-medium"
                      : "text-muted hover:text-foreground hover:bg-surface-hover"
                  }
                `}
              >
                <Icon
                  size={18}
                  strokeWidth={1.75}
                  className={isActive ? "text-accent" : ""}
                  aria-hidden="true"
                />
                {t(item.label)}
              </Link>
            );
          })}
        </nav>

        <form
          action={signOutAction}
          className="px-3 py-4 border-t border-border"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        >
          <button
            type="submit"
            className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted hover:text-foreground hover:bg-surface-hover transition-colors duration-(--dur-ui) ease-(--ease-out-quart)"
          >
            <LogOut size={18} strokeWidth={1.75} aria-hidden="true" />
            {t("Sign out")}
          </button>
        </form>
      </aside>
    </>
  );
}
