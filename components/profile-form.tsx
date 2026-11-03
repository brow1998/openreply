"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Trash2 } from "lucide-react";
import Avatar from "@/components/avatar";
import { useI18n } from "@/lib/i18n/provider";
import { checkUsername } from "@/lib/profile";
import type { ProfileResponse } from "@/app/api/profile/route";

// Square-crops and scales to 256x256 JPEG in the browser: there is no object storage, the photo lives in the database.
async function toJpegDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

export default function ProfileForm() {
  const { t } = useI18n();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<ProfileResponse | null>(null);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((payload) => {
        if (!payload.success || !payload.data) return;
        const p: ProfileResponse = payload.data;
        setLoaded(p);
        setName(p.name ?? "");
        setUsername(p.username ?? "");
        setImage(p.image);
      })
      .catch(() => setError(t("Could not load your profile.")));
  }, [t]);

  const usernameCheck = username.trim() ? checkUsername(username) : null;
  const usernameHint =
    usernameCheck && !usernameCheck.ok
      ? usernameCheck.error === "length"
        ? t("Use 3 to 30 characters.")
        : usernameCheck.error === "chars"
          ? t("Only letters, numbers, dots and underscores.")
          : t("This username is reserved.")
      : null;

  const messages: Record<string, string> = {
    username_taken: t("This username is already taken."),
    username_length: t("Use 3 to 30 characters."),
    username_chars: t("Only letters, numbers, dots and underscores."),
    username_reserved: t("This username is reserved."),
    photo_format: t("Use a JPG, PNG or WebP image."),
    photo_size: t("The photo is too large."),
  };

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      setImage(await toJpegDataUrl(file));
    } catch {
      setError(t("Use a JPG, PNG or WebP image."));
    }
  }

  async function save() {
    if (usernameHint) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, username, image }),
      });
      const payload = await res.json();
      if (!payload.success) {
        setError(messages[payload.error] ?? t("Could not save your profile."));
        return;
      }
      setLoaded(payload.data);
      setUsername(payload.data.username ?? "");
      setSaved(true);
      // The top bar reads the profile on the server.
      router.refresh();
    } catch {
      setError(t("Could not save your profile."));
    } finally {
      setSaving(false);
    }
  }

  const dirty =
    loaded !== null &&
    (name !== (loaded.name ?? "") || username.trim().toLowerCase() !== (loaded.username ?? "") || image !== loaded.image);
  const field =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent/50 focus:outline-none";

  return (
    <section className="panel mx-auto max-w-2xl space-y-6 p-6">
      <h2 className="text-sm font-semibold text-foreground">{t("Profile")}</h2>

      <div className="flex items-center gap-4">
        <Avatar name={name || loaded?.email || "?"} src={image} size={72} />
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => {
              void pickPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-surface-hover"
          >
            <Camera size={16} strokeWidth={1.75} aria-hidden="true" />
            {t("Change photo")}
          </button>
          {image && (
            <button
              type="button"
              onClick={() => setImage(null)}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
            >
              <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
              {t("Remove")}
            </button>
          )}
        </div>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm text-muted">{t("Name")}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={field} autoComplete="name" />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm text-muted">{t("Username")}</span>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">@</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={30}
            aria-invalid={Boolean(usernameHint)}
            aria-describedby="username-hint"
            className={`${field} pl-7`}
            autoComplete="username"
          />
        </div>
        <span id="username-hint" className={`block text-xs ${usernameHint ? "text-error" : "text-muted"}`}>
          {usernameHint ?? t("Letters, numbers, dots and underscores.")}
        </span>
      </label>

      {loaded?.email && (
        <p className="text-xs text-muted">
          {t("Email")}: <span className="font-mono">{loaded.email}</span>
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        <p role="status" aria-live="polite" className="text-sm">
          {error ? (
            <span className="text-error">{error}</span>
          ) : saved ? (
            <span className="inline-flex items-center gap-1 text-success">
              <Check size={14} strokeWidth={2} aria-hidden="true" />
              {t("Profile saved")}
            </span>
          ) : null}
        </p>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !dirty || Boolean(usernameHint)}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? t("Saving…") : t("Save")}
        </button>
      </div>
    </section>
  );
}
