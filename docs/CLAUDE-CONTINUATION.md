# Gateway-Zernio — handoff (2026-10-01)

**STATUS: proposed release candidate RC1 = `4254506` reviewed clean; Worker aligned to it; API pin still to be aligned; NOT YET RELEASE-FROZEN.**

No secret values are recorded here, only variable names.

Evidence labels used below:

- **USER-SUPPLIED VALIDATION EVIDENCE**: reported by the owner from the verification run; not independently recoverable by the session that wrote this file.
- **RAILWAY-OBSERVED**: read directly from Railway configuration, deployment metadata or logs by the writing session.
- **CI-OBSERVED**: read from GitHub Actions results for an exact SHA.
- **NOT ESTABLISHED**: could not be confirmed; deliberately not guessed or reconstructed.

## 0. Remaining actions that gate Zeptly staging integration

1. **Align the API's configured source pin to `4254506`** (currently still `0c88006` while the serving deployment's metadata says `4254506`). One step, owner go-ahead pending: `connect-service-source` on the API with repo `Zeptly/Gateway-Zernio`, branch `claude/funny-allen-b47ffl`, `commitSha 4254506689ad2a0bfd27ebbac97d138bad47e220`. It triggers a rebuild/restart of the API from the pinned SHA (same code; no migrations differ), after which API and Worker both show `4254506` in config **and** deployment metadata.
2. **Live revalidation of RC1** (Section 6B): signed `GET /v1/gateway` returning the RC1 contract hash, live bad-signature 401, one fresh Zernio `webhook.test` → API 200 + Worker `process_webhook` success. These need a service secret or the Zernio dashboard and cannot be done by the writing session.
3. Owner sign-off of RC1 as the release, then the canonical-main plan (Section 13). Do not create a release tag until 1–3 are done.

> Do not present the gateway as fully release-frozen until items 1 and 2 are recorded here. Never "deploy latest": keep both services pinned to an exact SHA.

## 1. Source / documentation state (repository lineage)

| Ref | Meaning |
| --- | --- |
| `main` (`594af31`) | "Initial commit" (README only). Not yet a canonical release line. |
| `0c88006216eb3c82fb52a18520ec495b4fe7ab54` | Previously accepted/owner-verified line. Superseded as the proposed release by RC1. Remains reachable from `claude/funny-allen-b47ffl`. |
| **`4254506689ad2a0bfd27ebbac97d138bad47e220`** | **RC1.** Head of `claude/funny-allen-b47ffl`; linear descendant of `0c88006`. |
| `origin/docs/zeptly-secret-setup` (`dba40af`) | `0c88006` + README only (sibling of RC1, not a descendant). |
| `claude/dreamy-lovelace-yv6otk` (this handoff branch) | `dba40af` + this documentation. Code is byte-identical to `0c88006`; it does **not** contain RC1's changes. Railway does not track it. PR #1 from this branch must not be merged in its current form (Section 13). |

The repository lineage says nothing about what is running. Section 2 is the runtime state.

## 2. Deployed runtime state (Railway production, project "Zeptly Zernio Gateway" `842e919e-e5a7-4473-b2ae-26890e222fbe`, region `ams`)

| Service | Configured source pin (RAILWAY-OBSERVED) | Latest deployment metadata (RAILWAY-OBSERVED) | State |
| --- | --- | --- | --- |
| **Worker** | `Zeptly/Gateway-Zernio`, branch `claude/funny-allen-b47ffl`, `commitSha` **`4254506689ad2a0bfd27ebbac97d138bad47e220`** (re-pinned 2026-10-01 ~11:46Z on owner instruction after the RC1 review) | Deployment `fb21c9dd-57f6-4b0e-85c9-b5e65624c508`, 11:46:30Z, SUCCESS, commit `4254506…` | Config and deployment both `4254506`. Aligned. |
| **API** | `Zeptly/Gateway-Zernio`, branch `claude/funny-allen-b47ffl`, `commitSha` **`0c88006…`** (unchanged) | Deployment `339a7e3e-0431-4c3c-9536-14091c65f04f`, 11:25:40Z, SUCCESS, commit **`4254506…`** | **DEPLOYMENT DRIFT — REQUIRES RECONCILIATION** (narrowed): serving deployment metadata is RC1 but the configured pin is `0c88006`, so a rebuild from config would silently revert the API. Section 0 item 1. |
| Postgres | n/a | `ghcr.io/railwayapp-templates/postgres-ssl:18`, SUCCESS | Running; volume `postgres-volume`. |

