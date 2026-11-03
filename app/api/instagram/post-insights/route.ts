import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import {
  createInstagramContext,
  getMediaInsights,
  PermissionError,
} from "@/lib/instagram/provider";

export interface PostInsightsResponse {
  views: number | null;
  reach: number | null;
  saved: number | null;
  shares: number | null;
  totalInteractions: number | null;
  /** Instagram would not give metrics for this post (too old, wrong scope or type). */
  unavailable: boolean;
}

// Metrics for one post, fetched when its panel opens. `views` only exists for video-like media.
export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const mediaId = params.get("mediaId");
  if (!mediaId) {
    return NextResponse.json({ success: false, error: "A post is required." }, { status: 400 });
  }

  const account = await getWorkspaceInstagramAccount(workspaceId, params.get("instagramAccountId"));
  if (!account) {
    return NextResponse.json(
      { success: false, error: "Instagram account not connected." },
      { status: 400 }
    );
  }

  const context = await createInstagramContext(account);
  // `views` now exists for feed posts too; older accounts reject it, so retry without.
  const attempts = [
    ["views", "reach", "saved", "shares", "total_interactions"],
    ["reach", "saved", "shares", "total_interactions"],
  ];

  // Metric validity varies by media type and account, so fall back to the
  // smaller set instead of failing the whole panel.
  for (const metrics of attempts) {
    try {
      const d = await getMediaInsights({ context, mediaId, metrics });
      const data: PostInsightsResponse = {
        views: d.views ?? null,
        reach: d.reach ?? null,
        saved: d.saved ?? null,
        shares: d.shares ?? null,
        totalInteractions: d.total_interactions ?? null,
        unavailable: false,
      };
      return NextResponse.json({ success: true, data });
    } catch (err) {
      if (err instanceof PermissionError) break;
    }
  }

  const data: PostInsightsResponse = {
    views: null,
    reach: null,
    saved: null,
    shares: null,
    totalInteractions: null,
    unavailable: true,
  };
  return NextResponse.json({ success: true, data });
}
