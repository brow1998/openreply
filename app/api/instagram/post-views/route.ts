import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import { createInstagramContext, getMediaInsights } from "@/lib/instagram/provider";

export interface PostViewsResponse {
  /** Views per post id; null when Instagram has no number for it. */
  views: Record<string, number | null>;
}

// View counts move slowly, and each one costs a Graph request: keep them for a while.
const TTL_MS = 10 * 60 * 1000;
const MAX_IDS = 30;
const CONCURRENCY = 4;
const cache = new Map<string, { at: number; views: number | null }>();

// Views for a batch of posts, for the numbers shown on the Comments grid.
export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const account = await getWorkspaceInstagramAccount(workspaceId, params.get("instagramAccountId"));
  if (!account) {
    return NextResponse.json(
      { success: false, error: "Instagram account not connected." },
      { status: 400 }
    );
  }

  const ids = [
    ...new Set(
      (params.get("ids") ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter((id) => /^\d+$/.test(id))
    ),
  ].slice(0, MAX_IDS);

  const context = await createInstagramContext(account);
  const views: Record<string, number | null> = {};
  const todo: string[] = [];
  const now = Date.now();
  for (const id of ids) {
    const hit = cache.get(`${account.id}:${id}`);
    if (hit && now - hit.at < TTL_MS) views[id] = hit.views;
    else todo.push(id);
  }

  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    await Promise.all(
      todo.slice(i, i + CONCURRENCY).map(async (id) => {
        let value: number | null = null;
        try {
          value = (await getMediaInsights({ context, mediaId: id, metrics: ["views"] })).views ?? null;
        } catch {
          // Old posts and some types have no insights; the grid just omits the number.
        }
        cache.set(`${account.id}:${id}`, { at: Date.now(), views: value });
        views[id] = value;
      })
    );
  }

  const data: PostViewsResponse = { views };
  return NextResponse.json({ success: true, data });
}
