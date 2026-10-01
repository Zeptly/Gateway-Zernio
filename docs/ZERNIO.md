# Zernio specifics

Provider authority: <https://docs.zernio.com/> (OpenAPI 3.1, API version **1.181.0** at the time of writing, `GET https://docs.zernio.com/api/openapi`). Base URL `https://zernio.com/api`, Bearer API key. Behaviour below was read from that spec; **none of it has been exercised against the live service** from this repository.

## Mapping

| Gateway concept | Zernio |
| --- | --- |
| Workspace | One **profile**, named `ZERNIO_PROFILE_PREFIX + <opaque tenant ref>` (`POST /v1/profiles`, names unique per team; duplicate → 409 `details.existingProfileId`). Zeptly's workspace id is never sent |
| Channel | Platform slug (`linkedin`, `instagram`, `facebook`, `threads`, `tiktok`, `pinterest`, `youtube`, `bluesky`) plus canonical `x`, which Zernio calls `twitter` (mapped only in `zernio-client/src/vocabulary.ts`) |
| X account limits | 280 characters unless the account reports a higher ceiling (X Premium: up to 25,000); checked in the adapter before any create call and never truncated. The metadata field names read for the ceiling (`maxPostChars`, `max_post_chars`, `tier`) are **unverified** against live data |
| Connection / provider account | A Zernio **account** (`GET /v1/accounts?profileId=`), `_id` stored only in `provider_accounts.external_id` |
| OAuth provisioning | `GET /v1/connect/{platform}?profileId&redirect_url` → `authUrl`; after consent Zernio creates the account and redirects to `redirect_url?connected&profileId&accountId&username` (see [SECURITY.md](SECURITY.md)) |
| Bluesky | `POST /v1/connect/bluesky/credentials` (`identifier`, `appPassword`, `state = {userId}-{profileId}`, `userId` from `GET /v1/users`) |
| Publish | `POST /v1/posts` with `publishNow: true` (synchronous; per-platform results in the response) |
| Schedule | `POST /v1/posts` with `scheduledFor` + `timezone: "UTC"`. No scheduling horizon is documented, so there is no rolling hand-off |
| Cancel / delete | `DELETE /v1/posts/{id}` (any status except `published`) |
| Unpublish (remove a published post from the network) | `POST /v1/posts/{id}/unpublish` body `{platform, accountId?}`; not supported for instagram, tiktok, snapchat (refused before any request). Gateway route: `POST /v1/social/publishing/posts/{id}/unpublish` |
| Idempotency | `Idempotency-Key` on `POST /v1/posts` (24 h, key-only match, replay → 200 + original post; in flight → 409 `idempotency_conflict` + `Retry-After`) and on `POST /v1/profiles` |
| Content dedup | Zernio rejects identical content to the same account within 24 h (409 `existingPostId`): surfaced as a definitive, non-retryable conflict |
| Webhooks | `X-Zernio-Signature` = lowercase hex HMAC-SHA256 of the raw body; `X-Zernio-Event-Id`/payload `id` is the stable dedupe key. Used: `post.platform.published`, `post.platform.failed`, `account.disconnected` (unintentional → `reauthorization_required`), `webhook.test`. Everything else is acknowledged and ignored |
| Rate limits | 60/600/1200 requests per minute by connected-account count; `429` with `Retry-After`. Honoured up to 10 s inside the client, otherwise handed back to job-level retry |

## Capabilities served

`social.publishing@1`, `social.scheduling@1` only. Direct media upload and in-place post edit are not implemented (`supportsPostUpdate = false`); media is referenced by public HTTPS URL and ingested by Zernio at publish time.

## Open items

