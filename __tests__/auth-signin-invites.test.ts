import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock("@/lib/db/client", () => ({
  prisma: { workspaceInvitation: { findFirst } },
}));
vi.mock("@/lib/workspace", () => ({
  ensureWorkspaceForUser: vi.fn(),
  getPrimaryWorkspace: vi.fn(),
}));
vi.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }));
// next-auth only loads inside Next; the callbacks under test do not need it.
vi.mock("next-auth", () => ({
  default: () => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("next-auth/providers/nodemailer", () => ({ default: () => ({}) }));
vi.mock("next-auth/providers/resend", () => ({ default: () => ({}) }));

import { authConfig } from "@/lib/auth";

const signIn = (email?: string | null) =>
  authConfig.callbacks.signIn!({ user: { email } } as never) as Promise<boolean>;

describe("signIn with an allow-list", () => {
  beforeEach(() => {
    findFirst.mockReset();
    vi.stubEnv("ALLOWED_EMAILS", "dono@example.com");
  });

  it("lets an allow-listed address in without touching the database", async () => {
    expect(await signIn("Dono@Example.com")).toBe(true);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("lets an address with a pending, unexpired invitation in", async () => {
    findFirst.mockResolvedValue({ id: "inv1" });
    expect(await signIn("  Convidado@Example.com ")).toBe(true);
    const where = findFirst.mock.calls[0][0].where;
    expect(where.email).toBe("convidado@example.com");
    expect(where.status).toBe("PENDING");
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
  });

  it("refuses an address with no valid invitation (expired, used and revoked all miss the query)", async () => {
    findFirst.mockResolvedValue(null);
    expect(await signIn("estranho@example.com")).toBe(false);
  });

  it("refuses a missing email", async () => {
    expect(await signIn(null)).toBe(false);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
