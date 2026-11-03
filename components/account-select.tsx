"use client";

import { useI18n } from "@/lib/i18n/provider";


export interface AccountOption {
  id: string;
  username: string;
  instagramId: string;
  name?: string | null;
}

interface AccountSelectProps {
  accounts: AccountOption[];
  value: string;
  onChange: (value: string) => void;
  includeAll?: boolean;
  label?: string;
}

export default function AccountSelect({
  accounts,
  value,
  onChange,
  includeAll = true,
  label,
}: AccountSelectProps) {
  const { t } = useI18n();
  return (
    // The label stays for screen readers; visually the @handle options already say what this is.
    <label className="flex flex-col text-sm">
      <span className="sr-only">
        {label ?? t("Instagram account")}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-48 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors duration-(--dur-ui) ease-(--ease-out-quart) hover:border-border-hover focus:border-accent/50"
      >
        {includeAll && <option value="all">{t("All accounts")}</option>}
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            @{account.username}
          </option>
        ))}
      </select>
    </label>
  );
}

