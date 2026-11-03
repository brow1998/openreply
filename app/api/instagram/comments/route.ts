import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import {
  createInstagramContext,
  getInboxPosts,
  CommentsInboxUnavailableError,
  MetaApiError,
} from "@/lib/instagram/provider";

export interface CommentReply {
  id: string;
  text: string;
  username: string | null;
  timestamp: string | null;
  fromMe: boolean;
}

export interface CommentThread {
  id: string;
  text: string;
  username: string | null;
  userId: string | null;
  timestamp: string | null;
  likeCount: number;
  fromMe: boolean;
  /** The account owner has replied in the thread. */
  answered: boolean;
  replies: CommentReply[];
}

export interface CommentPost {
  id: string;
  caption: string;
  permalink: string | null;
  thumbnailUrl: string | null;
  timestamp: string | null;
  /** "REEL", "VIDEO", "CAROUSEL_ALBUM" or "IMAGE": drives the corner icon on the grid. */
  mediaType: string;
  likeCount: number;
  commentsCount: number;
  comments: CommentThread[];
}

export interface CommentsResponse {
  posts: CommentPost[];
}

// The newest posts with their newest comments, for the Comments inbox.
export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
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

  try {
    const context = await createInstagramContext(account);
    const raw = await getInboxPosts({ context });

    const posts: CommentPost[] = raw.map((p) => ({
      id: p.id,
      caption: p.caption ?? "",
      permalink: p.permalink ?? null,
      thumbnailUrl: p.thumbnail_url ?? p.media_url ?? null,
      timestamp: p.timestamp ?? null,
      mediaType: p.media_product_type === "REELS" ? "REEL" : (p.media_type ?? "IMAGE"),
      likeCount: p.like_count ?? 0,
      commentsCount: p.comments_count ?? 0,
      comments: (p.comments?.data ?? []).map((c) => {
        const replies = (c.replies?.data ?? []).map((r) => ({
          id: r.id,
          text: r.text ?? "",
          username: r.username ?? r.from?.username ?? null,
          timestamp: r.timestamp ?? null,
          fromMe: r.from?.id === account.instagramId,
        }));
        return {
          id: c.id,
          text: c.text ?? "",
          username: c.username ?? c.from?.username ?? null,
          userId: c.from?.id ?? null,
          timestamp: c.timestamp ?? null,
          likeCount: c.like_count ?? 0,
          fromMe: c.from?.id === account.instagramId,
          answered: replies.some((r) => r.fromMe),
          replies,
        };
      }),
    }));

    const data: CommentsResponse = { posts };
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[Comments] Error:", err);
    if (err instanceof CommentsInboxUnavailableError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 400 }
      );
    }
    const message =
      err instanceof MetaApiError ? err.message : "Failed to load comments";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