1. **Live validation of everything above** (see [RUNBOOK.md](RUNBOOK.md#first-live-validation-not-yet-executed)).
2. The per-network constraints in `packages/adapters/social-publishing/src/zernio/networks.ts` are carried over from the Outstand catalog and are marked *provisional*; re-verify against Zernio's per-platform schemas.
3. `platformSpecificData` option mapping: options are forwarded verbatim; no Zernio-side option names have been verified.
4. Redirect-parameter and `account` payload field names for `post.platform.*` events follow the spec but are parsed tolerantly; confirm on first live delivery.
5. Zernio's account `status`/`needsReconnection` semantics drive `reauthorization_required` through reconciliation only; no live check.
6. Pagination of `GET /v1/accounts` and `GET /v1/profiles` is not implemented (the spec returns all when `page`/`limit` are omitted).
7. Analytics (`social.analytics.basic@1`) is a candidate next slice (`GET /v1/analytics`); not started.


## Authorisation lifecycle (persistence and wake-up)

- **Zernio refreshes tokens itself**; when a refresh cannot recover an account the provider call returns `401 … Token expired or revoked`
  (`TOKEN_EXPIRED`) and the account must be re-authorised. `GET /v1/accounts` keeps such an account `isActive: true`, so listing alone cannot see it.
- **Detection.** `ZernioAccountPort.listAccounts` also reads `GET /v1/accounts/health` (best effort: a failing health call never downgrades an account). Documented shape: `{ summary:{total,healthy,warning,error,needsReconnect}, accounts:[{accountId,platform,username,status,canPost,canFetchAnalytics,tokenValid,needsReconnect,issues}] }`; the per-account endpoint `GET /v1/accounts/{accountId}/health` adds `tokenStatus:{valid,expiresAt,expiresIn,needsRefresh}`, `permissions` and `recommendations`. **Only explicit token signals flip a connection** (`needsReconnect=true`, `tokenValid=false`, `tokenStatus.valid=false`); `status` (healthy|warning|error), `canPost` and `issues` are recorded in the connection's status reason as evidence but never infer a dead token (an `error` can be a missing permission). Unrecognised shapes read as healthy.
  `reconcile_connections` runs every 10 minutes (X access tokens live ~2 h) and flips a dead account to `reauthorization_required`.
  An `account.disconnected` (unintentional) webhook does the same immediately.
- **Fail closed, with a precise error.** A provider `401/403` on publish or unpublish flags the connection `reauthorization_required` and returns
  `REAUTHORIZATION_REQUIRED` (409) instead of the generic "provider rejected this gateway's credentials". Later dispatches are blocked with the same code.
- **One-click wake-up.** `POST /v1/connections/{id}/reconnect` calls `GET /v1/connect/{platform}?reconnectAccountId=<account>` (Zernio's safe reconnect):
  the SAME account is refreshed, the connection id and every post/mapping stay attached, and a login that lands on a different account is rejected by Zernio
  (`reconnect_account_mismatch`). A `disconnected` connection (account deleted) is reconnected as a new account instead. Completing the callback restores `connected`;
  reconcile deliberately does not "heal" the status on its own.
- **Scopes.** The gateway passes no scope list to Zernio; Zernio documents the X scopes it requests as `tweet.read, tweet.write, users.read, offline.access, media.write`
  (`offline.access` is what yields a refresh token). Whether a given account holds a refresh token is only visible in Zernio's account health, not in our data.


### Open item: the X token lapse (2026-10-01) — root cause NOT CONFIRMED
- No live account-health capture was taken at the time of failure; the real response for the X account in our environment has NOT been verified.
- Do not infer expired token, revoked token, missing scope, plan limit or provider-side disconnect without live evidence. The only direct evidence is Zernio's `401 Token expired or revoked for twitter. Please reconnect your account.` on `POST /v1/posts/{id}/unpublish`.
- Zernio documents `account.disconnected` webhooks with `disconnectionType` intentional vs unintentional (the latter covers expiry/revocation); the gateway did not log event types at the time.

### Live-test protocol: health snapshots (read-only, add to every Zernio live connection test)
```
before publish:   GET /v1/accounts/{accountId}/health
after publish:    GET /v1/accounts/{accountId}/health
on any 401/403:   GET /v1/accounts/{accountId}/health  and  GET /v1/accounts/health
```
Record, per snapshot: `status`, `tokenStatus.valid/expiresAt/needsRefresh`, `permissions.canPost/canFetchAnalytics/missingRequired`, `issues`, `recommendations` (no tokens). This separates: token invalid/expired; reconnect required; posting permission missing; analytics permission missing; account-level warning/error; and a provider-side disconnect (cross-check the `account.disconnected` delivery log). Since this change, a reconcile that flips a connection also stores the health evidence it saw in the connection's `status_reason`.
