import { prisma } from "@/lib/db/client";
import { accountCondition, type CapabilityRequirement } from "@/lib/access/grants";
import { accountScope } from "@/lib/access/scope";

export async function canConnectInstagramAccount({
  workspaceId,
  instagramId,
}: {
  workspaceId: string;
  instagramId: string;
}) {
  const existingAccount = await prisma.instagramAccount.findUnique({
    where: { instagramId },
    select: { workspaceId: true, provider: true },
  });

  if (existingAccount && (existingAccount.workspaceId !== workspaceId || existingAccount.provider === "ZERNIO")) {
    return {
      allowed: false,
      reason: "already_connected" as const,
    };
  }

  return {
    allowed: true,
    reason: null,
  };
}

/**
 * The account a request acts on: the requested one, else the latest connected.
 * With Pedro sign-in on, only accounts the user holds `capability` on are found.
 */
export async function getWorkspaceInstagramAccount(
  workspaceId: string,
  instagramAccountId: string | null | undefined,
  capability: CapabilityRequirement
) {
  const id = accountCondition(await accountScope(workspaceId, capability), instagramAccountId);
  return prisma.instagramAccount.findFirst({
    where: { workspaceId, ...(id !== undefined ? { id } : {}) },
    orderBy: { connectedAt: "desc" },
  });
}
