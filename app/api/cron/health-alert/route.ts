import { NextRequest, NextResponse } from "next/server";
import { runHealthAlerts } from "@/lib/ops/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Every 15 minutes from scripts/cron.sh: checks worker, queue, tokens, webhook
// delivery, Postgres and Redis, and mails the workspace owners when one breaks.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET;

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const result = await runHealthAlerts();
  return NextResponse.json({
    success: result.errors.length === 0,
    data: {
      problems: result.problems,
      sent: result.sent,
      skipped: result.skipped,
      recovered: result.recovered,
      errors: result.errors,
    },
  });
}