Deployment history (RAILWAY-OBSERVED):
- API: `05d6a345…` @ `4254506` (10:34Z, REMOVED) → `32c36f3e…` @ `0c88006` (10:36Z, REMOVED 11:26Z) → **`339a7e3e…` @ `4254506` (11:25Z, SUCCESS, serving)**.
- Worker: `994dd588…` @ `4254506` (10:34Z, REMOVED) → `03384713…` @ `0c88006` (10:36Z, REMOVED 11:46Z) → **`fb21c9dd…` @ `4254506` (11:46Z, SUCCESS, serving)**.

The serving API build is identified only through Railway's deployment metadata; the public API is not reachable from the writing session's sandbox (proxy 403) and no endpoint exposes the build SHA. A signed `GET /v1/gateway` compared with the RC1 hashes below positively identifies it (Section 6B).

### RC1 review (4254506 vs 0c88006) — result: CLEAN, no blocking findings
Scope of the change (6 files, all reviewed in full):
- `packages/gateway-contract/src/gateway.ts`: one `.describe()` example string, `"outstand"` → `"acme-social"`. No schema shape, regex, enum or version changes.
- `contracts.lock.json`, `openapi/openapi.json`, `openapi/openapi.sha256`: regenerated; the only OpenAPI changes are four occurrences of that same description string.
- `packages/gateway-core/test/adapter-isolation.test.ts`: new, read-only filesystem/regex test (criteria A and B). No runtime code.
- `docs/CLAUDE-CONTINUATION.md`: prose.
- No migrations, no dependency, Dockerfile, workflow or runtime-code changes: the executed code paths are identical to `0c88006`; only generated documentation text and its hashes differ.

| Artifact | `0c88006` | RC1 `4254506` |
| --- | --- | --- |
| `gateway-contract@1` sha256 | `6541d557a4af52888b63567d1a3fcfe73044090771f7b1a3f3b15556ac96c324` | `3134ad65217cfb42266d8ac920616659e5d21bae2760485b209e79c3c10fdc4c` |
| `openapi/openapi.sha256` | `4b56ee1603633ec1b34e77a9ba92024cc66c2ade69920c36970679f6145c6aa8` | `74273a936d40f2e10ce596d180de97d458b06a0817dcd773f23cd3edbf85a880` |
| `social.publishing@1+social.scheduling@1` sha256 | `7d6b471ac5b811835b17781eec441f8d8ca771e95af3537b660a52291bdc2cae` | unchanged |

Cross-repo consistency checks:
- **Gateway-Outstand `claude/funny-allen-b47ffl` @ `0486c72`** carries the same description string and the same `gateway-contract@1` hash `3134ad65…`, and the same `social.publishing@1+social.scheduling@1` hash: the two gateways agree at RC1. (Zernio intentionally omits `social.analytics.basic@1`.)
- **Gateway-Outstand production** is deployed from a different lineage (`claude/zen-babbage-y7g3sy` @ `bc3b60f`, which has no `contracts.lock.json`). Hash comparison with it is not applicable; it was not touched. Its redeploy after the shared-contract change remains a separate, owner-approved action.
- **Zeptly-MVP** contains no references to either `gateway-contract@1` hash or the OpenAPI hashes (searched); nothing there pins the old value.
- **CI-OBSERVED**: workflow "CI" (`check` + `docker`) succeeded on exactly `4254506` (run 36831050529); the same jobs also succeeded on `b9f0b46` (this docs branch, code == `0c88006`).

Caveats: the guard test is heuristic (regex over source) and enforces provider-neutrality only for the listed shared paths; the hash change is a visible contract change even though behaviour is unchanged, so any external consumer that pins the old hash must be updated (none found).

## 3. Gateway Contract and capability inventory (RC1 `4254506`; capabilities identical at `0c88006`)

