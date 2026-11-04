import { NextRequest, NextResponse } from "next/server";
import { instagramAccountForRequest } from "@/lib/access/service";
import { createInstagramContext } from "@/lib/instagram/provider";
import { prisma } from "@/lib/db/client";
import { createLookupCache, type InstagramProfile } from "@/lib/meta/client";
import { captureContactProfile } from "@/lib/profiles/contact-profile";

export interface ProfilesResponse {
  profiles: Record<string, InstagramProfile>;
}

// Stored copies (ContactProfile, filled when a message arrives) are read first.
// For anyone not stored yet we ask Instagram, which only answers for a few hours
// after the person wrote; a refusal is remembered for a few minutes so the same
// person is not re-requested on every poll.
const misses = createLookupCache<true>(1, 10 * 60 * 1000);
const MAX_IDS = 40;
// Instagram-scoped ids are numeric; anything else would be spliced into a Graph path.
const IGSID = /^\d{1,32}$/;

// Profile photos and names for people in the inbox and the comments.
export async function GET(request: NextRequest) {
  const account = await instagramAccountForRequest(request, request.nextUrl.searchParams.get("instagramAccountId"), "any");
  if (!account) {
    return NextResponse.json(
      { success: false, error: "Instagram account not connected." },
      { status: 400 }
    );
  }

  const ids = [
    ...new Set(
      (request.nextUrl.searchParams.get("ids") ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter((id) => IGSID.test(id))
    ),
  ].slice(0, MAX_IDS);

  const profiles: Record<string, InstagramProfile> = {};
  const done = () =>
    NextResponse.json({ success: true, data: { profiles } satisfies ProfilesResponse });

  let accessToken: string;
  try {
    const context = await createInstagramContext(account);
    // Photos need the direct Meta connection; Zernio threads just get initials.
    if (context.provider !== "META") return done();
    accessToken = context.accessToken;
  } catch {
    return done();
  }

  const stored = await prisma.contactProfile.findMany({
    where: { instagramAccountId: account.id, igsid: { in: ids } },
    select: { igsid: true, name: true, username: true, photo: true },
  });
  const have = new Set<string>();
  for (const row of stored) {
    profiles[row.igsid] = { name: row.name, username: row.username, profilePic: row.photo };
    if (row.photo) have.add(row.igsid);
  }

  const todo = ids.filter((id) => !have.has(id) && !misses.get(`${account.id}:${id}`));

  // Five at a time: polite to Meta, and a full inbox still loads in a few seconds.
  for (let i = 0; i < todo.length; i += 5) {
    await Promise.all(
      todo.slice(i, i + 5).map(async (id) => {
        const contact = await captureContactProfile({ accountId: account.id, igsid: id, accessToken });
        if (contact?.photo || contact?.name) {
          profiles[id] = { name: contact.name, username: contact.username, profilePic: contact.photo };
        } else {
          misses.set(`${account.id}:${id}`, null);
        }
      })
    );
  }

  return done();
}
