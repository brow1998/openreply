import nodemailer from "nodemailer";
import { prisma } from "@/lib/db/client";
import { getDMQueue, getRedisConnection } from "@/lib/queue/client";
import { getWorkerHealth } from "@/lib/ops/worker-health";

/**
 * Operational alerts by email. Without them a dead worker, a stuck queue or an
 * expired Instagram token stops every campaign and nobody notices. The cron
 * route gathers facts, `buildProblems` and `decideAlerts` (pure) decide what to
 * send, and each alert is recorded as an OperationalEvent so the same problem
 * mails at most once per DEDUPE_MS and a "recovered" mail follows when it clears.
 */

export const DEDUPE_MS = 12 * 60 * 60 * 1000;
export const STUCK_QUEUE_MIN_WAITING = Number(process.env.HEALTH_STUCK_QUEUE_WAITING ?? 25);
export const FAILED_JOBS_PER_HOUR = 10;
export const TOKEN_WARNING_DAYS = 5;
export const WEBHOOK_SILENCE_MS = 48 * 60 * 60 * 1000;
const EVENT_KIND = "ops-alert";

export type Severity = "error" | "warning" | "info";

export interface Problem {
  key: string;
  severity: Severity;
  subject: string;
  body: string;
  /** Mail this workspace's owners only; unset means every owner (infrastructure). */
  workspaceId?: string;
}

export interface Facts {
  now: number;
  database: { ok: boolean; detail?: string };
  redis: { ok: boolean; detail?: string };
  worker: { healthy: boolean; ageMs: number | null } | null;
  queue: { waiting: number; active: number; failedLastHour: number } | null;
  expiringTokens: { id: string; username: string; workspaceId: string; expiresAt: Date }[];
  webhook: { subscribedAccounts: number; lastEventAt: Date | null } | null;
}

export function buildProblems(f: Facts): Problem[] {
  const p: Problem[] = [];
  if (!f.database.ok) {
    p.push({
      key: "database",
      severity: "error",
      subject: "[OpenReply] Database is unreachable",
      body: `Checked: SELECT 1 against Postgres.\nFound: ${f.database.detail ?? "query failed"}.\nLook first at: the postgres container (docker ps, docker logs) and DATABASE_URL.`,
    });
  }
  if (!f.redis.ok) {
    p.push({
      key: "redis",
      severity: "error",
      subject: "[OpenReply] Redis is unreachable",
      body: `Checked: PING against Redis.\nFound: ${f.redis.detail ?? "no PONG"}.\nLook first at: the redis container and REDIS_URL. No DM is sent while Redis is down.`,
    });
  }
  if (f.redis.ok && f.worker && !f.worker.healthy) {
    p.push({
      key: "worker",
      severity: "error",
      subject: "[OpenReply] Worker is not running",
      body: `Checked: the worker heartbeat in Redis (refreshed every minute).\nFound: ${
        f.worker.ageMs === null ? "no heartbeat at all" : `last heartbeat ${Math.round(f.worker.ageMs / 60000)} min ago`
      }.\nLook first at: the worker container logs. Comments keep arriving but no DM is sent.`,
    });
  }
  if (f.queue && f.queue.waiting >= STUCK_QUEUE_MIN_WAITING && f.queue.active === 0) {
    p.push({
      key: "queue-stuck",
      severity: "error",
      subject: "[OpenReply] Send queue is stuck",
      body: `Checked: BullMQ job counts.\nFound: ${f.queue.waiting} jobs waiting and none active.\nLook first at: the worker logs; restart the worker container if its heartbeat is alive but it consumes nothing.`,
    });
  }
  if (f.queue && f.queue.failedLastHour >= FAILED_JOBS_PER_HOUR) {
    p.push({
      key: "queue-failures",
      severity: "warning",
      subject: "[OpenReply] Many DM sends are failing",
      body: `Checked: failed jobs in the last hour.\nFound: ${f.queue.failedLastHour} failures (threshold ${FAILED_JOBS_PER_HOUR}).\nLook first at: DM Logs in the dashboard for the error Meta returned.`,
    });
  }
  for (const t of f.expiringTokens) {
    const days = Math.max(0, Math.round((t.expiresAt.getTime() - f.now) / 86_400_000));
    p.push({
      key: `token:${t.id}`,
      severity: "error",
      workspaceId: t.workspaceId,
      subject: `[OpenReply] Instagram token for @${t.username} expires in ${days} day${days === 1 ? "" : "s"}`,
      body: `Checked: Instagram access tokens expiring within ${TOKEN_WARNING_DAYS} days.\nFound: @${t.username} expires ${t.expiresAt.toISOString()}. The daily refresh job should have renewed it by now.\nLook first at: the cron container logs for refresh-tokens; if it keeps failing, reconnect the account in Settings.`,
    });
  }
  if (
    f.webhook &&
    f.webhook.subscribedAccounts > 0 &&
    (!f.webhook.lastEventAt || f.now - f.webhook.lastEventAt.getTime() > WEBHOOK_SILENCE_MS)
  ) {
    p.push({
      key: "webhook-silence",
      severity: "info",
      subject: "[OpenReply] No webhook from Meta in 48 hours",
      body: `Checked: the most recent webhook event received.\nFound: ${
        f.webhook.lastEventAt ? `last one at ${f.webhook.lastEventAt.toISOString()}` : "none recorded"
      }. This can be a quiet account, or Meta stopped delivering.\nLook first at: the webhook subscription in the Meta app dashboard.`,
    });
  }
  return p;
}

