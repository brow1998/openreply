import { NextRequest, NextResponse } from "next/server";
import { duplicateCampaign } from "@/lib/campaigns/duplicate";
import { getCurrentWorkspaceContext } from "@/lib/workspace-access";
import { accountCondition } from "@/lib/access/grants";
import { accountScope, canUseSomewhere } from "@/lib/access/scope";

export async function POST(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!(await canUseSomewhere(context, "campaign.manage"))) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can create campaigns" },
      { status: 403 }
    );
  }

  const automationId = request.nextUrl.searchParams.get("id");
  if (!automationId) {
    return NextResponse.json(
      { success: false, error: "Missing campaign ID" },
      { status: 400 }
    );
  }

  const duplicate = await duplicateCampaign({
    automationId,
    workspaceId: context.workspaceId,
    accountId: accountCondition(await accountScope(context.workspaceId, "campaign.manage")),
  });

  if (!duplicate) {
    return NextResponse.json(
      { success: false, error: "Campaign not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(
    { success: true, data: duplicate },
    { status: 201 }
  );
}
