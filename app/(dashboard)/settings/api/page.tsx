"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { Copy, KeyRound } from "lucide-react";

type Key = { id: string; name: string; expiresAt: string; revokedAt: string | null };

export default function IntegrationsPage() {
  const { t, locale } = useI18n();
  const [keys, setKeys] = useState<Key[]>([]);
  const [name, setName] = useState("");
  const [days, setDays] = useState(30);
  const [token, setToken] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/integrations/keys");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setKeys(data.keys);
  }

  useEffect(() => { void Promise.resolve().then(load).catch(e => setNotice(e.message)); }, []);

  async function create() {
    if (!window.confirm(t("Create a read-only workspace key for {days} days? Anyone with this key can read your campaigns.", { days }))) return;
    setBusy(true); setToken(""); setNotice("");
    try {
      const response = await fetch("/api/integrations/keys", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, days, scopes: ["campaigns:read"] }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setToken(data.token);
      await load();
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }

  async function revoke(key: Key) {
    if (!window.confirm(t("Revoke this key? Connected clients will lose access immediately."))) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/integrations/keys?id=${encodeURIComponent(key.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json()).error);
      setToken("");
      await load();
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }

  const field = "mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/50 disabled:opacity-50";
  return <div className="mx-auto max-w-3xl space-y-6">
    <p className="text-sm text-muted">{t("Workspace-scoped, read-only keys. No key can modify campaigns or send messages. Only admins and owners can manage keys.")}</p>
    {notice && <p role="status" className="text-sm text-foreground">{notice}</p>}
    <section className="panel space-y-4 p-4 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <label className="block text-sm text-foreground">{t("Key name")}<input maxLength={100} disabled={busy} className={field} value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="block text-sm text-foreground">{t("Key lifetime")}<select disabled={busy} value={days} onChange={e => setDays(Number(e.target.value))} className={field}>
          {[30, 60, 90].map(value => <option key={value} value={value}>{t("{days} days", { days: value })}</option>)}
        </select></label>
      </div>
      <p className="text-xs text-muted">{t("Applies only to new keys. Existing expiration dates do not change.")}</p>
      <button disabled={busy || !name.trim()} onClick={create} className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"><KeyRound size={16} strokeWidth={1.75} aria-hidden="true" />{t("Create key for {days} days", { days })}</button>
      {token && <div role="status" className="space-y-2 border-t border-border pt-4">
        <p className="text-sm text-warning">{t("Shown once. Store securely; never put keys in URLs, screenshots or GitHub.")}</p>
        <input aria-label={t("New service key")} type="password" readOnly value={token} className={`${field} font-mono`} />
        <div className="flex gap-2">
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground" onClick={() => navigator.clipboard.writeText(token).catch(() => setNotice(t("Could not copy key. Use a secure HTTPS connection.")))}><Copy size={14} strokeWidth={1.75} aria-hidden="true" />{t("Copy")}</button>
          <button className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground" onClick={() => setToken("")}>{t("Hide key")}</button>
        </div>
      </div>}
    </section>
    {keys.length > 0 && <section className="panel divide-y divide-border px-4 sm:px-6">{keys.map(key => <div key={key.id} className="flex min-h-14 flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{key.name}</p>
        <p className="font-mono text-xs text-muted">campaigns:read · {t("Expires: {date}", { date: new Date(key.expiresAt).toLocaleDateString(locale) })}</p>
      </div>
      {key.revokedAt ? <span className="text-xs text-muted">{t("Revoked")}</span> : <button disabled={busy} onClick={() => revoke(key)} className="rounded-lg border border-error/20 px-3 py-1.5 text-xs font-medium text-error transition-colors hover:bg-error/10 disabled:opacity-50">{t("Revoke key")}</button>}
    </div>)}</section>}
    <section className="space-y-2 text-sm text-muted">
      <h2 className="text-sm font-semibold text-foreground">{t("Connection")}</h2>
      <p>MCP: <code className="font-mono text-foreground">/api/mcp</code> · REST: <code className="font-mono text-foreground">/api/v1/campaigns</code></p>
      <p>{t("Streamable HTTP with an Authorization: Bearer header. This server does not provide OAuth; use a client that supports custom headers.")}</p>
      <p>{t("Campaign lists are limited to 100. Use get_campaign for complete settings and destination links; clicks are raw requests, not unique recipients.")}</p>
    </section>
  </div>;
}
