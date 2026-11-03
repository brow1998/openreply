import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import {
  createInstagramContext,
  sendCommentReply,
  sendPrivateReply,
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
  if (!body.commentId || !text || (body.mode !== "public" && body.mode !== "private")) {
    return NextResponse.json(
      { success: false, error: "A comment, a message and a reply type are required." },
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
    const result =
      body.mode === "public"
        ? await sendCommentReply({
            context,
            commentId: body.commentId,
            message: text,
          })
        : await sendPrivateReply({
            context,
            instagramAccountId: account.instagramId,
            commentId: body.commentId,
            message: text,
          });
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error("[Comments] Reply error:", err);
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
