import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    instagramAccount: { findFirst: vi.fn() },
    automation: { findMany: vi.fn(), updateMany: vi.fn() },
    dmLog: { groupBy: vi.fn() },
    linkClick: { groupBy: vi.fn() },
  },
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth", () => ({ getCurrentWorkspaceId: vi.fn(async () => "ws_1") }));

import { GET, PATCH } from "../app/api/pedro/campaigns/route";

const SERVICE = { authorization: "Bearer segredo", "x-instagram-app-scoped-id": "270714" };

function req(method: string, headers: Record<string, string>, url = "https://reply.test/api/pedro/campaigns", body?: unknown) {
  return new NextRequest(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PEDRO_SERVICE_SECRET", "segredo");
  mockPrisma.instagramAccount.findFirst.mockResolvedValue({ id: "acc_a" });
  mockPrisma.automation.findMany.mockResolvedValue([
    { id: "c1", name: "Link", isActive: true, keywords: ["link"], matchAnyWord: false, matchAnyPost: true, postUrl: null, dmTriggerEnabled: false, createdAt: new Date("2026-11-01") },
  ]);
  mockPrisma.dmLog.groupBy.mockResolvedValue([
    { automationId: "c1", status: "SENT", _count: { _all: 4 } },
    { automationId: "c1", status: "FAILED", _count: { _all: 1 } },
  ]);
  mockPrisma.linkClick.groupBy.mockResolvedValue([{ automationId: "c1", _count: { _all: 2 } }]);
  mockPrisma.automation.updateMany.mockResolvedValue({ count: 1 });
});

describe("/api/pedro/campaigns", () => {
  it("lists the account's campaigns with sent, failed and clicks", async () => {
    const res = await GET(req("GET", SERVICE));
    const json = await res.json();
    expect(json.data.campaigns[0]).toMatchObject({ id: "c1", sent: 4, failed: 1, clicks: 2 });
    expect(mockPrisma.automation.findMany.mock.calls[0][0].where).toEqual({ instagramAccountId: "acc_a" });
  });

  it("refuses a signed-in user without the service secret", async () => {
    const res = await GET(req("GET", {}));
    expect(res.status).toBe(400);
    expect(mockPrisma.automation.findMany).not.toHaveBeenCalled();
  });

  it("toggles only within the account Pedro named", async () => {
    const res = await PATCH(req("PATCH", SERVICE, "https://reply.test/api/pedro/campaigns?id=c9", { isActive: false }));
    expect(res.status).toBe(200);
    expect(mockPrisma.automation.updateMany).toHaveBeenCalledWith({
      where: { id: "c9", instagramAccountId: "acc_a" },
      data: { isActive: false },
    });
  });

  it("answers 404 for another account's campaign", async () => {
    mockPrisma.automation.updateMany.mockResolvedValue({ count: 0 });
    const res = await PATCH(req("PATCH", SERVICE, "https://reply.test/api/pedro/campaigns?id=other", { isActive: true }));
    expect(res.status).toBe(404);
  });
});
