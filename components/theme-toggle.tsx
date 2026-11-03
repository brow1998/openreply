"use client";

import { useSyncExternalStore } from "react";
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

export default function ThemeToggle() {
  const { t } = useI18n();
  // null on the server so the markup matches until hydration.
  const theme = useSyncExternalStore(subscribe, read, () => null);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("openreply-theme", next);
    } catch {
      // Private mode: the choice just lasts until reload.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t("Toggle theme")}
      title={t("Toggle theme")}
      className="shrink-0 rounded border border-border px-2.5 py-1.5 text-sm text-muted hover:text-foreground"
    >
      {theme === null ? "  " : theme === "dark" ? "☀" : "☾"}
    </button>
  );
}
