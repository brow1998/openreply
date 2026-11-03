"use client";

import type { StaticMessageKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import { Ban, Check, Clock, Copy, Gauge, SearchX, X, type LucideIcon } from "lucide-react";

/**
 * Status label for DM status: icon + text, so color never carries the state alone.
 */

const statusConfig: Record<string, { text: string; label: StaticMessageKey; icon: LucideIcon }> = {
  SENT: { text: "text-success", label: "Sent", icon: Check },
  FAILED: { text: "text-error", label: "Failed", icon: X },
  PENDING: { text: "text-warning", label: "Pending", icon: Clock },
  SKIPPED_DEDUP: { text: "text-muted", label: "Dedup", icon: Copy },
  SKIPPED_RATE_LIMIT: { text: "text-warning", label: "Rate limited", icon: Gauge },
  SKIPPED_PLAN_LIMIT: { text: "text-warning", label: "Skipped", icon: Ban },
  SKIPPED_NO_MATCH: { text: "text-muted", label: "No match", icon: SearchX },
};

interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useI18n();
  const config = statusConfig[status] ?? statusConfig.PENDING;
  const Icon = config.icon;

  return (
    <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-sm ${config.text}`}>
      <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
      {t(config.label)}
    </span>
  );
}
