import { NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { createInstagramContext } from "@/lib/instagram/provider";
import { createLookupCache, getProfilePictureUrl } from "@/lib/meta/client";

export const runtime = "nodejs";

// Photo links expire, so hours not days; a failed lookup is retried after a few minutes.
const photos = createLookupCache<string>(6 * 60 * 60 * 1000, 10 * 60 * 1000);

/**
 * The workspace's connected Instagram accounts — just enough for an account
 * selector. This is a single indexed query, unlike /api/dashboard/stats which
 * runs the full analytics aggregation. Pages that only need the account list
 * (e.g. the inbox) should use this so they aren't gated on heavy stats.
 * Each account carries its profile photo (cached; null when Instagram has none
 * or the lookup fails, which never fails the list).
 */
export async function GET() {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const rows = await prisma.instagramAccount.findMany({
    where: { workspaceId },
    orderBy: { connectedAt: "desc" },
  });

  const instagramAccounts = await Promise.all(
    rows.map(async (account) => {
      let profilePictureUrl: string | null = null;
      if (account.provider !== "ZERNIO") {
        const hit = photos.get(account.id);
        if (hit) {
          profilePictureUrl = hit.value;
        } else {
          try {
            const context = await createInstagramContext(account);
            if (context.provider === "META")
              profilePictureUrl = await getProfilePictureUrl(context.accessToken);
          } catch {
            profilePictureUrl = null;
          }
          photos.set(account.id, profilePictureUrl);
        }
      }
      // Never the token: only what the selector shows.
      return {
        id: account.id,
        username: account.username,
        instagramId: account.instagramId,
        name: account.name,
        profilePictureUrl,
      };
    })
  );

  return NextResponse.json({
    success: true,
    data: {
      instagramAccounts,
      selectedInstagramAccountId: instagramAccounts[0]?.id ?? null,
    },
  });
}
