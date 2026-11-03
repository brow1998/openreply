import { parsePedroAccess, type PedroAccess } from "@/lib/access/grants";

/**
 * Sign-in through Pedro and per-account access are off until
 * PEDRO_OAUTH_CLIENT_ID is set: with it unset OpenReply behaves as before
 * (magic link, ALLOWED_EMAILS, every member sees every account).
 */
export function isPedroAuthEnabled(): boolean {
  return Boolean(process.env.PEDRO_OAUTH_CLIENT_ID);
}

export const PEDRO_PROVIDER_ID = "pedro";
export const PEDRO_SCOPE = "openreply";

export function pedroBaseUrl(): string {
  return (process.env.PEDRO_BASE_URL || "https://pedro.useshelfie.com").replace(/\/+$/, "");
}

export function pedroEndpoints() {
  const base = pedroBaseUrl();
  return {
    authorize: `${base}/api/mcp/oauth/autorizar`,
    token: `${base}/api/mcp/oauth/token`,
    access: `${base}/api/openreply/acesso`,
  };
}

/** Who the bearer is and what they may do, per channel. Null on any failure. */
export async function fetchPedroAccess(accessToken: string): Promise<PedroAccess | null> {
  try {
    const res = await fetch(pedroEndpoints().access, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    return parsePedroAccess(await res.json());
  } catch {
    return null;
  }
}

export interface PedroTokens {
  accessToken: string;
  refreshToken: string | null;
  /** Unix seconds, like Auth.js Account.expires_at. */
  expiresAt: number | null;
}

/** Exchanges a refresh token (public client: no secret, as the PKCE login). Null on failure. */
export async function refreshPedroTokens(refreshToken: string): Promise<PedroTokens | null> {
  try {
    const res = await fetch(pedroEndpoints().token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: process.env.PEDRO_OAUTH_CLIENT_ID ?? "",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, unknown>;
    if (typeof body.access_token !== "string") return null;
    const expiresIn = typeof body.expires_in === "number" ? body.expires_in : null;
    return {
      accessToken: body.access_token,
      // Pedro rotates refresh tokens: keep the new one, else the old stays valid.
      refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : refreshToken,
      expiresAt: expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : null,
    };
  } catch {
    return null;
  }
}
