import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import type { CapabilityRequirement } from "@/lib/access/grants";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";

/** Header with the Instagram app-scoped id Pedro stores for the channel. */
export const PEDRO_ACCOUNT_HEADER = "x-instagram-app-scoped-id";

export function isPedroService(request: NextRequest): boolean {
  const secret = process.env.PEDRO_SERVICE_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * The account a request acts on, from either caller:
 * - Pedro's server, with the shared secret and the account's app-scoped id.
 *   Pedro already checked the person's capability on that channel with its
 *   own `can()`, so the rule is not repeated here.
 * - A signed-in OpenReply user, through their workspace and grants.
 * Null when neither applies; the route answers 401/400 as before.
 */
export async function instagramAccountForRequest(
  request: NextRequest,
  instagramAccountId: string | null | undefined,
  capability: CapabilityRequirement
) {
  if (isPedroService(request)) {
    const appScopedId = request.headers.get(PEDRO_ACCOUNT_HEADER);
    if (!appScopedId) return null;
    return prisma.instagramAccount.findFirst({ where: { appScopedId } });
  }

  // Imported lazily so a service call never touches the session machinery.
  const { getCurrentWorkspaceId } = await import("@/lib/auth");
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) return null;
  return getWorkspaceInstagramAccount(workspaceId, instagramAccountId, capability);
}
