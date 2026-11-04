import { after, NextRequest, NextResponse } from "next/server";
import { instagramAccountForRequest } from "@/lib/access/service";
import {
  getConversations,
  sendDirectMessage,
  sendGif,
  GifUnavailableError,
  MetaApiError,
} from "@/lib/instagram/provider";
import { createInstagramContext } from "@/lib/instagram/provider";
import {
  conversationListCache,
  inboxKey,
  invalidateInbox,
  warmThreads,
} from "@/lib/instagram/inbox-cache";

export interface ConversationListItem {
  id: string;
  detailsUnavailable?: boolean;
  contact: { id: string; username: string | null };
  updatedTime: string | null;
  lastMessage: {
    text: string;
    fromMe: boolean;
    createdTime: string | null;
  } | null;
}

export interface ConversationsResponse {
  conversations: ConversationListItem[];
  account: { id: string; username: string; instagramId: string };
}

// List the account's DM conversations for the inbox.
export async function GET(request: NextRequest) {
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
    const conversations = await conversationListCache.read(
      inboxKey(account.instagramId),
      async () => {
        const accessToken = await createInstagramContext(account);
        const raw = await getConversations({
          context: accessToken,
          igUserId: account.instagramId,
        });

        return raw.map((c): ConversationListItem => {
          const participants = c.participants?.data ?? [];
          const contact =
            participants.find((p) => p.id !== account.instagramId) ?? null;
          const last = c.messages?.data?.[0] ?? null;

          return {
            id: c.id,
            detailsUnavailable: c.detailsUnavailable,
            contact: {
              id: contact?.id ?? "",
              username: contact?.username ?? null,
            },
            updatedTime: c.updated_time ?? null,
            lastMessage: last
              ? {
                  text: last.message ?? "",
                  fromMe: last.from?.id === account.instagramId,
                  createdTime: last.created_time ?? null,
                }
              : null,
          };
        });
      },
      after,
    );

    // The conversations people open next are the recent ones: have them ready.
    const recent = conversations
      .filter((c) => !c.detailsUnavailable)
      .slice(0, 8)
      .map((c) => c.id);
    after(() => warmThreads(account, recent));

    const data: ConversationsResponse = {
      conversations,
      account: {
        id: account.id,
        username: account.username,
        instagramId: account.instagramId,
      },
    };
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[Conversations] Error:", err);
    const message =
      err instanceof MetaApiError
        ? err.message
        : "Failed to load conversations";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

// Send a direct message reply.
export async function POST(request: NextRequest) {
  let body: {
    instagramAccountId?: string;
    recipientId?: string;
    text?: string;
    gifUrl?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 },
    );
  }

  const text = body.text?.trim();
  const gifUrl = body.gifUrl?.trim();
  if (!body.recipientId || (!text && !gifUrl)) {
    return NextResponse.json(
      { success: false, error: "A recipient and message are required." },
      { status: 400 },
    );
  }

  const account = await instagramAccountForRequest(
    request,
    body.instagramAccountId ?? null,
    "inbox.reply",
  );
  if (!account) {
    return NextResponse.json(
      { success: false, error: "Instagram account not connected." },
      { status: 400 },
    );
  }

  try {
    const accessToken = await createInstagramContext(account);
    const result = gifUrl
      ? await sendGif({
          context: accessToken,
          instagramAccountId: account.instagramId,
          userId: body.recipientId,
          url: gifUrl,
        })
      : await sendDirectMessage({
          context: accessToken,
          instagramAccountId: account.instagramId,
          userId: body.recipientId,
          message: text!,
        });
    // The sent message must show on the next read, not after the cache ages out.
    invalidateInbox(account.instagramId);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error("[Conversations] Send error:", err);
    if (err instanceof GifUnavailableError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 400 },
      );
    }
    // Surface Meta's own message — the common case is the 24-hour messaging
    // window having closed, which the user needs to see explicitly.
    const message =
      err instanceof MetaApiError ? err.message : "Failed to send message";
    return NextResponse.json(
      { success: false, error: message },
      { status: 502 },
    );
  }
}
