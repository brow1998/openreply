"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import type { GifResult } from "@/app/api/gifs/search/route";

/**
 * Pick a GIF to send. Searches Giphy when the server has a key, and always
 * accepts a pasted https link (Instagram fetches media by public URL).
 */
export default function GifPicker({
  sending,
  onSend,
}: {
  sending: boolean;
  onSend: (url: string) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [results, setResults] = useState<GifResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [link, setLink] = useState("");

  // Debounced search; an empty query shows what is trending.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearching(true);
      fetch(`/api/gifs/search?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((payload) => {
          if (!payload.success) return;
          setConfigured(payload.data.configured);
          setResults(payload.data.results);
        })
        .catch(() => setConfigured(false))
        .finally(() => setSearching(false));
    }, query ? 350 : 0);
    return () => clearTimeout(timer);
  }, [query]);

  const linkOk = /^https:\/\/\S+$/.test(link.trim());

  return (
    <div className="space-y-2 rounded-xl border border-border bg-background p-3">
      {configured !== false && (
        <>
          <div className="relative">
            <Search
              size={14}
              strokeWidth={1.75}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Search GIFs")}
              className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted focus:border-accent/50 focus:outline-none"
            />
          </div>
          <div className="grid max-h-56 grid-cols-3 gap-1.5 overflow-y-auto">
            {results.map((g) => (
              <button
                key={g.id}
                type="button"
                disabled={sending}
                onClick={() => onSend(g.url)}
                title={g.title}
                className="aspect-square overflow-hidden rounded-lg bg-surface-hover transition-transform duration-(--dur-ui) ease-(--ease-out-quart) hover:scale-[1.03] active:scale-95 disabled:opacity-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.previewUrl} alt={g.title} loading="lazy" className="h-full w-full object-cover" />
              </button>
            ))}
            {!searching && results.length === 0 && (
              <p className="col-span-3 py-4 text-center text-xs text-muted">{t("No GIFs found.")}</p>
            )}
          </div>
        </>
      )}
      {configured === false && (
        <p className="text-xs text-muted">{t("Add a Giphy key to search GIFs. You can still paste a link.")}</p>
      )}
      <div className="flex gap-2">
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder={t("Paste a GIF link (https)")}
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent/50 focus:outline-none"
        />
        <button
          type="button"
          disabled={sending || !linkOk}
          onClick={() => onSend(link.trim())}
          className="shrink-0 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
        >
          {t("Send GIF")}
        </button>
      </div>
    </div>
  );
}
