import { prisma } from "@/lib/db/client";
import { allowedAccountIds, type CapabilityRequirement } from "@/lib/access/grants";
import { isPedroAuthEnabled } from "@/lib/access/pedro";

/**
 * Which Instagram accounts of `workspaceId` the current user may use for a
 * requirement. Null means unrestricted: the flag is off (old behaviour) or the
 * user is the workspace OWNER (the break-glass account keeps full access).
 */
export async function accountScope(
  workspaceId: string,
  requirement: CapabilityRequirement
): Promise<string[] | null> {
  if (!isPedroAuthEnabled()) return null;

  // Imported lazily: with the flag off nothing here loads, so nothing changes.
  const { getCurrentUserId } = await import("@/lib/auth");
  const { currentGrants } = await import("@/lib/access/refresh");
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  if (member?.role === "OWNER") return null;

  return allowedAccountIds(await currentGrants(userId), requirement);
}

/**
 * Whether the user may do `capability` on at least one account of the
 * workspace (the gate for actions not yet tied to an account, like creating a
 * campaign or connecting one). With the flag off: owners and admins, as before.
 */
export async function canUseSomewhere(
  context: { workspaceId: string; role: "OWNER" | "ADMIN" | "MEMBER" },
  capability: CapabilityRequirement
): Promise<boolean> {
  if (!isPedroAuthEnabled()) return context.role === "OWNER" || context.role === "ADMIN";
  const scope = await accountScope(context.workspaceId, capability);
  return scope === null || scope.length > 0;
}
