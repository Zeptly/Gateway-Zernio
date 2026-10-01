# Runbook

## Signals

| Signal | Where | Healthy |
| --- | --- | --- |
| API liveness/readiness | `GET /health`, `GET /ready` | 200 / `ready` |
| Worker liveness | `worker_heartbeats.last_beat_at`; logs `job completed` | updated every few seconds |
| Dead letters | `GET /v1/admin/jobs?status=dead` | empty |
| Webhook failures | `GET /v1/admin/webhook-events?status=failed` | empty |
| Publications stuck | SQL below | none |

Every log line is JSON and carries `service`. Request logs carry `reqId`, `workspaceId` and `caller`. Provider calls log `provider`, `method`, `path`, `status`, `latencyMs`, `requestId` and `rateLimitRemaining`. Jobs log `jobType`, `jobId`, `attempt`, `outcome` and `latencyMs`.

## Common operations

Use the signed-request CLI: `ZS_BASE_URL=… ZEPTLY_SERVICE_SECRET=… pnpm zs <METHOD> <path> [json] [--idem] [--no-workspace]`.

- **Retry a dead job.** `pnpm zs POST /v1/admin/jobs/<id>/retry --no-workspace`
- **Reconcile after an incident or provider outage.** `pnpm zs POST /v1/admin/reconcile --no-workspace` enqueues publication and connection reconciliation for all workspaces.
- **Reconcile one post.** `ZS_WORKSPACE=<ws> pnpm zs POST /v1/social/publishing/posts/<id>/reconcile`
- **Reconcile one workspace's connections.** `ZS_WORKSPACE=<ws> pnpm zs POST /v1/connections/reconcile`

## Diagnosis queries

```sql
-- publications waiting for, or stuck in, hand-off
select id, workspace_id, status, publish_at, attempts, next_attempt_at, last_error_code, last_error
from social_publications where status in ('pending','retry_pending','dispatching') order by publish_at;

-- accepted by the provider but overdue (webhook missed; reconciliation should fix)
select id, provider_post_id, publish_at, last_reconciled_at from social_publications
where status = 'accepted' and publish_at < now() - interval '15 minutes';

-- ambiguous failures needing manual review (possible provider-side post)
select p.id, p.provider_post_id, p.idempotency_key, t.id as target_id, t.error_message
from social_publications p join social_post_targets t on t.publication_id = p.id
where t.error_code = 'PUBLICATION_STATE_UNKNOWN';

-- connections needing reauthorization
select workspace_id, network, status, status_reason from gateway_connections where status <> 'connected';
```

## Scheduled clean-ups

- **Compatibility view.** The schema carries Gateway-Outstand's `social_connections` view for migration lineage parity; drop it with a new migration in both gateways together. once no previous-release process can be running. Also remove the deprecated HTTP aliases in the next major release ([API.md](API.md#breaking-changes-gateway-refactor)), after confirming from request logs that Zeptly no longer calls the legacy paths (`/v1/posts`, `/v1/media`, `/v1/networks`, `/v1/metrics`, `/v1/conversations`).

## Incident playbooks

- **`PUBLICATION_STATE_UNKNOWN`.** The provider may have accepted the post, but the service could not confirm within Zernio's 24 h idempotency window. Search the Zernio dashboard for posts on that account around `publish_at`. If the post exists, record the outcome. If it does not, Zeptly can create a new post; the old one is terminal.
- **Many `PROVIDER_UNAVAILABLE`/`RATE_LIMITED` errors.** Publications back off (1 m, 5 m, 15 m, 1 h, 3 h; at most 5 attempts). When Zernio recovers, run the global reconcile. Publications that exhausted their attempts are `failed` and need a new publish from Zeptly.
- **Webhook 401s.** The signing secret is out of sync. Re-copy it from Zernio into `ZERNIO_WEBHOOK_SECRET` on both services. Zernio retries deliveries (up to 5), and periodic reconciliation covers anything missed.
- **Worker down.** Scheduled hand-offs and webhook processing pause, and nothing is lost: all state lives in PostgreSQL. Restart it. Stale claims are recovered after 10 minutes.
- **Secret leak.** Rotate using [SECURITY.md → Key rotation](SECURITY.md#key-rotation).

## First live validation (NOT YET EXECUTED)

Nothing in this repository has been validated against the live Zernio API. Do this once, with a **dedicated test social account**, before any Zeptly workspace is pointed at this gateway. Record each result as *live provider validation*, *deployed-infrastructure validation*, *automated/mocked test* or *not validated*.

Prerequisites: API and worker deployed ([RAILWAY.md](RAILWAY.md)), `ZERNIO_API_KEY` and `ZERNIO_WEBHOOK_SECRET` set in Railway (never in the repository), and a Zernio webhook endpoint registered for `<PUBLIC_BASE_URL>/v1/webhooks/zernio` subscribed to `post.platform.published`, `post.platform.failed` and `account.disconnected`.

```bash
export ZS_BASE_URL=https://<api-domain>; export ZEPTLY_SERVICE_SECRET='<read from Railway; never echo>'
export ZS_WORKSPACE=ws_live_validation
pnpm zs GET /v1/gateway --no-workspace
pnpm zs POST /v1/connections '{"channel":"linkedin","returnUrl":"https://<allow-listed origin>/return"}'   # open provisioning.authorizationUrl
pnpm zs GET /v1/connections
pnpm zs POST /v1/social/publishing/posts '{"content":{"text":"Zernio gateway validation"},"targets":[{"connectionId":"<cid>"}]}' --idem
pnpm zs POST /v1/social/publishing/posts/<id>/schedule '{"scheduledAt":"<now+10min ISO>"}' --idem      # then cancel; prefer schedule-then-cancel over a public post
pnpm zs POST /v1/social/publishing/posts/<id>/cancel --idem
```

Checks to record: profile created with the opaque name (no Zeptly workspace id); redirect carries `profileId`/`accountId`; account adopted only for the right workspace; Idempotency-Key replay returns the original post; `post.platform.*` webhooks arrive with a valid `X-Zernio-Signature`; rate-limit headers; the open items in [ZERNIO.md](ZERNIO.md#open-items).
