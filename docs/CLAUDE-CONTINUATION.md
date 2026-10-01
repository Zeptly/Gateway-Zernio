# Gateway-Zernio — handoff (2026-10-01)

**NOT RELEASE-FROZEN: API deployment drift requires reconciliation before Zeptly staging integration.**

No secret values are recorded here, only variable names.

Evidence labels used below:

- **USER-SUPPLIED VALIDATION EVIDENCE**: reported by the owner from the verification run; not independently recoverable by the session that wrote this file.
- **RAILWAY-OBSERVED**: read directly from Railway configuration, deployment metadata or logs by the writing session.
- **NOT ESTABLISHED**: could not be confirmed; deliberately not guessed or reconstructed.

## 0. Remaining action that gates everything else

> **Before Zeptly staging integration, reconcile the Gateway-Zernio API deployment so that API and Worker are both demonstrably on the approved release SHA (`0c88006216eb3c82fb52a18520ec495b4fe7ab54`), OR explicitly review and approve the newer API commit (`4254506`) as a new release candidate.**
> Do not present the gateway as fully release-frozen until this is resolved. Do not unpin `0c88006`. Do not create a release tag yet.

## 1. Source / documentation state (repository lineage)

| Ref | Meaning |
| --- | --- |
| `0c88006216eb3c82fb52a18520ec495b4fe7ab54` | The accepted release line: "CI: also run on claude/** branches". Approved release SHA. |
| `origin/docs/zeptly-secret-setup` (`dba40af`) | `0c88006` + README only. |
| `claude/dreamy-lovelace-yv6otk` (this handoff branch) | Descends from the accepted `0c88006` line via `dba40af`, plus this documentation change only. Code is byte-identical to `0c88006`. Railway does not track this branch. |
| `claude/funny-allen-b47ffl` head `4254506689ad2a0bfd27ebbac97d138bad47e220` | The Railway-tracked branch's moved head: adapter-isolation guard + a Gateway Contract description edit. **Not the accepted release SHA.** |

The repository lineage says nothing about what is running. Section 2 is the runtime state.

## 2. Deployed runtime state (Railway production, project "Zeptly Zernio Gateway" `842e919e-e5a7-4473-b2ae-26890e222fbe`, region `ams`)

| Service | Configured source pin (RAILWAY-OBSERVED) | Latest deployment metadata (RAILWAY-OBSERVED) | Runtime state |
| --- | --- | --- | --- |
| **Worker** | `Zeptly/Gateway-Zernio`, branch `claude/funny-allen-b47ffl`, `commitSha` `0c88006…` | Deployment `03384713-86e2-4f43-97a8-bc26f1fb1f0a`, 2026-10-01T10:36:25Z, SUCCESS, commit `0c88006216eb3c82fb52a18520ec495b4fe7ab54` | Running exact `0c88006`. |
| **API** | `Zeptly/Gateway-Zernio`, branch `claude/funny-allen-b47ffl`, `commitSha` `0c88006…` | Deployment `339a7e3e-0431-4c3c-9536-14091c65f04f`, 2026-10-01T11:25:40Z, SUCCESS, commit **`4254506689ad2a0bfd27ebbac97d138bad47e220`** | **DEPLOYMENT DRIFT — REQUIRES RECONCILIATION** |
| Postgres | n/a | `ghcr.io/railwayapp-templates/postgres-ssl:18`, SUCCESS | Running; volume `postgres-volume`. |

API deployment history (RAILWAY-OBSERVED): `05d6a345…` at `4254506` (10:34Z, REMOVED) → `32c36f3e…` at `0c88006` (10:36Z, REMOVED at 11:26Z when replaced) → **`339a7e3e…` at `4254506` (11:25Z, SUCCESS, currently serving)**.

**Gateway-Zernio must NOT be described as presently deployed entirely at `0c88006`.** The configured pin says `0c88006` but the actively serving API deployment's metadata says `4254506`. The actively serving API deployment has not been positively identified: the public API is not reachable from the writing session's sandbox (proxy 403), and no endpoint exposes the build SHA. Positive identification requires the Railway dashboard (open deployment `339a7e3e`, read the commit and the image/snapshot) or an authenticated runtime check of the contract hash (Section 3).