export interface OpenAlert {
  key: string;
  lastSentAt: number;
}

/** Which problems to mail now, which were already mailed recently, and which cleared. */
export function decideAlerts(problems: Problem[], open: OpenAlert[], now: number) {
  const openByKey = new Map(open.map((o) => [o.key, o]));
  const current = new Set(problems.map((p) => p.key));
  const send: Problem[] = [];
  const skipped: string[] = [];
  for (const p of problems) {
    const o = openByKey.get(p.key);
    if (o && now - o.lastSentAt < DEDUPE_MS) skipped.push(p.key);
    else send.push(p);
  }
  const recovered = open.filter((o) => !current.has(o.key)).map((o) => o.key);
  return { send, skipped, recovered };
}

/** Plain-text mail through the same transport as the magic link. */
export async function sendMail(to: string[], subject: string, text: string) {
  if (to.length === 0) return;
  const from = process.env.EMAIL_FROM ?? "OpenReply <login@example.com>";
  if (process.env.EMAIL_SERVER) {
    await nodemailer.createTransport(process.env.EMAIL_SERVER).sendMail({ from, to, subject, text });
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}`);
}

async function gatherFacts(now: number): Promise<Facts> {
  const database = await prisma.$queryRaw`SELECT 1`.then(
    () => ({ ok: true }),
    (e: unknown) => ({ ok: false, detail: e instanceof Error ? e.message : String(e) })
  );
  const redis = await getRedisConnection()
    .ping()
    .then(
      (pong) => ({ ok: pong === "PONG", detail: pong }),
      (e: unknown) => ({ ok: false, detail: e instanceof Error ? e.message : String(e) })
    );

  let worker: Facts["worker"] = null;
  let queue: Facts["queue"] = null;
  if (redis.ok) {
    worker = await getWorkerHealth().catch(() => ({ healthy: false, ageMs: null }));
    queue = await (async () => {
      const q = getDMQueue();
      const counts = await q.getJobCounts("waiting", "active");
      // shortcut: inspects the newest 500 failed jobs; enough to count an hour of failures at this scale.
      const failed = await q.getFailed(0, 499);
      const failedLastHour = failed.filter((j) => (j.finishedOn ?? 0) >= now - 3_600_000).length;
      return { waiting: counts.waiting ?? 0, active: counts.active ?? 0, failedLastHour };
    })().catch(() => null);
  }

  let expiringTokens: Facts["expiringTokens"] = [];
  let webhook: Facts["webhook"] = null;
  if (database.ok) {
    const rows = await prisma.instagramAccount.findMany({
      where: {
        provider: "META",
        accessToken: { not: "" },
        tokenExpiresAt: { not: null, lte: new Date(now + TOKEN_WARNING_DAYS * 86_400_000) },
      },
      select: { id: true, username: true, workspaceId: true, tokenExpiresAt: true },
    });
    expiringTokens = rows.map((r) => ({
      id: r.id,
      username: r.username,
      workspaceId: r.workspaceId,
      expiresAt: r.tokenExpiresAt!,
    }));
    const [subscribedAccounts, last] = await Promise.all([
      prisma.instagramAccount.count({ where: { webhookSubscribed: true } }),
      prisma.webhookEvent.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    ]);
    webhook = { subscribedAccounts, lastEventAt: last?.createdAt ?? null };
  }

  return { now, database, redis, worker, queue, expiringTokens, webhook };
}

async function ownerEmails(workspaceId?: string): Promise<string[]> {
  const extra = (process.env.OPS_ALERT_EMAIL ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  try {
    const owners = await prisma.workspaceMember.findMany({
      where: { role: "OWNER", ...(workspaceId ? { workspaceId } : {}) },
      select: { user: { select: { email: true } } },
    });
    return [...new Set([...extra, ...owners.map((o) => o.user.email).filter((e): e is string => Boolean(e))])];
  } catch {
    return extra;
  }
}

type AlertEventPayload = { kind: typeof EVENT_KIND; alertKey: string; workspaceId?: string };

/** Runs every check, mails what is new, records it. Returns a summary for the cron log. */
export async function runHealthAlerts(now = Date.now()) {
  const facts = await gatherFacts(now);
  const problems = buildProblems(facts);
  const sent: string[] = [];
  const errors: string[] = [];

  if (!facts.database.ok) {
    // No database means no dedupe table: dedupe through Redis instead, and mail
    // only the OPS_ALERT_EMAIL fallback since owners cannot be looked up.
    const db = problems.find((p) => p.key === "database")!;
    const first = facts.redis.ok
      ? await getRedisConnection().set("alerts:ops:database", "1", "PX", DEDUPE_MS, "NX").catch(() => null)
      : null;
    if (first === "OK") {
      try {
        await sendMail(await ownerEmails(), db.subject, db.body);
        sent.push(db.key);
      } catch (e) {
        errors.push(`${db.key}: ${e instanceof Error ? e.message : e}`);
      }
    }
    return { checks: facts, problems: problems.map((p) => p.key), sent, skipped: [], recovered: [], errors };
  }

  const events = await prisma.operationalEvent.findMany({
    where: { source: "SYSTEM", resolvedAt: null, payload: { path: ["kind"], equals: EVENT_KIND } },
    select: { id: true, payload: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const open = new Map<string, OpenAlert & { ids: string[]; workspaceId?: string }>();
  for (const e of events) {
    const payload = e.payload as AlertEventPayload;
    const o = open.get(payload.alertKey);
    if (o) o.ids.push(e.id);
    else open.set(payload.alertKey, { key: payload.alertKey, lastSentAt: e.createdAt.getTime(), ids: [e.id], workspaceId: payload.workspaceId });
  }

  const { send, skipped, recovered } = decideAlerts(problems, [...open.values()], now);

  for (const p of send) {
    try {
      await sendMail(await ownerEmails(p.workspaceId), p.subject, p.body);
      await prisma.operationalEvent.create({
        data: {
          source: "SYSTEM",
          level: p.severity === "error" ? "ERROR" : p.severity === "warning" ? "WARNING" : "INFO",
          message: p.subject,
          workspaceId: p.workspaceId ?? null,
          payload: { kind: EVENT_KIND, alertKey: p.key, ...(p.workspaceId ? { workspaceId: p.workspaceId } : {}) },
        },
      });
      sent.push(p.key);
    } catch (e) {
      errors.push(`${p.key}: ${e instanceof Error ? e.message : e}`);
    }
  }

  for (const key of recovered) {
    const o = open.get(key)!;
    try {
      await sendMail(
        await ownerEmails(o.workspaceId),
        `[OpenReply] Recovered: ${key}`,
        `The problem "${key}" alerted earlier is no longer detected as of ${new Date(now).toISOString()}.`
      );
      await prisma.operationalEvent.updateMany({ where: { id: { in: o.ids } }, data: { resolvedAt: new Date(now) } });
    } catch (e) {
      errors.push(`recovered ${key}: ${e instanceof Error ? e.message : e}`);
    }
  }

  return { checks: facts, problems: problems.map((p) => p.key), sent, skipped, recovered, errors };
}
