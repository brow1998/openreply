import { I18nProvider } from "@/lib/i18n/provider";
import { getI18n } from "@/lib/i18n/server";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { accountCondition } from "@/lib/access/grants";
import { accountScope } from "@/lib/access/scope";
import { ensureWorkspaceForUser } from "@/lib/workspace";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("OpenReply - Open source Instagram comment-to-DM automation") };
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { locale } = await getI18n();
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const workspace = await ensureWorkspaceForUser(
    session.user.id,
    session.user.email
  );
  const listId = accountCondition(await accountScope(workspace.id, "any"));
  const accounts = await prisma.instagramAccount.findMany({
    where: { workspaceId: workspace.id, ...(listId !== undefined ? { id: listId } : {}) },
    orderBy: { connectedAt: "desc" },
    select: { username: true },
  });

  return (
    <I18nProvider locale={locale}>
      <DashboardShell
        instagramAccountCount={accounts.length}
      >
        {children}
      </DashboardShell>
    </I18nProvider>
  );
}
