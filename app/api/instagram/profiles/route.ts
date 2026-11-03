import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import { createInstagramContext } from "@/lib/instagram/provider";
import {
  createLookupCache,
  getUserProfile,
  type InstagramProfile,
} from "@/lib/meta/client";

export interface ProfilesResponse {
  profiles: Record<string, InstagramProfile>;
}

// Photo links expire after a while, so keep them for hours, not days. A miss is
// remembered for a few minutes so a person without a photo (or a commenter
// Instagram will not describe) is not re-requested on every poll.
const cache = createLookupCache<InstagramProfile>(6 * 60 * 60 * 1000, 10 * 60 * 1000);
const MAX_IDS = 40;
// Instagram-scoped ids are numeric; anything else would be spliced into a Graph path.
const IGSID = /^\d{1,32}$/;

// Profile photos and names for people in the inbox and the comments.
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
        .filter((id) => IGSID.test(id))
    ),
  ].slice(0, MAX_IDS);

  const profiles: Record<string, InstagramProfile> = {};
  const done = () =>
    NextResponse.json({ success: true, data: { profiles } satisfies ProfilesResponse });

  let accessToken: string;
  try {
    const context = await createInstagramContext(account);
    // Photos need the direct Meta connection; Zernio threads just get initials.
    if (context.provider !== "META") return done();
    accessToken = context.accessToken;
  } catch {
    return done();
  }

  const todo: string[] = [];
  for (const id of ids) {
    const hit = cache.get(`${account.id}:${id}`);
    if (!hit) todo.push(id);
    else if (hit.value) profiles[id] = hit.value;
  }

  // Five at a time: polite to Meta, and a full inbox still loads in a few seconds.
  for (let i = 0; i < todo.length; i += 5) {
    await Promise.all(
      todo.slice(i, i + 5).map(async (id) => {
        const profile = await getUserProfile(accessToken, id);
        cache.set(`${account.id}:${id}`, profile);
        if (profile) profiles[id] = profile;
      })
    );
  }

  return done();
}
