import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockFetchAccess, mockRefreshTokens } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    account: { findFirst: vi.fn(), updateMany: vi.fn() },
    instagramAccount: { findMany: vi.fn() },
    userAccountGrant: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    workspaceMember: { upsert: vi.fn() },
    $transaction: vi.fn(),
  },
  mockFetchAccess: vi.fn(),
  mockRefreshTokens: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/access/pedro", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/access/pedro")>()),
  fetchPedroAccess: mockFetchAccess,
  refreshPedroTokens: mockRefreshTokens,
}));

import { currentGrants, storeGrants } from "../lib/access/refresh";

const STORED = [{ instagramAccountId: "acc_a", capabilities: ["inbox.read"] }];
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.userAccountGrant.findMany.mockResolvedValue(STORED);
  mockPrisma.account.findFirst.mockResolvedValue({ access_token: "tok", refresh_token: "ref", expires_at: null });
  mockPrisma.$transaction.mockResolvedValue([]);
});

describe("currentGrants", () => {
  it("uses fresh grants without asking Pedro", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ accessRefreshedAt: minutesAgo(1) });
    await expect(currentGrants("user_a")).resolves.toEqual(STORED);
    expect(mockFetchAccess).not.toHaveBeenCalled();
  });

  it("keeps stale grants when Pedro is down", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ accessRefreshedAt: minutesAgo(10) });
    mockFetchAccess.mockResolvedValue(null);
    await expect(currentGrants("user_a")).resolves.toEqual(STORED);
    expect(mockFetchAccess).toHaveBeenCalledWith("tok");
  });

  it("fails closed when grants expired and Pedro is down", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ accessRefreshedAt: minutesAgo(20) });
    mockFetchAccess.mockResolvedValue(null);
    await expect(currentGrants("user_a")).resolves.toEqual([]);
  });

  it("renews an expired access token before asking Pedro", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ accessRefreshedAt: null });
    mockPrisma.account.findFirst.mockResolvedValue({ access_token: "old", refresh_token: "ref", expires_at: 1 });
    mockRefreshTokens.mockResolvedValue({ accessToken: "new", refreshToken: "ref2", expiresAt: 9e9 });
    mockFetchAccess.mockResolvedValue({ userId: "p1", email: "a@b.c", channels: [] });
    mockPrisma.instagramAccount.findMany.mockResolvedValue([]);

    await currentGrants("user_a");
    expect(mockRefreshTokens).toHaveBeenCalledWith("ref");
    expect(mockPrisma.account.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { access_token: "new", refresh_token: "ref2", expires_at: 9e9 } })
    );
    expect(mockFetchAccess).toHaveBeenCalledWith("new");
  });
});

describe("storeGrants", () => {
  it("rewrites grants and joins the workspaces that own granted accounts", async () => {
    mockPrisma.instagramAccount.findMany.mockResolvedValue([
      { id: "acc_a", appScopedId: "27071421349200055", workspaceId: "ws_1" },
    ]);
    const grants = await storeGrants("user_a", {
      userId: "p1",
      email: "a@b.c",
      channels: [{ channelId: "c1", instagramExternalId: "27071421349200055", capabilities: ["inbox.read"] }],
    });
    expect(grants).toEqual([{ instagramAccountId: "acc_a", capabilities: ["inbox.read"] }]);
    expect(mockPrisma.userAccountGrant.createMany).toHaveBeenCalledWith({
      data: [{ userId: "user_a", instagramAccountId: "acc_a", capabilities: ["inbox.read"] }],
    });
    expect(mockPrisma.workspaceMember.upsert).toHaveBeenCalledWith({
      where: { workspaceId_userId: { workspaceId: "ws_1", userId: "user_a" } },
      create: { workspaceId: "ws_1", userId: "user_a", role: "MEMBER" },
      update: {},
    });
  });
});
