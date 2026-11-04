import { after, NextRequest, NextResponse } from "next/server";
import { instagramAccountForRequest } from "@/lib/access/service";
import { MetaApiError } from "@/lib/instagram/provider";
import { inboxKey, loadThread, threadCache } from "@/lib/instagram/inbox-cache";
import type { RichMessage } from "@/lib/instagram/normalize-message";

export interface ThreadMessage extends RichMessage {
  id: string;
  text: string;
  fromMe: boolean;
  fromUsername: string | null;
  createdTime: string | null;
}

export interface ThreadResponse {
  messages: ThreadMessage[];
}

type RouteProps = { params: Promise<{ id: string }> };

// Message history for a single conversation (20 most recent, chronological).
// Served from the inbox cache when it has a copy; see lib/instagram/inbox-cache.ts.
export async function GET(request: NextRequest, { params }: RouteProps) {
  const { id: conversationId } = await params;

  const account = await instagramAccountForRequest(
    request,
    request.nextUrl.searchParams.get("instagramAccountId"),
    "inbox.read",
  );
  if (!account) {
    return NextResponse.json(
      { success: false, error: "Instagram account not connected." },
      { status: 400 },
    );
  }

  try {
    const messages = await threadCache.read(
      inboxKey(account.instagramId, conversationId),
      () => loadThread(account, conversationId),
      after,
    );

    const data: ThreadResponse = { messages };
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[Conversation Messages] Error:", err);
    const message =
      err instanceof MetaApiError ? err.message : "Failed to load messages";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
