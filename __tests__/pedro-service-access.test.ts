import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockPrisma, mockWorkspaceAccount } = vi.hoisted(() => ({
  mockPrisma: { instagramAccount: { findFirst: vi.fn() } },
  mockWorkspaceAccount: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth", () => ({ getCurrentWorkspaceId: vi.fn(async () => null) }));
vi.mock("@/lib/instagram-accounts", () => ({ getWorkspaceInstagramAccount: mockWorkspaceAccount }));

import { instagramAccountForRequest } from "../lib/access/service";

function request(headers: Record<string, string>) {
  return new NextRequest("https://reply.test/api/instagram/comments", { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PEDRO_SERVICE_SECRET", "segredo-de-teste");
  mockPrisma.instagramAccount.findFirst.mockResolvedValue({ id: "acc_a" });
});

afterEach(() => vi.unstubAllEnvs());

describe("instagramAccountForRequest", () => {
  it("resolves the account by app-scoped id for Pedro's server", async () => {
    const account = await instagramAccountForRequest(
      request({ authorization: "Bearer segredo-de-teste", "x-instagram-app-scoped-id": "270714" }),
      null,
      "comment.read"
    );
    expect(account).toEqual({ id: "acc_a" });
    expect(mockPrisma.instagramAccount.findFirst).toHaveBeenCalledWith({ where: { appScopedId: "270714" } });
  });

  it("refuses a wrong secret and falls back to the (absent) session", async () => {
    const account = await instagramAccountForRequest(
      request({ authorization: "Bearer outro-segredo", "x-instagram-app-scoped-id": "270714" }),
      null,
      "comment.read"
    );
    expect(account).toBeNull();
    expect(mockPrisma.instagramAccount.findFirst).not.toHaveBeenCalled();
  });

  it("never accepts a service call when no secret is configured", async () => {
    vi.stubEnv("PEDRO_SERVICE_SECRET", "");
    const account = await instagramAccountForRequest(
      request({ authorization: "Bearer ", "x-instagram-app-scoped-id": "270714" }),
      null,
      "comment.read"
    );
    expect(account).toBeNull();
  });

  it("needs the account header on a service call", async () => {
    const account = await instagramAccountForRequest(
      request({ authorization: "Bearer segredo-de-teste" }),
      null,
      "comment.read"
    );
    expect(account).toBeNull();
  });
});
