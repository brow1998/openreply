import { createLookupCache } from "@/lib/meta/client";

export interface InstagramOEmbed {
  authorName: string | null;
  title: string | null;
  thumbnailUrl: string | null;
}

// Meta oEmbed Read, used to draw a forwarded post or reel in the Inbox. It needs
// an app access token and, for live apps, the feature approved in App Review;
// until then Meta answers with error #10 and the caller falls back to the
// public embed. See docs/meta-review/oembed-submission.md.
const POST_PATH = /^\/(?:[^/]+\/)?(?:reel|reels|p|tv)\/[\w-]+\/?$/;

export function isInstagramPostUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && /^(www\.)?instagram\.com$/.test(u.hostname) && POST_PATH.test(u.pathname);
  } catch {
    return false;
  }
}

// A found post is stable for hours; a refusal (not approved yet, private post) is retried sooner.
const cache = createLookupCache<InstagramOEmbed>(6 * 60 * 60 * 1000, 30 * 60 * 1000);

export async function getInstagramOEmbed(url: string): Promise<InstagramOEmbed | null> {
  if (!isInstagramPostUrl(url)) return null;
  const appId = process.env.FACEBOOK_APP_ID;
  const secret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !secret) return null;

  const cached = cache.get(url);
  if (cached) return cached.value;

  let result: InstagramOEmbed | null = null;
  try {
    const query = new URLSearchParams({
      url,
      access_token: `${appId}|${secret}`,
      fields: "thumbnail_url,author_name,title",
    });
    const res = await fetch(
      `https://graph.facebook.com/${process.env.META_GRAPH_API_VERSION ?? "v25.0"}/instagram_oembed?${query}`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (res.ok) {
      const data = await res.json();
      result = {
        authorName: typeof data.author_name === "string" ? data.author_name : null,
        title: typeof data.title === "string" ? data.title : null,
        thumbnailUrl: typeof data.thumbnail_url === "string" ? data.thumbnail_url : null,
      };
    }
  } catch {
    // Timeout or network: treated as a miss, the public embed covers it.
  }
  cache.set(url, result);
  return result;
}
