import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
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

  if (!(await canUseSomewhere(context, "account.manage"))) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can disconnect accounts" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const instagramAccountId =
    typeof body.instagramAccountId === "string" ? body.instagramAccountId : null;

  // With Pedro sign-in on, only accounts the user may manage are removed.
  const id = accountCondition(
    await accountScope(context.workspaceId, "account.manage"),
    instagramAccountId
  );
  await prisma.instagramAccount.deleteMany({
    where: {
      workspaceId: context.workspaceId,
      ...(id !== undefined ? { id } : {}),
    },
  });

  return NextResponse.json({ success: true });
}
