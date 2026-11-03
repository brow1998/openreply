import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import {
  createInstagramContext,
  sendCommentReply,
  sendPrivateReply,
  sendGif,
  GifUnavailableError,
  MetaApiError,
} from "@/lib/instagram/provider";

// Answers a comment, either publicly under it or as a private DM.
export async function POST(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  let body: {
    instagramAccountId?: string;
    commentId?: string;
    text?: string;
    gifUrl?: string;
    mode?: "public" | "private";
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }

  const text = body.text?.trim();
  const gifUrl = body.gifUrl?.trim();
  if (!body.commentId || (!text && !gifUrl) || (body.mode !== "public" && body.mode !== "private")) {
    return NextResponse.json(
      { success: false, error: "A comment, a message and a reply type are required." },
      { status: 400 }
    );
  }
  // Instagram comments are text only; media can only go as a private reply.
  if (gifUrl && body.mode !== "private") {
    return NextResponse.json(
      { success: false, error: "GIFs can only be sent as a DM, not as a public reply." },
      { status: 400 }
    );
  }

  const account = await getWorkspaceInstagramAccount(
    workspaceId,
    body.instagramAccountId ?? null
  );
  if (!account) {
    return NextResponse.json(
      { success: false, error: "Instagram account not connected." },
      { status: 400 }
    );
  }

  try {
    const context = await createInstagramContext(account);
    const result = gifUrl
      ? await sendGif({
          context,
          instagramAccountId: account.instagramId,
          commentId: body.commentId,
          url: gifUrl,
        })
      : body.mode === "public"
        ? await sendCommentReply({
            context,
            commentId: body.commentId,
            message: text!,
          })
        : await sendPrivateReply({
            context,
            instagramAccountId: account.instagramId,
            commentId: body.commentId,
            message: text!,
          });
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error("[Comments] Reply error:", err);
    if (err instanceof GifUnavailableError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    // Meta's own message matters here: a private reply is only allowed once per
    // comment and within 7 days of it.
    const message =
      err instanceof MetaApiError ? err.message : "Failed to send reply";
    return NextResponse.json(
      { success: false, error: message },
      { status: 502 }
    );
  }
}
