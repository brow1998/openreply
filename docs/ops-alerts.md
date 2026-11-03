# Operational alerts

`scripts/cron.sh` calls `/api/cron/health-alert` every 15 minutes. The route
(`lib/ops/alerts.ts`) checks the system and emails the workspace owners, through
the same transport as the magic link (`EMAIL_SERVER` or Resend).

| Key | Fires when | Severity |
| --- | --- | --- |
| `database` | `SELECT 1` fails | error |
| `redis` | Redis `PING` fails | error |
| `worker` | no worker heartbeat, or older than 2 minutes | error |
| `queue-stuck` | ≥ 25 jobs waiting (`HEALTH_STUCK_QUEUE_WAITING`) and none active | error |
| `queue-failures` | ≥ 10 failed jobs in the last hour | warning |
| `token:<account>` | an Instagram token expires within 5 days (refresh should have renewed it) | error |
| `webhook-silence` | subscribed accounts exist but no webhook in 48 hours | info |

- Each key mails at most once every 12 hours while it lasts, and once more as
  "Recovered" when it clears. Sent alerts are `OperationalEvent` rows with
  `source = SYSTEM` and `payload.kind = "ops-alert"`; recovery sets `resolvedAt`.
- Token alerts go to the owners of that account's workspace; the rest go to
  every owner.
- `OPS_ALERT_EMAIL` (optional, comma separated) is always added. It is the only
  recipient when Postgres is down, since owners cannot be looked up then; that
  alert is deduped in Redis (`alerts:ops:database`).
- Run it by hand: `curl -H "Authorization: Bearer $CRON_SECRET" http://web:3000/api/cron/health-alert`.
