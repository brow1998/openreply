import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import { createInstagramContext } from "@/lib/instagram/provider";
import { getUserProfile, type InstagramProfile } from "@/lib/meta/client";

export interface ProfilesResponse {
  profiles: Record<string, InstagramProfile>;
}

// Photo links expire after a while, so keep them for hours, not days. A miss is
// remembered for a few minutes so a person without a photo is not re-requested
// on every poll.
const HIT_TTL_MS = 6 * 60 * 60 * 1000;
const MISS_TTL_MS = 10 * 60 * 1000;
const MAX_IDS = 40;
const cache = new Map<string, { at: number; profile: InstagramProfile | null }>();

// Profile photos and names for the people in the inbox.
export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const account = await getWorkspaceInstagramAccount(
    workspaceId,
    request.nextUrl.searchParams.get("instagramAccountId")
  );
  if (!account) {
    return NextResponse.json(
      { success: false, error: "Instagram account not connected." },
      { status: 400 }
    );
  }

  const ids = [
    ...new Set(
      (request.nextUrl.searchParams.get("ids") ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    ),
  ].slice(0, MAX_IDS);

  const context = await createInstagramContext(account);
  const profiles: Record<string, InstagramProfile> = {};
  // Photos need the direct Meta connection; Zernio threads just get initials.
  if (context.provider !== "META") {
    return NextResponse.json({ success: true, data: { profiles } satisfies ProfilesResponse });
  }

  const now = Date.now();
  const todo: string[] = [];
  for (const id of ids) {
    const hit = cache.get(`${account.id}:${id}`);
    if (hit && now - hit.at < (hit.profile ? HIT_TTL_MS : MISS_TTL_MS)) {
      if (hit.profile) profiles[id] = hit.profile;
    } else {
      todo.push(id);
    }
  }

  // Five at a time: polite to Meta, and a full inbox still loads in a few seconds.
  for (let i = 0; i < todo.length; i += 5) {
    await Promise.all(
      todo.slice(i, i + 5).map(async (id) => {
        const profile = await getUserProfile(context.accessToken, id);
        cache.set(`${account.id}:${id}`, { at: Date.now(), profile });
        if (profile) profiles[id] = profile;
      })
    );
  }

  return NextResponse.json({ success: true, data: { profiles } satisfies ProfilesResponse });
}
