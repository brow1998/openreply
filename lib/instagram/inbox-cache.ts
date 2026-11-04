import type { ConversationsResponse } from "@/app/api/instagram/conversations/route";
import type { ThreadMessage } from "@/app/api/instagram/conversations/[id]/route";
import { normalizeMessage } from "@/lib/instagram/normalize-message";
import {
  createInstagramContext,
  getConversationMessages,
  type ProviderAccount,
} from "@/lib/instagram/provider";

/**
 * Stale-while-revalidate cache for inbox reads (conversation list and threads).
 *
 * Opening a conversation used to wait on Meta every time (1.5–3.5 s measured
 * from Pedro). The inbox is polled every few seconds anyway, so a copy a few
 * seconds old is fine as long as it is refreshed behind the response and
 * dropped the moment we know it changed: a DM sent from here or a messaging
 * webhook for the account.
 *
 * - younger than `freshMs`: served as is;
 * - up to `maxAgeMs`: served as is, and `defer` refreshes it once in the background;
 * - older, or absent: loaded while the caller waits.
 *
 * shortcut: in-memory per server process, correct only while `web` runs a single replica (docker-compose.prod.yml); move to Redis if it ever scales out.
 */
export function createSwrCache<T>(
  {
    freshMs,
    maxAgeMs,
    maxEntries,
  }: { freshMs: number; maxAgeMs: number; maxEntries: number },
  now: () => number = Date.now,
) {
  const entries = new Map<
    string,
    { at: number; value: T; refreshing: boolean }
  >();
  // Bumped on every drop: a refresh that started before it must not write old data back.
  let generation = 0;

  function store(key: string, value: T) {
    entries.delete(key);
    entries.set(key, { at: now(), value, refreshing: false });
    // Map keeps insertion order, so the first key is the least recently stored.
    if (entries.size > maxEntries) entries.delete(entries.keys().next().value!);
  }

  async function load(key: string, loader: () => Promise<T>): Promise<T> {
    const started = generation;
    const value = await loader();
    if (started === generation) store(key, value);
    return value;
  }

  return {
    async read(
      key: string,
      loader: () => Promise<T>,
      defer: (task: () => Promise<void>) => void,
    ): Promise<T> {
      const entry = entries.get(key);
      const age = entry ? now() - entry.at : Infinity;
      if (!entry || age >= maxAgeMs) return load(key, loader);
      if (age >= freshMs && !entry.refreshing) {
        entry.refreshing = true;
        defer(async () => {
          try {
            await load(key, loader);
          } catch {
            // Meta hiccup: keep serving the old copy and try again on the next read.
            entry.refreshing = false;
          }
        });
      }
      return entry.value;
    },
    /** Loads into the cache unless a copy is already there. */
    async warm(key: string, loader: () => Promise<T>): Promise<void> {
      if (entries.has(key)) return;
      await load(key, loader).catch(() => {});
    },
    dropPrefix(prefix: string) {
      generation++;
      for (const key of [...entries.keys()])
        if (key.startsWith(prefix)) entries.delete(key);
    },
  };
}

const FRESH_MS = 5_000;
const MAX_AGE_MS = 10 * 60_000;

export const conversationListCache = createSwrCache<
  ConversationsResponse["conversations"]
>({ freshMs: FRESH_MS, maxAgeMs: MAX_AGE_MS, maxEntries: 200 });
export const threadCache = createSwrCache<ThreadMessage[]>({
  freshMs: FRESH_MS,
  maxAgeMs: MAX_AGE_MS,
  maxEntries: 2_000,
});

/** Keys start with the account's Instagram id, which is also what a Meta webhook entry carries. */
export const inboxKey = (instagramId: string, conversationId = "") =>
  `${instagramId}:${conversationId}`;

/** Something changed in this account's DMs: the next read goes to Meta. */
export function invalidateInbox(instagramId: string) {
  conversationListCache.dropPrefix(inboxKey(instagramId));
  threadCache.dropPrefix(inboxKey(instagramId));
}

type InboxAccount = ProviderAccount & { instagramId: string };

/** A conversation's latest messages from Meta, oldest first, as the thread route serves them. */
export async function loadThread(
  account: InboxAccount,
  conversationId: string,
): Promise<ThreadMessage[]> {
  const raw = await getConversationMessages({
    context: await createInstagramContext(account),
    conversationId,
  });
  // The API returns newest-first; reverse to read top-to-bottom.
  return raw
    .map((m) => ({
      id: m.id,
      text: m.message ?? "",
      fromMe: m.from?.id === account.instagramId,
      fromUsername: m.from?.username ?? null,
      createdTime: m.created_time ?? null,
      ...normalizeMessage(m),
    }))
    .reverse();
}

/**
 * Loads the threads at the top of the list ahead of the click, a few at a
 * time, skipping any already cached: the first open of a recent conversation
 * is then as quick as the second.
 */
export async function warmThreads(
  account: InboxAccount,
  conversationIds: string[],
) {
  for (let i = 0; i < conversationIds.length; i += 3) {
    await Promise.all(
      conversationIds
        .slice(i, i + 3)
        .map((id) =>
          threadCache.warm(inboxKey(account.instagramId, id), () =>
            loadThread(account, id),
          ),
        ),
    );
  }
}
