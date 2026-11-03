/**
 * Per-account access granted by Pedro. Pure: no database, no network.
 *
 * Pedro is the source of truth for who may do what on which channel; OpenReply
 * keeps a short-lived copy (UserAccountGrant) and refuses access when that copy
 * is too old and Pedro cannot be reached (fail closed).
 */

export const CAPABILITIES = [
  "inbox.read",
  "inbox.reply",
  "comment.read",
  "comment.reply",
  "campaign.manage",
  "account.manage",
] as const;

export type Capability = (typeof CAPABILITIES)[number];
/** "any" = at least one capability on the account (read-only aggregate pages). */
export type CapabilityRequirement = Capability | "any";

/** Below this age the stored grants are used without asking Pedro. */
export const GRANTS_FRESH_MS = 5 * 60 * 1000;
/** Past this age, if Pedro cannot be reached, the user gets no account access. */
export const GRANTS_MAX_AGE_MS = 15 * 60 * 1000;

export interface PedroChannel {
  channelId: string;
  channelName?: string;
  orgId?: string;
  orgName?: string;
  /** The app-scoped Instagram id Pedro stores; matched to InstagramAccount.appScopedId. */
  instagramExternalId: string | null;
  instagramHandle?: string | null;
  capabilities: string[];
}

export interface PedroAccess {
  userId: string;
  email: string;
  name?: string | null;
  image?: string | null;
  platformAdmin?: boolean;
  channels: PedroChannel[];
}

export interface GrantRow {
  instagramAccountId: string;
  capabilities: Capability[];
}

const KNOWN = new Set<string>(CAPABILITIES);

/**
 * Turns Pedro's channel list into one grant per OpenReply account. Matching is
 * by app-scoped id only, never by handle (handles change hands). Unknown
 * capability names are dropped; two channels on the same account are merged.
 */
export function matchGrants(
  channels: PedroChannel[],
  accounts: { id: string; appScopedId: string | null }[]
): GrantRow[] {
  const byExternalId = new Map<string, string>();
  for (const account of accounts) {
    if (account.appScopedId) byExternalId.set(account.appScopedId, account.id);
  }

  const merged = new Map<string, Set<Capability>>();
  for (const channel of channels) {
    if (!channel.instagramExternalId) continue;
    const accountId = byExternalId.get(channel.instagramExternalId);
    if (!accountId) continue;
    const caps = merged.get(accountId) ?? new Set<Capability>();
    for (const c of channel.capabilities ?? []) if (KNOWN.has(c)) caps.add(c as Capability);
    merged.set(accountId, caps);
  }

  return [...merged]
    .filter(([, caps]) => caps.size > 0)
    .map(([instagramAccountId, caps]) => ({ instagramAccountId, capabilities: [...caps].sort() }));
}

export type Freshness = "fresh" | "stale" | "expired";

/** fresh: use as is. stale: refresh, keep on failure. expired: refresh, refuse on failure. */
export function grantFreshness(refreshedAt: Date | null, now = Date.now()): Freshness {
  if (!refreshedAt) return "expired";
  const age = now - refreshedAt.getTime();
  if (age < GRANTS_FRESH_MS) return "fresh";
  if (age < GRANTS_MAX_AGE_MS) return "stale";
  return "expired";
}

/** Ids of the accounts a set of grants allows for a requirement. */
export function allowedAccountIds(grants: GrantRow[], requirement: CapabilityRequirement): string[] {
  return grants
    .filter((g) =>
      requirement === "any" ? g.capabilities.length > 0 : g.capabilities.includes(requirement)
    )
    .map((g) => g.instagramAccountId);
}

/**
 * The Prisma value for an account-id condition. `scope` null = unrestricted
 * (flag off or workspace owner), which gives exactly the old behaviour:
 * the requested account if any, otherwise no condition.
 */
export function accountCondition(
  scope: string[] | null,
  requested?: string | null
): string | { in: string[] } | undefined {
  const specific = requested && requested !== "all" ? requested : null;
  if (scope === null) return specific ?? undefined;
  if (specific) return scope.includes(specific) ? specific : { in: [] };
  return { in: scope };
}

/** Runtime check of Pedro's response, which crosses a trust boundary. */
export function parsePedroAccess(value: unknown): PedroAccess | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.userId !== "string" || typeof v.email !== "string" || !Array.isArray(v.channels)) {
    return null;
  }
  const channels: PedroChannel[] = [];
  for (const raw of v.channels) {
    if (!raw || typeof raw !== "object") return null;
    const c = raw as Record<string, unknown>;
    if (typeof c.channelId !== "string" || !Array.isArray(c.capabilities)) return null;
    channels.push({
      channelId: c.channelId,
      channelName: typeof c.channelName === "string" ? c.channelName : undefined,
      orgId: typeof c.orgId === "string" ? c.orgId : undefined,
      orgName: typeof c.orgName === "string" ? c.orgName : undefined,
      instagramExternalId: typeof c.instagramExternalId === "string" ? c.instagramExternalId : null,
      instagramHandle: typeof c.instagramHandle === "string" ? c.instagramHandle : null,
      capabilities: c.capabilities.filter((x): x is string => typeof x === "string"),
    });
  }
  return {
    userId: v.userId,
    email: v.email,
    name: typeof v.name === "string" ? v.name : null,
    image: typeof v.image === "string" ? v.image : null,
    platformAdmin: v.platformAdmin === true,
    channels,
  };
}
