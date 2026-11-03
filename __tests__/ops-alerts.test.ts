import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ prisma: {} }));
vi.mock("@/lib/queue/client", () => ({ getDMQueue: vi.fn(), getRedisConnection: vi.fn() }));
vi.mock("@/lib/ops/worker-health", () => ({ getWorkerHealth: vi.fn() }));

import { buildProblems, decideAlerts, DEDUPE_MS, type Facts } from "@/lib/ops/alerts";

const now = Date.parse("2026-11-03T12:00:00Z");
const healthy: Facts = {
  now,
  database: { ok: true },
  redis: { ok: true },
  worker: { healthy: true, ageMs: 5_000 },
  queue: { waiting: 0, active: 0, failedLastHour: 0 },
  expiringTokens: [],
  webhook: { subscribedAccounts: 1, lastEventAt: new Date(now - 3600_000) },
};
const keys = (f: Partial<Facts>) => buildProblems({ ...healthy, ...f }).map((p) => p.key);

describe("buildProblems", () => {
  it("finds nothing on a healthy system", () => {
    expect(keys({})).toEqual([]);
  });

  it("flags database, redis, a dead worker and a stuck queue", () => {
    expect(keys({ database: { ok: false, detail: "x" } })).toEqual(["database"]);
    expect(keys({ redis: { ok: false }, worker: null, queue: null })).toEqual(["redis"]);
    expect(keys({ worker: { healthy: false, ageMs: null } })).toEqual(["worker"]);
    expect(keys({ queue: { waiting: 30, active: 0, failedLastHour: 0 } })).toEqual(["queue-stuck"]);
  });

  it("does not call a busy queue stuck", () => {
    expect(keys({ queue: { waiting: 30, active: 3, failedLastHour: 0 } })).toEqual([]);
  });

  it("flags many failures in the last hour", () => {
    expect(keys({ queue: { waiting: 0, active: 0, failedLastHour: 10 } })).toEqual(["queue-failures"]);
    expect(keys({ queue: { waiting: 0, active: 0, failedLastHour: 9 } })).toEqual([]);
  });

  it("flags expiring tokens per account, addressed to that workspace", () => {
    const p = buildProblems({
      ...healthy,
      expiringTokens: [{ id: "acc1", username: "bruno", workspaceId: "ws1", expiresAt: new Date(now + 2 * 86_400_000) }],
    });
    expect(p.map((x) => x.key)).toEqual(["token:acc1"]);
    expect(p[0].workspaceId).toBe("ws1");
    expect(p[0].subject).toContain("2 days");
  });

  it("flags 48h of webhook silence only when an account is subscribed", () => {
    const old = new Date(now - 49 * 3600_000);
    expect(keys({ webhook: { subscribedAccounts: 1, lastEventAt: old } })).toEqual(["webhook-silence"]);
    expect(keys({ webhook: { subscribedAccounts: 1, lastEventAt: null } })).toEqual(["webhook-silence"]);
    expect(keys({ webhook: { subscribedAccounts: 0, lastEventAt: null } })).toEqual([]);
  });
});

describe("decideAlerts", () => {
  const worker = buildProblems({ ...healthy, worker: { healthy: false, ageMs: null } });

  it("sends a new problem", () => {
    const r = decideAlerts(worker, [], now);
    expect(r.send.map((p) => p.key)).toEqual(["worker"]);
    expect(r.skipped).toEqual([]);
  });

  it("skips a problem mailed less than 12 hours ago, and re-sends after", () => {
    expect(decideAlerts(worker, [{ key: "worker", lastSentAt: now - 3600_000 }], now).skipped).toEqual(["worker"]);
    expect(decideAlerts(worker, [{ key: "worker", lastSentAt: now - DEDUPE_MS - 1 }], now).send.map((p) => p.key)).toEqual(["worker"]);
  });

  it("reports an open alert that is no longer a problem as recovered", () => {
    const r = decideAlerts([], [{ key: "worker", lastSentAt: now - 3600_000 }], now);
    expect(r.recovered).toEqual(["worker"]);
    expect(r.send).toEqual([]);
  });
});