### Why `4254506` must not be silently accepted as equivalent
`4254506` changes the frozen contract/OpenAPI hashes relative to `0c88006` (only a description string changed in `packages/gateway-contract/src/gateway.ts`, `"outstand"` → `"acme-social"` in a `.describe()` example, but the hashes are what Zeptly pins against):

| Artifact | `0c88006` (approved) | `4254506` |
| --- | --- | --- |
| `gateway-contract@1` sha256 | `6541d557a4af52888b63567d1a3fcfe73044090771f7b1a3f3b15556ac96c324` | `3134ad65217cfb42266d8ac920616659e5d21bae2760485b209e79c3c10fdc4c` |
| `openapi/openapi.sha256` | `4b56ee1603633ec1b34e77a9ba92024cc66c2ade69920c36970679f6145c6aa8` | `74273a936d40f2e10ce596d180de97d458b06a0817dcd773f23cd3edbf85a880` |
| `social.publishing@1+social.scheduling@1` sha256 | `7d6b471ac5b811835b17781eec441f8d8ca771e95af3537b660a52291bdc2cae` | unchanged in the lock diff |

`4254506` also adds `packages/gateway-core/test/adapter-isolation.test.ts` and regenerates `contracts.lock.json` and `openapi/openapi.json`. If it is to be accepted, it must be reviewed and approved as a **new release candidate** (re-verified, contract change reviewed, Gateway-Outstand/MVP contract hash checks reconciled), not treated as `0c88006`.

### Reconciliation options (human decision)
1. **Return the API to the approved SHA**: in Railway, redeploy the API from the `0c88006` pin (the configured `commitSha`), confirm the new deployment's metadata shows `0c88006`, then confirm both services' latest deployment commit = `0c88006`, and re-run `/health`, `/ready`, `GET /v1/gateway` and one webhook.test.
2. **Approve `4254506` as a new release candidate**: pin both services to it, re-verify criteria A–K against it, regenerate this file's hashes, and update the pin. This also needs the shared-contract hash change reviewed in Zeptly-MVP and Gateway-Outstand.
Either way, record the resulting deployment ids and commits for both services in this file.

## 3. Gateway Contract and capability inventory (at the approved SHA `0c88006`)

