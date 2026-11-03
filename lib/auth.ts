import NextAuth, { type NextAuthConfig } from "next-auth";
import type { OAuthConfig } from "next-auth/providers";
import Nodemailer from "next-auth/providers/nodemailer";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db/client";
import { ensureWorkspaceForUser, getPrimaryWorkspace } from "@/lib/workspace";
import { isEmailAllowedToSignIn } from "@/lib/env";
import { normalizeInvitationEmail } from "@/lib/workspace-invitations";
import type { PedroAccess } from "@/lib/access/grants";
import {
  isPedroAuthEnabled,
  PEDRO_PROVIDER_ID,
  PEDRO_SCOPE,
  pedroEndpoints,
} from "@/lib/access/pedro";
import { refreshUserGrants } from "@/lib/access/refresh";
import { hasPedroAccess } from "@/lib/access/grants";

type AdapterPrismaClient = Parameters<typeof PrismaAdapter>[0];

const emailFrom = process.env.EMAIL_FROM ?? "OpenReply <login@example.com>";
// Setting EMAIL_SERVER switches magic links to your own SMTP server, for
// self-hosters who do not want a third-party mail service. Resend stays the
// default, so an existing deployment is unaffected.
const smtpServer = process.env.EMAIL_SERVER;

/**
 * Provider id the login form has to sign in with. It differs per transport,
 * so it is derived here rather than hardcoded at the call site.
 */
export const EMAIL_PROVIDER_ID = smtpServer ? "nodemailer" : "resend";

/**
 * Sign-in through Pedro, only when PEDRO_OAUTH_CLIENT_ID is set. Public client
 * (PKCE, no secret); the profile is Pedro's access answer, so the same call
 * that identifies the user also lists their channels.
 */
function pedroProvider(): OAuthConfig<PedroAccess> {
  const endpoints = pedroEndpoints();
  return {
    id: PEDRO_PROVIDER_ID,
    name: "Pedro",
    type: "oauth",
    clientId: process.env.PEDRO_OAUTH_CLIENT_ID,
    client: { token_endpoint_auth_method: "none" },
    checks: ["pkce", "state"],
    authorization: { url: endpoints.authorize, params: { scope: PEDRO_SCOPE } },
    token: endpoints.token,
    userinfo: endpoints.access,
    // Pedro only signs people in by verified email (magic link or Google), so
    // linking to the existing OpenReply user with that email is safe.
    allowDangerousEmailAccountLinking: true,
    profile(profile) {
      return {
        id: profile.userId,
        name: profile.name ?? null,
        email: profile.email,
        image: profile.image ?? null,
      };
    },
  };
}

export const authConfig = {
  adapter: PrismaAdapter(prisma as unknown as AdapterPrismaClient),
  providers: [
    smtpServer
      ? Nodemailer({ server: smtpServer, from: emailFrom })
      : Resend({
          apiKey: process.env.RESEND_API_KEY ?? "missing-resend-api-key",
          from: emailFrom,
        }),
    ...(isPedroAuthEnabled() ? [pedroProvider()] : []),
  ],
  callbacks: {
    // Runs before the magic link is sent, so a blocked address never receives
    // one, and again when the link is verified.
    async signIn({ user, account, profile }) {
      // Pedro decides who may come in, but only someone it granted something on a
      // channel (or a platform admin) gets past here: a Pedro account with no
      // channel would otherwise land in a personal workspace as its owner.
      if (account?.provider === PEDRO_PROVIDER_ID) return hasPedroAccess(profile as PedroAccess | undefined);
      if (isEmailAllowedToSignIn(user?.email)) return true;
      if (!user?.email) return false;
      // Someone with a pending, unexpired invitation may sign in even when the
      // address is outside ALLOWED_EMAILS, so they can accept it. (The new user
      // also gets a personal workspace from the createUser event below.)
      const invitation = await prisma.workspaceInvitation.findFirst({
        where: {
          email: normalizeInvitationEmail(user.email),
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      return Boolean(invitation);
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  events: {
    async signIn({ user, account }) {
      if (account?.provider !== PEDRO_PROVIDER_ID || !user.id || !account.access_token) return;
      await refreshUserGrants(user.id, {
        accessToken: account.access_token,
        refreshToken: account.refresh_token ?? null,
        expiresAt: account.expires_at ?? null,
      }).catch((error) => console.error("Pedro grants refresh failed", error));
    },
    async createUser({ user }) {
      // With Pedro on, workspaces come from the grants (the owner's), and the
      // lazy ensureWorkspaceForUser below covers anyone left without one.
      if (user.id && !isPedroAuthEnabled()) {
        await ensureWorkspaceForUser(user.id, user.email);
      }
    },
  },
  pages: {
    signIn: "/login",
    verifyRequest: "/verify-request",
  },
  session: {
    strategy: "database",
  },
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET,
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function getCurrentWorkspaceId(): Promise<string | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const workspace = await getPrimaryWorkspace(userId);
  if (workspace) return workspace.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  const createdWorkspace = await ensureWorkspaceForUser(userId, user?.email);
  return createdWorkspace.id;
}
