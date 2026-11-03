import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// User A holds grants on account A only; account B belongs to the same workspace.
const { mockPrisma, mockCurrentGrants, session } = vi.hoisted(() => ({
  mockPrisma: {
    workspaceMember: { findUnique: vi.fn() },
    instagramAccount: { findFirst: vi.fn() },
    dmLog: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
    automation: { findMany: vi.fn(), update: vi.fn() },
    linkClick: { findMany: vi.fn() },
  },
  mockCurrentGrants: vi.fn(),
  session: { userId: "user_a" as string | null },
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth", () => ({
  getCurrentUserId: vi.fn(async () => session.userId),
  getCurrentWorkspaceId: vi.fn(async () => "ws_1"),
}));
vi.mock("@/lib/access/refresh", () => ({ currentGrants: mockCurrentGrants }));

import { getWorkspaceInstagramAccount } from "../lib/instagram-accounts";
import { GET as getLogs } from "../app/api/logs/route";
import { GET as getAutomations } from "../app/api/automations/route";

const GRANT_A = [
  { instagramAccountId: "acc_a", capabilities: ["comment.read", "comment.reply", "inbox.read", "inbox.reply"] },
];

function lastWhere(fn: ReturnType<typeof vi.fn>) {
  return fn.mock.calls.at(-1)?.[0]?.where;
}

beforeEach(() => {
  vi.clearAllMocks();
  session.userId = "user_a";
  mockPrisma.workspaceMember.findUnique.mockResolvedValue({ role: "MEMBER" });
  mockCurrentGrants.mockResolvedValue(GRANT_A);
  mockPrisma.instagramAccount.findFirst.mockResolvedValue(null);
  mockPrisma.dmLog.findMany.mockResolvedValue([]);
  mockPrisma.dmLog.count.mockResolvedValue(0);
  mockPrisma.dmLog.groupBy.mockResolvedValue([]);
  mockPrisma.automation.findMany.mockResolvedValue([]);
  mockPrisma.linkClick.findMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("with Pedro sign-in on", () => {
  beforeEach(() => vi.stubEnv("PEDRO_OAUTH_CLIENT_ID", "openreply"));

  it("user A cannot open account B's comments or conversations", async () => {
    await getWorkspaceInstagramAccount("ws_1", "acc_b", "comment.read");
    expect(lastWhere(mockPrisma.instagramAccount.findFirst)).toEqual({ workspaceId: "ws_1", id: { in: [] } });

    await getWorkspaceInstagramAccount("ws_1", "acc_b", "inbox.read");
    expect(lastWhere(mockPrisma.instagramAccount.findFirst)).toEqual({ workspaceId: "ws_1", id: { in: [] } });
  });

  it("user A opens account A, and with no account chosen lands on A only", async () => {
    await getWorkspaceInstagramAccount("ws_1", "acc_a", "comment.read");
    expect(lastWhere(mockPrisma.instagramAccount.findFirst)).toEqual({ workspaceId: "ws_1", id: "acc_a" });

    await getWorkspaceInstagramAccount("ws_1", null, "inbox.read");
    expect(lastWhere(mockPrisma.instagramAccount.findFirst)).toEqual({ workspaceId: "ws_1", id: { in: ["acc_a"] } });
  });

  it("a capability missing on the account is refused", async () => {
    await getWorkspaceInstagramAccount("ws_1", "acc_a", "campaign.manage");
    expect(lastWhere(mockPrisma.instagramAccount.findFirst)).toEqual({ workspaceId: "ws_1", id: { in: [] } });
  });

  it("user A cannot read account B's logs", async () => {
    await getLogs(new NextRequest("https://x.test/api/logs?instagramAccountId=acc_b"));
    expect(lastWhere(mockPrisma.dmLog.findMany)).toEqual({ workspaceId: "ws_1", instagramAccountId: { in: [] } });

    await getLogs(new NextRequest("https://x.test/api/logs"));
    expect(lastWhere(mockPrisma.dmLog.findMany)).toEqual({ workspaceId: "ws_1", instagramAccountId: { in: ["acc_a"] } });
  });

  it("user A cannot list account B's automations", async () => {
    await getAutomations(new NextRequest("https://x.test/api/automations"));
    expect(lastWhere(mockPrisma.automation.findMany)).toEqual({ workspaceId: "ws_1", instagramAccountId: { in: ["acc_a"] } });
  });

  it("the workspace owner sees every account", async () => {
    mockPrisma.workspaceMember.findUnique.mockResolvedValue({ role: "OWNER" });
    await getWorkspaceInstagramAccount("ws_1", "acc_b", "inbox.read");
    expect(lastWhere(mockPrisma.instagramAccount.findFirst)).toEqual({ workspaceId: "ws_1", id: "acc_b" });

    await getLogs(new NextRequest("https://x.test/api/logs"));
    expect(lastWhere(mockPrisma.dmLog.findMany)).toEqual({ workspaceId: "ws_1" });
    expect(mockCurrentGrants).not.toHaveBeenCalled();
  });

  it("expired grants Pedro cannot renew give no access", async () => {
    mockCurrentGrants.mockResolvedValue([]);
    await getWorkspaceInstagramAccount("ws_1", "acc_a", "comment.read");
    expect(lastWhere(mockPrisma.instagramAccount.findFirst)).toEqual({ workspaceId: "ws_1", id: { in: [] } });
  });

  it("no session gives no access", async () => {
    session.userId = null;
    await getWorkspaceInstagramAccount("ws_1", "acc_a", "comment.read");
    expect(lastWhere(mockPrisma.instagramAccount.findFirst)).toEqual({ workspaceId: "ws_1", id: { in: [] } });
  });
});

describe("with Pedro sign-in off", () => {
  it("every member keeps workspace-wide access, as before", async () => {
    await getWorkspaceInstagramAccount("ws_1", "acc_b", "comment.read");
    expect(lastWhere(mockPrisma.instagramAccount.findFirst)).toEqual({ workspaceId: "ws_1", id: "acc_b" });

    await getWorkspaceInstagramAccount("ws_1", null, "inbox.read");
    expect(lastWhere(mockPrisma.instagramAccount.findFirst)).toEqual({ workspaceId: "ws_1" });

    await getLogs(new NextRequest("https://x.test/api/logs"));
    expect(lastWhere(mockPrisma.dmLog.findMany)).toEqual({ workspaceId: "ws_1" });

    await getAutomations(new NextRequest("https://x.test/api/automations"));
    expect(lastWhere(mockPrisma.automation.findMany)).toEqual({ workspaceId: "ws_1" });

    expect(mockPrisma.workspaceMember.findUnique).not.toHaveBeenCalled();
    expect(mockCurrentGrants).not.toHaveBeenCalled();
  });
});
