import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { getInstagramOEmbed, isInstagramPostUrl } from "@/lib/meta/oembed";

// Author, caption and cover of a forwarded Instagram post, through Meta oEmbed.
// `data` is null while the feature is not approved or the post is not public.
export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const url = request.nextUrl.searchParams.get("url") ?? "";
  if (!isInstagramPostUrl(url)) {
    return NextResponse.json({ success: false, error: "Not an Instagram post link." }, { status: 400 });
  }
  return NextResponse.json({ success: true, data: await getInstagramOEmbed(url) });
}
