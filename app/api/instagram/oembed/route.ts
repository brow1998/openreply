import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { isPedroService } from "@/lib/access/service";
import { getInstagramOEmbed, isInstagramPostUrl } from "@/lib/meta/oembed";

// Author, caption and cover of a forwarded Instagram post, through Meta oEmbed.
// `data` is null while the feature is not approved or the post is not public.
export async function GET(request: NextRequest) {
  // Pedro's server may ask too: neither touches an account, only who is asking.
  const allowed = isPedroService(request) || Boolean(await getCurrentWorkspaceId());
  if (!allowed) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const url = request.nextUrl.searchParams.get("url") ?? "";
  if (!isInstagramPostUrl(url)) {
    return NextResponse.json({ success: false, error: "Not an Instagram post link." }, { status: 400 });
  }
  return NextResponse.json({ success: true, data: await getInstagramOEmbed(url) });
}
