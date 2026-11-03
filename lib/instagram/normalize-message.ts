import type { InstagramMessage } from "@/lib/meta/client";

export type MessageAttachment = {
  kind: "image" | "video" | "audio" | "file";
  /** Direct media URL; Instagram's CDN links expire, so treat as best effort. */
  url: string | null;
  previewUrl: string | null;
  name: string | null;
};

export type MessageShare = {
  link: string | null;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
};

export type MessageStory = { kind: "mention" | "reply"; link: string | null };

export interface RichMessage {
  attachments: MessageAttachment[];
  shares: MessageShare[];
  story: MessageStory | null;
  unsupported: boolean;
}

function attachmentKind(mime: string | undefined, hasVideo: boolean): MessageAttachment["kind"] {
  if (hasVideo || mime?.startsWith("video/")) return "video";
  if (mime?.startsWith("image/")) return "image";
  if (mime?.startsWith("audio/")) return "audio";
  return "file";
}

/** Reduces Meta's message shape to what the Inbox renders. */
export function normalizeMessage(m: InstagramMessage): RichMessage {
  const attachments = (m.attachments?.data ?? []).map((a) => {
    const media = a.video_data ?? a.image_data;
    return {
      kind: attachmentKind(a.mime_type, Boolean(a.video_data)),
      url: a.file_url ?? media?.url ?? null,
      previewUrl: media?.preview_url ?? a.image_data?.url ?? null,
      name: a.name ?? null,
    };
  });

  const shares = (m.shares?.data ?? []).map((s) => ({
    link: s.link ?? null,
    title: s.name ?? null,
    description: s.description ?? null,
    imageUrl: s.image_url ?? null,
  }));

  const storyLink = m.story?.mention?.link ?? m.story?.reply_to?.link ?? m.reply_to?.story?.link;
  const story: MessageStory | null = m.story?.mention
    ? { kind: "mention", link: m.story.mention.link ?? null }
    : storyLink !== undefined || m.story?.reply_to || m.reply_to?.story
      ? { kind: "reply", link: storyLink ?? null }
      : null;

  return { attachments, shares, story, unsupported: Boolean(m.is_unsupported) };
}
