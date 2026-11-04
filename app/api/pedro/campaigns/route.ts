import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { instagramAccountForRequest, isPedroService } from "@/lib/access/service";

export interface PedroCampaign {
  id: string;
  name: string;
  isActive: boolean;
  keywords: string[];
  matchAnyWord: boolean;
  matchAnyPost: boolean;
  postUrl: string | null;
  dmTriggerEnabled: boolean;
  createdAt: string;
  sent: number;
  failed: number;
  clicks: number;
}

// Campaigns of one account, for Pedro's channel screen. Service calls only:
// signed-in users have /api/automations, which this does not replace.
async function accountFor(request: NextRequest) {
  if (!isPedroService(request)) return null;
  return instagramAccountForRequest(request, null, "campaign.manage");
}

export async function GET(request: NextRequest) {
  const account = await accountFor(request);
  if (!account) {
    return NextResponse.json({ success: false, error: "Instagram account not connected." }, { status: 400 });
  }

  const automations = await prisma.automation.findMany({
    where: { instagramAccountId: account.id },
    select: {
      id: true,
      name: true,
      isActive: true,
      keywords: true,
      matchAnyWord: true,
      matchAnyPost: true,
      postUrl: true,
      dmTriggerEnabled: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  const ids = automations.map((a) => a.id);
  const [logs, clicks] = await Promise.all([
    prisma.dmLog.groupBy({
      by: ["automationId", "status"],
      where: { automationId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.linkClick.groupBy({
      by: ["automationId"],
      where: { automationId: { in: ids } },
      _count: { _all: true },
    }),
  ]);

  const campaigns: PedroCampaign[] = automations.map((a) => {
    const mine = logs.filter((l) => l.automationId === a.id);
    return {
      ...a,
      createdAt: a.createdAt.toISOString(),
      sent: mine.filter((l) => l.status === "SENT").reduce((n, l) => n + l._count._all, 0),
      failed: mine.filter((l) => l.status === "FAILED").reduce((n, l) => n + l._count._all, 0),
      clicks: clicks.find((c) => c.automationId === a.id)?._count._all ?? 0,
    };
  });
  return NextResponse.json({ success: true, data: { campaigns } });
}

// Turns a campaign on or off. The only write Pedro does here; editing stays in OpenReply.
export async function PATCH(request: NextRequest) {
  const account = await accountFor(request);
  if (!account) {
    return NextResponse.json({ success: false, error: "Instagram account not connected." }, { status: 400 });
  }
  const id = request.nextUrl.searchParams.get("id");
  const body = (await request.json().catch(() => null)) as { isActive?: unknown } | null;
  if (!id || typeof body?.isActive !== "boolean") {
    return NextResponse.json({ success: false, error: "A campaign id and isActive are required." }, { status: 400 });
  }
  // Scoped to the account Pedro asked for, so one channel can never flip another's campaign.
  const { count } = await prisma.automation.updateMany({
    where: { id, instagramAccountId: account.id },
    data: { isActive: body.isActive },
  });
  if (count === 0) {
    return NextResponse.json({ success: false, error: "Campaign not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: { id, isActive: body.isActive } });
}
