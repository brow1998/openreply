"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";

type Theme = "light" | "dark";

// The theme lives on <html data-theme>, set before paint by app/layout.tsx.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

const read = (): Theme | null =>
  document.documentElement.dataset.theme === "light" ? "light" : "dark";

/** Dark/Light segmented control for Settings > Appearance. */
export default function ThemeToggle() {
  const { t } = useI18n();
  // null on the server so the markup matches until hydration.
  const theme = useSyncExternalStore(subscribe, read, () => null);

  function choose(next: Theme) {
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("openreply-theme", next);
    } catch {
      // Private mode: the choice just lasts until reload.
    }
  }

  return (
    <div role="radiogroup" aria-label={t("Theme")} className="inline-flex gap-1 rounded-lg border border-border p-0.5">
      {([
        ["dark", Moon, t("Dark")],
        ["light", Sun, t("Light")],
      ] as const).map(([value, Icon, label]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          onClick={() => choose(value)}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors duration-(--dur-ui) ease-(--ease-out-quart) ${
            theme === value ? "bg-surface-hover text-foreground" : "text-muted hover:text-foreground"
          }`}
        >
          <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
