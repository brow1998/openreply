"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Plug, SlidersHorizontal, UserRound } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";

const tabs = [
  { label: "Profile", href: "/settings/profile", icon: UserRound },
  { label: "General", href: "/settings", icon: SlidersHorizontal },
  { label: "API & MCP", href: "/settings/api", icon: Plug },
  { label: "Diagnostics", href: "/settings/diagnostics", icon: Activity },
] as const;

// Settings is one area with tabs, so API keys and diagnostics sit under it instead of the sidebar.
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <nav aria-label={t("Settings")} className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border [scrollbar-width:none]">
        {tabs.map(({ label, href, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors duration-(--dur-ui) ease-(--ease-out-quart) ${
                active
                  ? "border-accent font-medium text-foreground"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              <Icon size={16} strokeWidth={1.75} aria-hidden="true" className={active ? "text-accent" : ""} />
              {t(label)}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
