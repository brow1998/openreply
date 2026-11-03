import { EMAIL_PROVIDER_ID, signIn } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { getCampaignTemplate } from "@/lib/templates/campaign-templates";
import { DemoNotice } from "@/components/demo-notice";
import { isPublicDemoHost } from "@/lib/env";
import { isPedroAuthEnabled, PEDRO_PROVIDER_ID } from "@/lib/access/pedro";

const GITHUB_URL = "https://github.com/diwenne/openreply";
const SETUP_DOCS_URL = `${GITHUB_URL}/blob/main/docs/setup.md`;

export async function generateMetadata() {
  const { t } = await getI18n();
  return {
    title: t("Login - OpenReply"),
    description: t("Sign in to manage Instagram comment-to-DM campaigns."),
  };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    checkEmail?: string;
    callbackUrl?: string;
    template?: string;
  }>;
}) {
  const { t } = await getI18n();
  if (await isPublicDemoHost()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="w-full max-w-md text-center">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            Open<span className="text-accent">Reply</span>
          </h1>
          <div className="panel mt-8 p-8">
            <h2 className="text-lg font-semibold text-foreground">
              {t("Sign-in is off on this demo")}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {t("This is the public demo — it doesn’t create real accounts or send DMs. To use OpenReply for real, clone it and run your own instance with your own Meta app and domain.")}
            </p>
            <a
              href={SETUP_DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3.5 text-sm font-semibold text-accent-foreground transition-colors duration-(--dur-ui) ease-(--ease-out-quart) hover:bg-accent-hover"
            >
              {t("Clone it yourself")} <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  const params = await searchParams;
  const checkEmail = params.checkEmail === "1";
  const selectedTemplate = getCampaignTemplate(params.template);
  const templateCallbackUrl = selectedTemplate
    ? `/campaigns/new?template=${selectedTemplate.slug}`
    : null;
  const callbackUrl = params.callbackUrl ?? templateCallbackUrl ?? "/dashboard";

  async function sendMagicLink(formData: FormData) {
    "use server";
    await signIn(EMAIL_PROVIDER_ID, {
      email: String(formData.get("email") ?? ""),
      redirectTo: callbackUrl,
    });
  }

  async function signInWithPedro() {
    "use server";
    await signIn(PEDRO_PROVIDER_ID, { redirectTo: callbackUrl });
  }
  const pedroEnabled = isPedroAuthEnabled();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            Open<span className="text-accent">Reply</span>
          </h1>
          <p className="text-muted text-sm leading-relaxed mt-2">
            {selectedTemplate
              ? t("Sign in to use the {name} template.", { name: selectedTemplate.title })
              : t("Sign in by email, then connect your Instagram professional account.")}
          </p>
        </div>

        <DemoNotice variant="panel" />

        <div className="panel p-8">
          {selectedTemplate && !checkEmail && (
            <div className="mb-5 rounded-lg bg-accent/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                {t("Template selected")}
              </p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {selectedTemplate.title}
              </p>
            </div>
          )}

          {checkEmail ? (
            <div className="text-center py-4">
              <h2 className="mb-2 font-display text-lg font-semibold tracking-tight">{t("Check your email")}</h2>
              <p className="text-sm text-muted">
                {t("We sent you a secure sign-in link. Open it on this device to continue.")}
              </p>
            </div>
          ) : (
            <>
            {pedroEnabled && (
              <form action={signInWithPedro} className="mb-5 space-y-5">
                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3.5 text-sm font-semibold text-accent-foreground transition-colors duration-(--dur-ui) ease-(--ease-out-quart) hover:bg-accent-hover"
                >
                  {t("Sign in with Pedro")}
                </button>
                <p className="text-center text-xs text-muted">{t("or")}</p>
              </form>
            )}
            <form action={sendMagicLink} className="space-y-5">
              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-foreground"
                >
                  {t("Work email")}
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@company.com"
                  className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted transition-colors duration-(--dur-ui) ease-(--ease-out-quart) focus:border-accent/50 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3.5 text-sm font-semibold text-accent-foreground transition-colors duration-(--dur-ui) ease-(--ease-out-quart) hover:bg-accent-hover"
              >
                {t("Email me a magic link")}
              </button>
            </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