- Gateway Contract version: **1** (`GATEWAY_CONTRACT_VERSION = "1"`).
- Gateway/provider id: `zernio` (constant `ZERNIO`), display name "Zernio Gateway".
- Capabilities served, exactly two: `social.publishing` version **1**, `social.scheduling` version **1**.
- Canonical `x` is supported (Zernio's `twitter`, mapped only inside `zernio-client/src/vocabulary.ts`). Canonical channels: linkedin, instagram, facebook, threads, tiktok, pinterest, youtube, bluesky, x.
- Routes: `GET /health`, `GET /ready`, `GET /v1/gateway`, `GET /v1/gateway/health`, `GET /v1/capabilities`, `/v1/connections*`, `/v1/social/publishing/*`, `POST /v1/webhooks/zernio`, `/v1/admin/*` (jobs, webhook-events). Authentication: ZS1-HMAC-SHA256 service signatures (docs/SECURITY.md).
- This inventory is repository-derived (identical in `0c88006` and RC1; only the hashes in Section 2 differ). It is **not confirmed that the live API serves exactly RC1's hashes**; the signed check in Section 6B settles that.

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

The writing session did not re-execute these calls (it holds no Zernio credential) and the transcript scan of the earlier programme session (`session_017Dx1BB…`) contains none of it. Per Railway deployment timing, the post-11:25Z real-webhook traffic reached an API deployment whose metadata says `4254506` while the Worker was still on `0c88006`; the earlier auth result's build is **NOT ESTABLISHED**. Neither result has been re-run against RC1 on both services.

## 6. RAILWAY-OBSERVED log evidence (writing session)

These are corroborating observations only; they do not substitute for Section 5 and do not identify the API build.

- API `POST /v1/webhooks/zernio`: 10:39:11Z three requests rejected `WEBHOOK_SIGNATURE_INVALID` → 401 (`missing`, `invalid`, `invalid`), then two 200s; 11:22:45Z and 11:23:14Z two `invalid`-signature 401s; after the 11:25:40Z API redeploy, 11:26:18Z, 11:26:38Z, 11:26:52Z → 200.
- Worker `process_webhook` jobs, all `outcome: success`: 10:39:12Z (22 ms), 11:26:19Z (24 ms), 11:26:39Z (21 ms). No Worker job is logged for the 11:26:52Z request (not explained).
- Worker `housekeeping`, `reconcile_connections` and recurring `reconcile_publications` (every 5 min) jobs: success. Worker restarts at 10:34, 10:36 and 10:39Z, each clean (`SIGTERM`, `worker stopped`).
- Health: `GET /health` 200 at 11:26:06Z; `GET /ready` 200 at 10:38, 10:40 and 11:22Z; signed `GET /v1/gateway`, `/v1/gateway/health`, `/v1/capabilities` 200 at 10:38Z. Railway reports the latest deployment of all three services `SUCCESS`.
- The logs cannot show whether a given request was a real Zernio delivery or a signed manual test.

## 6B. RC1 minimal revalidation (status)

| Check | Status |
| --- | --- |
| RC1 diff reviewed (Section 2) | **Done — clean.** |
| CI on exact `4254506` (lint/typecheck/tests/build/openapi/zs1/db checks + docker) | **Done — CI-OBSERVED success** (run 36831050529). |
| Worker re-pinned and redeployed on RC1 | **Done — RAILWAY-OBSERVED:** deployment `fb21c9dd` SUCCESS; startup log shows pre-deploy `[migrate]` completed with no migrations to apply, then `worker started`. |
| Railway status, all services | **Done:** API, Worker, Postgres latest deployments SUCCESS; no pending/staged changes. |
| Worker job processing after the redeploy | **Pending in logs:** only startup lines were visible at the time of writing (log delivery is batched); re-check that `housekeeping`/`reconcile_*` show `outcome: success` and `process_webhook` still succeeds. |
| API configured pin == serving build | **Open** (Section 0 item 1). |
| Live `GET /v1/gateway` via signed request returns RC1 (compare OpenAPI `description` of `gateway` = `e.g. "acme-social"`, `openapi.sha256` = `74273a93…`) | **NOT DONE** — needs the service secret; the writing session has none and cannot reach the API. |
| Live bad-signature `POST /v1/webhooks/zernio` → 401 | **NOT DONE** (same reason). |
| Fresh Zernio `webhook.test` → API 200 + Worker `process_webhook` success | **NOT DONE** — needs the owner to press "test" in Zernio; the writing session can then read the logs to confirm. |
| `GET /health`, `GET /ready` from outside | **NOT DONE** from the sandbox (Railway healthcheck on `/health` passed for the API deployment). |

Human commands (secrets via env only, never echoed): `ZS_BASE_URL=https://api-production-c873b.up.railway.app pnpm zs GET /v1/gateway --no-workspace`, then send one `webhook.test` from the Zernio dashboard.

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

1. Approve the API pin alignment to RC1 (Section 0 item 1) — or run it yourself — and confirm both services show `4254506` in config and deployment metadata.
2. Run the live revalidation in Section 6B and record the results.
3. Sign off RC1, then execute the canonical-main plan (Section 13).
4. Record the Zernio-side webhook registration (URL, events, id) from Zernio.
5. Rotate `ZEPTLY_SERVICE_SECRET` / `ZERNIO_WEBHOOK_SECRET` per Section 10 (rotating after RC1 is settled avoids stacking an unexplained change).
6. Record actual `webhook.test` row count; decide on cleanup.
7. No release tag until 1–3 are done. Keep both services pinned to an exact SHA.
8. Supply the Zeptly staging inputs below.

## 12. Next phase: Zeptly staging integration

Run it in a **fresh session with all three repositories available** (Zeptly/zeptly-MVP, Zeptly/Gateway-Outstand, Zeptly/Gateway-Zernio), and only after Section 0 items 1–3 are resolved. Zeptly MVP was not touched by this handoff; no Gateway-Zernio features are to be added in this phase.

Exact inputs the staging session needs:

- Gateway base URL `https://api-production-c873b.up.railway.app`; gateway id `zernio`; Gateway Contract `1`; capabilities `social.publishing@1`, `social.scheduling@1`.
- The release SHA demonstrably deployed on **both** services (RC1 `4254506` once Section 0 is done) and its `contracts.lock.json` / `openapi.sha256` values (the Section 2 RC1 column).
- Zeptly staging environment name / `ZEPTLY_ENVIRONMENT` value and the staging Supabase project ref (never production `ikynpepqqxbmipesxjqh`).
- The gateway service secret delivered out-of-band into Zeptly staging config as `ZEPTLY_GATEWAY_*_SECRET` (exact suffix per `docs/provider-gateways/ROLLOUT.md` in zeptly-MVP), after any rotation; never in chat or git.
- A dedicated test social account and workspace id for the first live connect/publish/schedule validation, and explicit authorisation before any live publish.
- Confirmation that Gateway-Outstand production must not be mutated without explicit approval.
- The Zeptly staging origin to include in `ALLOWED_RETURN_URL_ORIGINS` (current Railway value is not recorded here).

## 13. Canonical-main plan (prepared, NOT executed; PR #1 must not be merged as it stands)

Why PR #1 is misleading: `main` is a single README-only "Initial commit", so any PR into it shows the whole repository as new and a "docs" title hides that. Also `claude/dreamy-lovelace-yv6otk` descends from `0c88006`, not RC1, so merging it would put the pre-RC1 contract on `main` and make the Railway-pinned RC1 SHA unreachable from `main`.

Target end state: `main` contains RC1 `4254506` **with its SHA intact** (so Railway pins stay valid) plus the README secret-setup note and this handoff, with Railway still pinned to an exact SHA (never following `main`).

1. **Owner sign-off on RC1** after Section 0 items 1–2 (gate).
2. **Land RC1 on `main` preserving SHAs**: preferably a fast-forward (`main` is an ancestor of `claude/funny-allen-b47ffl`: `git push origin 4254506:refs/heads/main`), or a PR from `claude/funny-allen-b47ffl` titled "Gateway-Zernio v0.1.0 RC1 (4254506): Gateway Contract v1 + social.publishing/scheduling@1" merged with a **merge commit**. **Never squash or rebase-merge**: that rewrites `0c88006`/`4254506` and orphans the deployed pin. Check branch protection first.
3. **Rebuild PR #1 as a small docs PR**: merge (do not rebase or force-push) new `main` into `claude/dreamy-lovelace-yv6otk`, resolving the single expected conflict in `docs/CLAUDE-CONTINUATION.md` by keeping this handoff plus RC1's checkpoint paragraph; `dba40af` (README-only) rides along. Retitle PR #1 "docs: handoff + local secret-setup README", rewrite its description, retarget if needed. Its diff against the new `main` should then be exactly `README.md` and `docs/CLAUDE-CONTINUATION.md`. Verify with `git diff origin/main...HEAD --stat` before un-drafting.
4. **Railway** (separate, deliberate step): once `main` contains RC1, optionally switch both services' source branch from `claude/funny-allen-b47ffl` to `main` **with the same `commitSha`** (`connect-service-source`), which rebuilds identical code; never remove the SHA pin. Docs-only commits to `main` must not redeploy anything.
5. **Tag**: only after 1–4, tag the RC1 commit `gateway-zernio-v0.1.0-rc1` (annotated). Not before.
6. **Branch hygiene**: after step 4, `claude/funny-allen-b47ffl` and `docs/zeptly-secret-setup` may be deleted (both fully contained in `main`/PR #1); keep them until Railway no longer references the old branch.
7. **Sibling repos** (separate plans): Gateway-Outstand RC counterpart `0486c72` (PR #1, base `claude/zen-babbage-y7g3sy`) carries the same shared-contract hash `3134ad65…`; its production redeploy needs explicit approval. Zeptly-MVP PR #9 is untouched.

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