- Gateway Contract version: **1** (`GATEWAY_CONTRACT_VERSION = "1"`).
- Gateway/provider id: `zernio` (constant `ZERNIO`), display name "Zernio Gateway".
- Capabilities served, exactly two: `social.publishing` version **1**, `social.scheduling` version **1**.
- Canonical `x` is supported (Zernio's `twitter`, mapped only inside `zernio-client/src/vocabulary.ts`). Canonical channels: linkedin, instagram, facebook, threads, tiktok, pinterest, youtube, bluesky, x.
- Routes: `GET /health`, `GET /ready`, `GET /v1/gateway`, `GET /v1/gateway/health`, `GET /v1/capabilities`, `/v1/connections*`, `/v1/social/publishing/*`, `POST /v1/webhooks/zernio`, `/v1/admin/*` (jobs, webhook-events). Authentication: ZS1-HMAC-SHA256 service signatures (docs/SECURITY.md).
- This inventory is repository-derived at `0c88006`. Because the API runtime is not positively identified, it is **not confirmed that the live API serves exactly these hashes**; a signed `GET /v1/gateway` plus the OpenAPI hash comparison in Section 2 settles that.

## 4. API endpoint

- API base URL (RAILWAY-OBSERVED service domain, port 8080): `https://api-production-c873b.up.railway.app`
- Webhook endpoint path: `POST /v1/webhooks/zernio` → `https://api-production-c873b.up.railway.app/v1/webhooks/zernio`

## 5. USER-SUPPLIED VALIDATION EVIDENCE (not independently recoverable by the writing session)

Reported by the owner as the result of the verification run (criteria A through K independently VERIFIED against commit `0c88006`, Gateway Contract 1, `social.publishing@1` + `social.scheduling@1`, canonical `x` supported):

**Live Zernio authentication — PASS**

| field | value |
| --- | --- |
| result | **PASS** |
| call | `GET v1/profiles` (real Zernio) |
| profileCount | **2** |
| shapeOk | **true** |

**Real Zernio webhook traffic — reported working end-to-end.** Real Zernio `webhook.test` deliveries pass signature verification, persist successfully and are processed by the Worker; a bad signature still returns 401.

The writing session did not re-execute these calls (it holds no Zernio credential) and the transcript scan of the earlier programme session (`session_017Dx1BB…`) contains none of it. Which API commit (`0c88006` or `4254506`) the live webhook/auth results were obtained against is **NOT ESTABLISHED** (see drift).

## 6. RAILWAY-OBSERVED log evidence (writing session)

These are corroborating observations only; they do not substitute for Section 5 and do not identify the API build.

- API `POST /v1/webhooks/zernio`: 10:39:11Z three requests rejected `WEBHOOK_SIGNATURE_INVALID` → 401 (`missing`, `invalid`, `invalid`), then two 200s; 11:22:45Z and 11:23:14Z two `invalid`-signature 401s; after the 11:25:40Z API redeploy, 11:26:18Z, 11:26:38Z, 11:26:52Z → 200.
- Worker `process_webhook` jobs, all `outcome: success`: 10:39:12Z (22 ms), 11:26:19Z (24 ms), 11:26:39Z (21 ms). No Worker job is logged for the 11:26:52Z request (not explained).
- Worker `housekeeping`, `reconcile_connections` and recurring `reconcile_publications` (every 5 min) jobs: success. Worker restarts at 10:34, 10:36 and 10:39Z, each clean (`SIGTERM`, `worker stopped`).
- Health: `GET /health` 200 at 11:26:06Z; `GET /ready` 200 at 10:38, 10:40 and 11:22Z; signed `GET /v1/gateway`, `/v1/gateway/health`, `/v1/capabilities` 200 at 10:38Z. Railway reports the latest deployment of all three services `SUCCESS`.
- The logs cannot show whether a given request was a real Zernio delivery or a signed manual test.

## 7. Prior-session transcript scan (programme session `session_017Dx1BBy8GRisVy7Qy583Zd`)

The scan covered ~2026-10-01T07:05Z–11:34Z of that session; it contains no Railway, Zernio-API, set-variables or webhook.test calls. The earlier hours (2026-09-30T23:36Z–07:05Z) were not paged.

| Question | Status |
| --- | --- |
| Secret exposure (`ZEPTLY_SERVICE_SECRET`, `ZERNIO_WEBHOOK_SECRET`, `ZERNIO_API_KEY`) | **NOT ESTABLISHED** |
| Zernio-side webhook registration state (registered URL, subscribed event types, webhook id) | **NOT ESTABLISHED** |
| Leftover `webhook.test` rows in the gateway database | **NOT ESTABLISHED** |

Nothing here is guessed or reconstructed. For reference only (not evidence of the live registration): the gateway's code and docs/RUNBOOK.md expect an endpoint at `<PUBLIC_BASE_URL>/v1/webhooks/zernio` subscribed to `post.platform.published`, `post.platform.failed`, `account.disconnected`, and the handler also accepts `webhook.test`. **Human action:** read the actual registration from the Zernio dashboard/API and record the URL and event list here.

Database: the writing session had no database access. Row counts for `webhook.test` (or any other table) are therefore not recorded; the admin endpoint `GET /v1/admin/webhook-events?limit=50` (signed) is the way to list them. If rows exist, `webhook.test` events are acknowledged and ignored by the handler; whether to delete them is a human decision (list ids first; no bulk delete). Cleanup requirement: **NOT ESTABLISHED**.

## 8. Not yet tested live

No live account connection, no OAuth provisioning, no publish and no schedule/cancel test has been run. The "First live validation" in docs/RUNBOOK.md is NOT EXECUTED beyond the user-supplied profiles read and webhook.test. `docs/ZERNIO.md` open items 2–7 are unverified.

## 9. Environment variable NAMES (values live only in Railway; never record values)

RAILWAY-OBSERVED, set on **both API and Worker**: `NODE_ENV`, `DATABASE_URL`, `ZEPTLY_SERVICE_SECRET`, `ZERNIO_API_KEY`, `ZERNIO_WEBHOOK_SECRET`, `ZERNIO_API_BASE_URL`, `ZERNIO_PROFILE_PREFIX`, `PUBLIC_BASE_URL`, `ALLOWED_RETURN_URL_ORIGINS`, `LOG_LEVEL`.
Worker additionally: `WORKER_CONCURRENCY`, `WORKER_POLL_INTERVAL_MS`.
Optional, not currently set: `ZEPTLY_SERVICE_SECRET_PREVIOUS` (accepted during rotation), `API_PORT`, `ZERNIO_LIVE_TESTS` (opt-in live suite; never in CI).
Railway-injected (ignore): `RAILWAY_*`.
Secret-bearing: `ZEPTLY_SERVICE_SECRET`, `ZERNIO_WEBHOOK_SECRET`, `ZERNIO_API_KEY`, `DATABASE_URL`.

## 10. Secret hygiene and rotation

- Rotation performed by the writing session: **none**.
- Secret exposure: **NOT ESTABLISHED** (see Section 7). `ZERNIO_API_KEY`: no evidence of exposure; do not rotate it unless exposure is shown.
- Recommendation: rotate `ZEPTLY_SERVICE_SECRET` and `ZERNIO_WEBHOOK_SECRET` before Zeptly staging integration if either was ever pasted into a chat, tool call or terminal log; rotate `ZEPTLY_SERVICE_SECRET` in any case before it is placed in Zeptly staging.
- Not performed by the writing session because: new values would transit its tooling, the Zernio webhook registration cannot be updated without the Zernio API key, and redeploying the services before the API drift is settled would compound the ambiguity.
- Human steps:
  1. `ZEPTLY_SERVICE_SECRET`: generate locally (`openssl rand -base64 48`, no echo). Set `ZEPTLY_SERVICE_SECRET_PREVIOUS` = current value and `ZEPTLY_SERVICE_SECRET` = new value on **both** API and Worker; redeploy both at the approved SHA; give the new value only to Zeptly's secret store; once Zeptly uses it, remove `_PREVIOUS` and redeploy.
  2. `ZERNIO_WEBHOOK_SECRET`: rotate the signing secret in the Zernio webhook registration, set the same value on API and Worker, redeploy both, send one Zernio `webhook.test`, confirm API 200 and Worker `process_webhook success` (expect brief 401s meanwhile; Zernio retries up to 5 times).
  3. After redeploy: `GET /health` 200, `GET /ready` 200, bad signature → 401.

## 11. Remaining human actions (in order)

1. **Reconcile the API deployment drift (Section 0 and 2).** Gating.
2. Record the Zernio-side webhook registration (URL, events, id) from Zernio.
3. Rotate `ZEPTLY_SERVICE_SECRET` / `ZERNIO_WEBHOOK_SECRET` per Section 10.
4. Record actual `webhook.test` row count; decide on cleanup.
5. Do not create a release tag; do not unpin `0c88006`.
6. Supply the Zeptly staging inputs below.

## 12. Next phase: Zeptly staging integration

Run it in a **fresh session with all three repositories available** (Zeptly/zeptly-MVP, Zeptly/Gateway-Outstand, Zeptly/Gateway-Zernio), and only after Section 0 is resolved. Zeptly MVP was not touched by this handoff; no Gateway-Zernio features are to be added in this phase.

Exact inputs the staging session needs:

- Gateway base URL `https://api-production-c873b.up.railway.app`; gateway id `zernio`; Gateway Contract `1`; capabilities `social.publishing@1`, `social.scheduling@1`.
- The reconciled, demonstrably-deployed release SHA for **both** services and the matching `contracts.lock.json` / `openapi.sha256` values (the Section 2 hashes if `0c88006`).
- Zeptly staging environment name / `ZEPTLY_ENVIRONMENT` value and the staging Supabase project ref (never production `ikynpepqqxbmipesxjqh`).
- The gateway service secret delivered out-of-band into Zeptly staging config as `ZEPTLY_GATEWAY_*_SECRET` (exact suffix per `docs/provider-gateways/ROLLOUT.md` in zeptly-MVP), after any rotation; never in chat or git.
- A dedicated test social account and workspace id for the first live connect/publish/schedule validation, and explicit authorisation before any live publish.
- Confirmation that Gateway-Outstand production must not be mutated without explicit approval.
- The Zeptly staging origin to include in `ALLOWED_RETURN_URL_ORIGINS` (current Railway value is not recorded here).

## Earlier checkpoints (historical; statements that nothing is deployed/live are superseded by the sections above)


No secrets are recorded here.

### State
| Repo | Branch | SHA | PR |
| --- | --- | --- | --- |
| Zeptly/zeptly-MVP | claude/funny-allen-b47ffl | 52b6479f | #9 (draft) |
| Zeptly/Gateway-Outstand | claude/funny-allen-b47ffl | 13a0065 | #1 (draft, base claude/zen-babbage-y7g3sy) |
| Zeptly/Gateway-Zernio | claude/funny-allen-b47ffl | 76df5e3 | none: the repo has no other branch to merge into; create a `main` first |

### Evidence (all automated/mocked; nothing live, nothing deployed)
- Outstand: lint, typecheck, 181 tests, build, openapi:check, zs1:check green (local Postgres 16).
- Zernio: lint, typecheck, 115 tests, build, openapi:check, zs1:check, db:check green. Docker image build NOT run.
- MVP: vitest provider-gateway (25) + architecture (13) + Cortex (41) green; Deno boundary (19) and social-capability-invoke (8) green; deno check of new files green; migration applied to a scratch Postgres with stubbed dependencies only. 7 vitest failures and Deno tenant-isolation/rls-regression failures are pre-existing (identical on main).

### Success criteria status
A met (tests in both gateways). B met (architecture tests; one sanctioned doc example). C **partial**: no Outstand call; 31 direct-Zernio files remain (ratcheted). D **partial**: canonical path implemented and tested with doubles; not wired into draft-approve; no implementation seeded. E met against a test double only. F met. G met (guard tests). H met for what exists; real-DB migration and Docker not run. I met (ROLLOUT, ADR, AUDIT).

### Human-only blockers / decisions
1. X/Twitter is not in Social Publishing Contract v1; draft-approve (X only) cannot migrate until `x` is added additively to the frozen contract in both gateways.
2. Deploy Gateway-Zernio (own Railway project/DB/secret), set ZERNIO_API_KEY + webhook secret, run its "First live validation". Not authorised/possible from here.
3. Apply the Zeptly migration to staging, set ZEPTLY_ENVIRONMENT and ZEPTLY_GATEWAY_*_SECRET, register gateways, bind implementations (docs/provider-gateways/ROLLOUT.md). Zeptly production/staging/dev identifiers were not supplied.
4. Python orchestrator still has the stale SendIt/Outstand boundary (AUDIT.md, Open).
5. Gateway-Outstand production (Railway) must not be mutated without explicit approval.

### Next tasks
- Wire gateway post state back into scheduled_posts/publish_attempts; migrate draft-approve once `x` exists.
- Gateway-Zernio: analytics slice, pagination, verify provisional network constraints, live validation.
- Extract shared gateway-contract/core into a package (docs/SHARED-CODE.md in Gateway-Zernio).
- Commands: `pnpm check` in each gateway (needs Postgres; TEST_DATABASE_URL); in MVP `npx vitest run src/test/provider-gateway*.test.ts`, `deno test --no-check -A supabase/functions/_shared/connector-boundary.test.ts supabase/functions/social-capability-invoke/index.test.ts`.

### Update — canonical `x` and MVP routing checkpoint
Canonical `x` is in the shared social contract (hashes/OpenAPI/vectors regenerated). MVP routes by gateway-qualified connection (zeptly-mvp `claude/funny-allen-b47ffl` @ 2533751a). Docker CI job and everything deployed/live remain unexecuted (PENDING_INFRASTRUCTURE). Human-gated next steps: deploy (Outstand redeploy after contract change; Zernio first deploy with env-only secrets), then the live draft-approve/X slice.
