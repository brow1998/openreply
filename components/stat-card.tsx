"use client";

import type { LucideIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Stat Card
 *
 * Metric panel: small icon + label, a mono number, and an optional trend.
 */

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: string;
  trendUp?: boolean;
}

export default function StatCard({ label, value, icon: Icon, trend, trendUp }: StatCardProps) {
  const { t } = useI18n();
  return (
    <div className="panel p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted">
        {Icon && <Icon size={14} strokeWidth={1.75} aria-hidden="true" />}
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-1.5 font-mono text-2xl font-medium tabular-nums text-foreground">{value}</p>
      {trend && (
        <p className={`mt-1 text-xs ${trendUp ? "text-success" : "text-error"}`}>
          {trendUp ? t("Up") : t("Down")} {trend}
        </p>
      )}
    </div>
  );
}
