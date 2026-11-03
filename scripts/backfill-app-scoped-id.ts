/**
 * Fills InstagramAccount.appScopedId (the Instagram `id`, which is what Pedro
 * stores) for accounts connected before the column existed. Safe to re-run:
 * it only touches rows where the column is still null.
 *
 *   npx tsx scripts/backfill-app-scoped-id.ts            # writes
 *   npx tsx scripts/backfill-app-scoped-id.ts --dry-run  # only prints
 */
import { prisma } from "@/lib/db/client";
import { decryptToken } from "@/lib/meta/oauth";
import { getUserInfo } from "@/lib/meta/client";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const accounts = await prisma.instagramAccount.findMany({
    where: { provider: "META", appScopedId: null },
    select: { id: true, username: true, instagramId: true, accessToken: true },
  });
  console.log(`${accounts.length} account(s) without appScopedId`);

  let failed = 0;
  for (const account of accounts) {
    try {
      const info = await getUserInfo(decryptToken(account.accessToken));
      // Guard against a token that now answers for another professional account.
      if ((info.user_id ?? info.id) !== account.instagramId) {
        throw new Error(`token answers for ${info.user_id ?? info.id}, not ${account.instagramId}`);
      }
      console.log(`@${account.username}: ${account.instagramId} -> ${info.id}`);
      if (!dryRun) {
        await prisma.instagramAccount.update({
          where: { id: account.id },
          data: { appScopedId: info.id },
        });
      }
    } catch (error) {
      failed += 1;
      console.error(`@${account.username}: ${error instanceof Error ? error.message : error}`);
    }
  }
  if (failed) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
