"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import Avatar from "@/components/avatar";

export interface AccountOption {
  id: string;
  username: string;
  instagramId: string;
  name?: string | null;
  profilePictureUrl?: string | null;
}

interface AccountSelectProps {
  accounts: AccountOption[];
  value: string;
  onChange: (value: string) => void;
  includeAll?: boolean;
  label?: string;
}

// Some pages get their accounts from the stats endpoint, which has no photos;
// one shared request to the accounts endpoint fills them in for every page.
let photosRequest: Promise<Record<string, string | null>> | null = null;
function loadPhotos() {
  photosRequest ??= fetch("/api/instagram/accounts")
    .then((r) => r.json())
    .then((payload) =>
      Object.fromEntries(
        ((payload?.data?.instagramAccounts ?? []) as AccountOption[]).map((a) => [
          a.id,
          a.profilePictureUrl ?? null,
        ])
      )
    )
    .catch(() => {
      photosRequest = null;
      return {};
    });
  return photosRequest;
}

/**
 * Account switcher: a listbox that shows each account's photo and handle.
 * Keyboard: arrows/Home/End move, Enter/Space pick, Escape closes.
 */
export default function AccountSelect({
  accounts,
  value,
  onChange,
  includeAll = true,
  label,
}: AccountSelectProps) {
  const { t } = useI18n();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [photos, setPhotos] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let alive = true;
    void loadPhotos().then((p) => alive && setPhotos(p));
    return () => {
      alive = false;
    };
  }, []);

  // Close when the pointer goes down anywhere outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const options = [
    ...(includeAll ? [{ id: "all", username: "", label: t("All accounts"), photo: null, name: null }] : []),
    ...accounts.map((a) => ({
      id: a.id,
      username: a.username,
      label: `@${a.username}`,
      photo: a.profilePictureUrl ?? photos[a.id] ?? null,
      name: a.name ?? null,
    })),
  ];
  const selectedIndex = Math.max(0, options.findIndex((o) => o.id === value));
  const selected = options[selectedIndex];

  function show() {
    setActive(selectedIndex);
    setOpen(true);
  }
  function pick(index: number) {
    const option = options[index];
    if (option) onChange(option.id);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    const last = options.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: Math.min(last, active + 1),
      ArrowUp: Math.max(0, active - 1),
      Home: 0,
      End: last,
    };
    if (e.key in moves) {
      e.preventDefault();
      setActive(moves[e.key]);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(active);
    } else if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);
    }
  }

  const avatar = (o: (typeof options)[number], size: number) =>
    o.id === "all" ? null : <Avatar name={o.username} src={o.photo} size={size} />;

  return (
    <div ref={root} className="relative text-sm">
      <span id={`${id}-label`} className="sr-only">
        {label ?? t("Instagram account")}
      </span>
      {/* ARIA 1.2 select-only combobox: focus stays on the button, the list follows via activedescendant. */}
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-controls={`${id}-list`}
        aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className="flex min-w-48 items-center gap-2 rounded-lg border border-border bg-surface py-1.5 pl-2 pr-2.5 text-foreground outline-none transition-colors duration-(--dur-ui) ease-(--ease-out-quart) hover:border-border-hover focus-visible:border-accent/50"
      >
        {selected && avatar(selected, 22)}
        <span id={`${id}-value`} className="min-w-0 flex-1 truncate text-left">
          {selected?.label ?? t("All accounts")}
        </span>
        <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-muted" />
      </button>

      {open && (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-labelledby={`${id}-label`}
          className="absolute right-0 z-40 mt-1 max-h-72 min-w-full overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-xl"
        >
          {options.map((o, i) => (
            <li
              key={o.id}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={o.id === value}
              onMouseEnter={() => setActive(i)}
              // mousedown, not click: picks before the button loses focus.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(i);
              }}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 ${
                i === active ? "bg-surface-hover" : ""
              }`}
            >
              {avatar(o, 28)}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-foreground">{o.label}</span>
                {o.name && <span className="block truncate text-xs text-muted">{o.name}</span>}
              </span>
              {o.id === value && (
                <Check size={14} strokeWidth={2} aria-hidden="true" className="shrink-0 text-accent" />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
