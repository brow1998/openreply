# OpenReply on the house Dokploy: operations runbook

Production: https://reply.useshelfie.com (a fork of `diwenne/openreply`, kept at
`brow1998/openreply`). One Dokploy **Compose** resource runs everything from
`docker-compose.prod.yml`: `web`, `worker`, `cron`, `postgres`, `redis`, `mail`
(private Postfix relay), `dkim-chave` (one-shot) and `db-backup-cron`.

No secret lives in this repository (it is public). Secrets are in a sops vault
on the maintainer's machine (`secrets/prod.env.sops`, gitignored) and in the
Dokploy resource's Environment tab; **the two must be kept in step by hand**.

## Deploy

A push to `main` does **not** deploy by itself: this resource has no GitHub App
or webhook. After pushing, trigger the deploy through the Dokploy API
(`compose.deploy`, with the compose id of the `openreply` project) or the
**Deploy** button in the panel. The container is rebuilt in about 4 minutes; the
site is unavailable for a few seconds while `web` is replaced.

`web` runs `prisma migrate deploy` before it starts, so a migration ships with
the code. Write migrations additive (new table or nullable column), because they
run against live data with no maintenance window.

Check after a deploy:
- `GET /api/health` returns `{"status":"ok"}` with database, redis, queue and worker.
- `docker logs <web>` shows "All migrations have been successfully applied".

## Meta app (Instagram)

OpenReply uses **Instagram API with Instagram Login**, which new Meta apps no
longer offer, so it runs on the existing **Pedro** app (id `3554568898033114`).
That app also serves Pedro, so changes to its settings, permissions or
publication status affect both. What is configured on it for OpenReply:
- OAuth redirect `https://reply.useshelfie.com/api/instagram/callback`.
- Webhook `https://reply.useshelfie.com/api/webhook` with `comments` and
  `messages`; its verify token is `WEBHOOK_VERIFY_TOKEN`.
- Testers (Instagram roles) are the only accounts that can connect while the
  app has Standard Access.
- `FACEBOOK_APP_ID`, `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`,
  `FACEBOOK_APP_SECRET` come from that app (Settings > Basic, and the Instagram
  API setup page).

Limits that no setting removes: comments cannot be liked through the API,
public comment replies are text only (GIFs go as a private reply), posts you
are only a collaborator on are not listed, and a contact's profile photo is
available only for a few hours after they write (it is captured when the message
arrives, into `ContactProfile`).

## Backups

`db-backup-cron` dumps Postgres (custom format) 5 minutes after it starts and
then every 24 hours, keeps 14 days on the `backups` volume, and copies each dump
to `BACKUP_REMOTE` (default `r2:shelfie-backups/openreply`, using the rclone
config at `/root/openreply/rclone/rclone.conf` on the VPS, owner-only).

Restore into a scratch database first and **check the policies/rows before
pointing the app at it**:

```bash
# list what exists
rclone lsl r2:shelfie-backups/openreply
# restore a dump into a new database
docker exec -i <postgres-container> createdb -U openreply openreply_restore
docker exec -i <postgres-container> pg_restore -U openreply -d openreply_restore < DUMP.dump
docker exec <postgres-container> psql -U openreply -d openreply_restore -Atc 'select count(*) from "InstagramAccount"'
```

## Alerts

Every 15 minutes the `cron` service calls `/api/cron/health-alert`, which mails
the workspace owners (and `OPS_ALERT_EMAIL`, default `ALLOWED_EMAILS`) once per
problem per 12 hours, and again when it recovers. Details and thresholds:
[docs/ops-alerts.md](ops-alerts.md).

## Sign-in

Only addresses in `ALLOWED_EMAILS` can request a magic link, **plus** any address
with a pending, unexpired workspace invitation (so invitees can accept).
Everyone else sees Auth.js "Access Denied".

## Common problems

- **Campaigns stopped answering, no error:** check `/api/health` (worker
  heartbeat) and the alert emails. The usual causes are a dead worker, an
  expired Instagram token (the `cron` refreshes them daily) or the webhook not
  being delivered (Meta app not Live, or the verify token changed).
- **Sign-in link never arrives:** check the `mail` container logs; the relay
  signs with the `pulse` DKIM selector for `useshelfie.com`.
- **Build fails on a test file:** the Docker build type-checks `__tests__/`, so
  delete a test in the same commit as the code it imports.
