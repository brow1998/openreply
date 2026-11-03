import { prisma } from "@/lib/db/client";
import {
  grantFreshness,
  matchGrants,
  type GrantRow,
  type PedroAccess,
} from "@/lib/access/grants";
import {
  fetchPedroAccess,
  PEDRO_PROVIDER_ID,
  refreshPedroTokens,
  type PedroTokens,
} from "@/lib/access/pedro";

/**
 * Rewrites a user's grants from Pedro's answer, and makes them a MEMBER of the
 * workspaces that own the granted accounts (never lowering an existing role),
 * so the dashboard resolves to the workspace their channels live in.
 */
export async function storeGrants(userId: string, access: PedroAccess): Promise<GrantRow[]> {
  const ids = access.channels
    .map((c) => c.instagramExternalId)
    .filter((id): id is string => Boolean(id));
  const accounts = ids.length
    ? await prisma.instagramAccount.findMany({
        where: { appScopedId: { in: ids } },
        select: { id: true, appScopedId: true, workspaceId: true },
      })
    : [];
  const grants = matchGrants(access.channels, accounts);
  const workspaceIds = [
    ...new Set(
      accounts.filter((a) => grants.some((g) => g.instagramAccountId === a.id)).map((a) => a.workspaceId)
    ),
  ];

  await prisma.$transaction([
    prisma.userAccountGrant.deleteMany({ where: { userId } }),
    prisma.userAccountGrant.createMany({
      data: grants.map((g) => ({ userId, instagramAccountId: g.instagramAccountId, capabilities: g.capabilities })),
    }),
    ...workspaceIds.map((workspaceId) =>
      prisma.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId, userId } },
        create: { workspaceId, userId, role: "MEMBER" },
        update: {},
      })
    ),
    prisma.user.update({ where: { id: userId }, data: { accessRefreshedAt: new Date() } }),
  ]);
  return grants;
}

/** Saves the tokens Pedro just issued; Auth.js does not update them on a repeat sign-in. */
async function saveTokens(userId: string, tokens: PedroTokens) {
  await prisma.account.updateMany({
    where: { userId, provider: PEDRO_PROVIDER_ID },
    data: {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: tokens.expiresAt,
    },
  });
}

/** Asks Pedro again with the stored (refreshed if needed) token. False when Pedro could not answer. */
export async function refreshUserGrants(userId: string, fresh?: PedroTokens): Promise<boolean> {
  let tokens: PedroTokens | null = fresh ?? null;
  if (tokens) {
    await saveTokens(userId, tokens);
  } else {
    const account = await prisma.account.findFirst({
      where: { userId, provider: PEDRO_PROVIDER_ID },
      select: { access_token: true, refresh_token: true, expires_at: true },
    });
    if (!account?.access_token) return false;
    tokens = { accessToken: account.access_token, refreshToken: account.refresh_token, expiresAt: account.expires_at };
    // Renew a minute early so the access call does not race the expiry.
    if (tokens.expiresAt && tokens.expiresAt * 1000 < Date.now() + 60_000) {
      if (!tokens.refreshToken) return false;
      const renewed = await refreshPedroTokens(tokens.refreshToken);
      if (!renewed) return false;
      tokens = renewed;
      await saveTokens(userId, tokens);
    }
  }

  const access = await fetchPedroAccess(tokens.accessToken);
  if (!access) return false;
  await storeGrants(userId, access);
  return true;
}

// One refresh per user at a time: Pedro rotates refresh tokens, so two parallel
// refreshes would invalidate each other. shortcut: per process, fine for one web container.
const inFlight = new Map<string, Promise<boolean>>();

/**
 * The user's grants, refreshed from Pedro at most every few minutes. Fails
 * closed: an expired copy that Pedro cannot renew yields no grants at all.
 */
export async function currentGrants(userId: string): Promise<GrantRow[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { accessRefreshedAt: true },
  });
  const freshness = grantFreshness(user?.accessRefreshedAt ?? null);

  if (freshness !== "fresh") {
    let pending = inFlight.get(userId);
    if (!pending) {
      pending = refreshUserGrants(userId).catch(() => false).finally(() => inFlight.delete(userId));
      inFlight.set(userId, pending);
    }
    const ok = await pending;
    if (!ok && freshness === "expired") return [];
  }

  const rows = await prisma.userAccountGrant.findMany({
    where: { userId },
    select: { instagramAccountId: true, capabilities: true },
  });
  return rows as GrantRow[];
}
