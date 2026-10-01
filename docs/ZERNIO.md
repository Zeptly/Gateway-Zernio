# Zernio specifics

Provider authority: <https://docs.zernio.com/> (OpenAPI 3.1, API version **1.181.0** at the time of writing, `GET https://docs.zernio.com/api/openapi`). Base URL `https://zernio.com/api`, Bearer API key. Behaviour below was read from that spec; **none of it has been exercised against the live service** from this repository.

## Mapping

| Gateway concept | Zernio |
| --- | --- |
| Workspace | One **profile**, named `ZERNIO_PROFILE_PREFIX + <opaque tenant ref>` (`POST /v1/profiles`, names unique per team; duplicate → 409 `details.existingProfileId`). Zeptly's workspace id is never sent |
| Channel | Platform slug (`linkedin`, `instagram`, `facebook`, `threads`, `tiktok`, `pinterest`, `youtube`, `bluesky`) |
| Connection / provider account | A Zernio **account** (`GET /v1/accounts?profileId=`), `_id` stored only in `provider_accounts.external_id` |
| OAuth provisioning | `GET /v1/connect/{platform}?profileId&redirect_url` → `authUrl`; after consent Zernio creates the account and redirects to `redirect_url?connected&profileId&accountId&username` (see [SECURITY.md](SECURITY.md)) |
| Bluesky | `POST /v1/connect/bluesky/credentials` (`identifier`, `appPassword`, `state = {userId}-{profileId}`, `userId` from `GET /v1/users`) |
| Publish | `POST /v1/posts` with `publishNow: true` (synchronous; per-platform results in the response) |
| Schedule | `POST /v1/posts` with `scheduledFor` + `timezone: "UTC"`. No scheduling horizon is documented, so there is no rolling hand-off |
| Cancel / delete | `DELETE /v1/posts/{id}` (any status except `published`) |
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
