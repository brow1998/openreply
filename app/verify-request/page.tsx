import { getI18n } from "@/lib/i18n/server";
import Link from "next/link";

export async function generateMetadata() {
  const { t } = await getI18n();
  return {
    title: t("Check your email - OpenReply"),
    description: t("A sign-in link was sent to your email."),
  };
}

export default async function VerifyRequestPage() {
  const { t } = await getI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            Open<span className="text-accent">Reply</span>
          </h1>
        </div>

        <div className="panel p-8 text-center">
          <h2 className="mb-2 font-display text-lg font-semibold tracking-tight">{t("Check your email")}</h2>
          <p className="text-sm text-muted">
            {t("We sent you a secure sign-in link. Open it on this device to continue.")}
          </p>
          <p className="mt-6 text-sm">
            <Link href="/login" className="text-accent hover:text-accent-hover">
              {t("Back to sign in")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
