import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { isPedroService } from "@/lib/access/service";

export interface GifResult {
  id: string;
  title: string;
  /** Small animated preview for the picker grid. */
  previewUrl: string;
  /** The GIF Instagram will fetch and send; kept well under its 8 MB limit. */
  url: string;
}

// GIF search through Giphy. Needs GIPHY_API_KEY (free at developers.giphy.com);
// without it the picker falls back to pasting a link.
export async function GET(request: NextRequest) {
  // Pedro's server may ask too: neither touches an account, only who is asking.
  const allowed = isPedroService(request) || Boolean(await getCurrentWorkspaceId());
  if (!allowed) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const key = process.env.GIPHY_API_KEY;
  if (!key) {
    return NextResponse.json({ success: true, data: { configured: false, results: [] } });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const endpoint = q ? "search" : "trending";
  const params = new URLSearchParams({ api_key: key, limit: "24", rating: "pg-13" });
  if (q) params.set("q", q);

  try {
    const res = await fetch(`https://api.giphy.com/v1/gifs/${endpoint}?${params}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`Giphy ${res.status}`);
    const body = (await res.json()) as {
      data?: {
        id: string;
        title?: string;
        images?: Record<string, { url?: string } | undefined>;
      }[];
    };
    const results: GifResult[] = (body.data ?? []).flatMap((g) => {
      const url = g.images?.downsized_medium?.url ?? g.images?.original?.url;
      const previewUrl = g.images?.fixed_height_small?.url ?? url;
      return url && previewUrl ? [{ id: g.id, title: g.title ?? "", previewUrl, url }] : [];
    });
    return NextResponse.json({ success: true, data: { configured: true, results } });
  } catch (err) {
    console.error("[GIFs] Search error:", err);
    return NextResponse.json({ success: false, error: "Failed to search GIFs" }, { status: 502 });
  }
}
