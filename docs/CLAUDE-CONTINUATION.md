> **CLOSEOUT 2026-10-01 — SUPERSEDES the "RC1 / pinned runtime" statements below.**
> - **Accepted runtime now: `563465fea0563c13b5ef166cedb06887cebfb590`** (API and Worker both pinned; tag `accepted/provider-gateway-2026-10-01`). RC1 `4254506` is history. It adds unpublish, authorisation-lapse detection, `REAUTHORIZATION_REQUIRED` and safe reconnect (`reconnectAccountId`).
> - **`main` = `a59a3182bb3373c7ae0b2cb8a1aeb190cea8a0eb`** (merge of PR #3 over `6e2eaff` = PR #2). It is AHEAD of the deployed runtime by repo-only changes: the stricter health parser (reconnect only on `needsReconnect=true`, `tokenValid=false` or `tokenStatus.valid=false`; `status:error`, `canPost:false`, issues are evidence only; unknown shapes = no signal observed, fail open), health evidence stored in `status_reason`, and docs. The deployed `563465f` still has the older, looser parser.
> - **Do not re-pin Railway to `main`** until the live-test protocol in `docs/ZERNIO.md` ("Next Zernio live-test acceptance protocol") has been executed: capture the raw aggregate `/v1/accounts/health`, verify the parser against it, per-account health before/after publish, capture on any lapse, confirm `status_reason`, then consider a re-pin. Never use "Redeploy" on an old deployment (it reuses old snapshots); pin by `commitSha`.
> - X token lapse: root cause NOT confirmed; no live health capture exists. Staging connection torn down (disconnected); gateway account removed. Full programme handoff: Zeptly `docs/CLAUDE-CONTINUATION.md` ("FINAL HANDOFF").

# Gateway-Zernio — handoff (2026-10-01)

**GATEWAY-ZERNIO RC1 ACCEPTED FOR ZEPTLY STAGING**

| | |
| --- | --- |
| Accepted RC1 SHA | `4254506689ad2a0bfd27ebbac97d138bad47e220` |
| Gateway Contract hash (`gateway-contract@1`) | `3134ad65217cfb42266d8ac920616659e5d21bae2760485b209e79c3c10fdc4c` |
| OpenAPI hash (`openapi/openapi.sha256`) | `74273a936d40f2e10ce596d180de97d458b06a0817dcd773f23cd3edbf85a880` |
| Accepted on | 2026-10-01, after all seven live revalidation checks passed (Section 6B) with API and Worker both pinned to and running the exact SHA |

**`main` = RC1:** `main` was fast-forwarded to `4254506689ad2a0bfd27ebbac97d138bad47e220` on 2026-10-01 (from `594af31`, no force, SHAs preserved), on the owner's instruction.

**Not yet done:** no final release tag (deliberately withheld until after Zeptly staging acceptance); secret rotation, the Zernio-side registration record and the sibling-repo steps remain open.

No secret values are recorded here, only variable names.

Evidence labels used below:

- **USER-SUPPLIED VALIDATION EVIDENCE**: reported by the owner from the verification run; not independently recoverable by the session that wrote this file.
- **RAILWAY-OBSERVED**: read directly from Railway configuration, deployment metadata or logs by the writing session.
- **CI-OBSERVED**: read from GitHub Actions results for an exact SHA.
- **NOT ESTABLISHED**: could not be confirmed; deliberately not guessed or reconstructed.

## 0. Status and remaining actions

Resolved on 2026-10-01: API pin aligned to RC1 (deployment `589b77ca…` SUCCESS), API and Worker both pinned to and running the exact full SHA, and the seven live revalidation checks passed. The earlier API/Worker drift is closed.

Also done on 2026-10-01: canonical-main transition. `main` fast-forwarded to RC1 (merge-free, SHAs preserved) and this docs PR (#1) reduced to its true diff (`README.md` + `docs/CLAUDE-CONTINUATION.md`) before merging.

Remaining, in order:
1. **Final release tag**: not created. Deliberately deferred until after Zeptly staging acceptance.
2. **Secrets (Section 10)**: rotate `ZEPTLY_SERVICE_SECRET` (and `ZERNIO_WEBHOOK_SECRET` if ever exposed) before Zeptly staging uses them.
3. Record the Zernio-side webhook registration (URL, subscribed events, id): NOT ESTABLISHED.
4. Zeptly staging integration in a fresh session (Section 12). Keep both services pinned to an exact SHA; never "deploy latest".

## 1. Source / documentation state (repository lineage)

| Ref | Meaning |
| --- | --- |
| `main` | Fast-forwarded to RC1 `4254506689ad2a0bfd27ebbac97d138bad47e220` (previously the README-only `594af31` "Initial commit"); after PR #1 merges it additionally carries this README note and handoff doc. Canonical release line. |
| `0c88006216eb3c82fb52a18520ec495b4fe7ab54` | Earlier owner-verified line. Superseded by RC1; remains reachable from RC1. |
| **`4254506689ad2a0bfd27ebbac97d138bad47e220`** | **RC1 — ACCEPTED.** Head of `claude/funny-allen-b47ffl`; linear descendant of `0c88006`; now also the tip of `main` before this docs PR. |
| `origin/docs/zeptly-secret-setup` (`dba40af`) | `0c88006` + README only (sibling of RC1, not a descendant). |
| `claude/dreamy-lovelace-yv6otk` (this handoff branch, PR #1) | `dba40af` + this documentation, with RC1 merged in by merge commit. Its code tree is byte-identical to RC1; against `main` it differs only by `README.md` and this file. Railway does not track it. |

The repository lineage says nothing about what is running. Section 2 is the runtime state.

## 2. Deployed runtime state (Railway production, project "Zeptly Zernio Gateway" `842e919e-e5a7-4473-b2ae-26890e222fbe`, region `ams`)

| Service | Configured source pin (RAILWAY-OBSERVED) | Latest deployment metadata (RAILWAY-OBSERVED) | State |
| --- | --- | --- | --- |
| **Worker** | `Zeptly/Gateway-Zernio`, branch `claude/funny-allen-b47ffl`, `commitSha` **`4254506689ad2a0bfd27ebbac97d138bad47e220`** (re-pinned ~11:46Z on owner instruction after the RC1 review) | Deployment `fb21c9dd-57f6-4b0e-85c9-b5e65624c508`, 11:46:30Z, SUCCESS, commit `4254506689ad2a0bfd27ebbac97d138bad47e220` | Config and deployment both RC1. Aligned. |
| **API** | `Zeptly/Gateway-Zernio`, branch `claude/funny-allen-b47ffl`, `commitSha` **`4254506689ad2a0bfd27ebbac97d138bad47e220`** (re-pinned 11:53Z on owner approval) | Deployment `589b77ca-6518-486e-b180-2c46b8afb4fb`, 11:53:29Z, SUCCESS, commit `4254506689ad2a0bfd27ebbac97d138bad47e220` | Config and deployment both RC1. Aligned. The earlier drift (pin `0c88006` vs serving `4254506`) is **closed**. |
| Postgres | n/a | `ghcr.io/railwayapp-templates/postgres-ssl:18`, SUCCESS | Running; volume `postgres-volume`. |

Deployment history (RAILWAY-OBSERVED):
- API: `05d6a345…` @ `4254506` (10:34Z, REMOVED) → `32c36f3e…` @ `0c88006` (10:36Z, REMOVED 11:26Z) → `339a7e3e…` @ `4254506` (11:25Z, superseded) → **`589b77ca…` @ `4254506` (11:53Z, SUCCESS, serving, pinned)**.
- Worker: `994dd588…` @ `4254506` (10:34Z, REMOVED) → `03384713…` @ `0c88006` (10:36Z, REMOVED 11:46Z) → **`fb21c9dd…` @ `4254506` (11:46Z, SUCCESS, serving)**.

The serving build is identified through Railway's config and deployment metadata for both services; the live checks in Section 6B were run by the owner against the pinned deployment. The descriptor endpoint does not expose a build SHA or contract hash, so the hashes are tied to the SHA by the repository and CI, not by a live call.

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
- This inventory is repository-derived (identical in `0c88006` and RC1; only the hashes in Section 2 differ). Live checks 3 and 4 (Section 6B) confirmed gateway `zernio`, Gateway Contract version 1 and both capabilities at version 1 on the RC1 deployment.

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

The writing session did not re-execute these calls (it holds no Zernio credential) and the transcript scan of the earlier programme session (`session_017Dx1BB…`) contains none of it. Per Railway deployment timing, the post-11:25Z real-webhook traffic reached an API deployment whose metadata says `4254506` while the Worker was still on `0c88006`; the earlier auth result's build is **NOT ESTABLISHED**. The webhook path was re-run against RC1 on both services (Section 6B); the profiles check was not (Zernio client unchanged).

## 6. RAILWAY-OBSERVED log evidence (writing session)

These are corroborating observations only; they do not substitute for Section 5 and do not identify the API build.

- API `POST /v1/webhooks/zernio`: 10:39:11Z three requests rejected `WEBHOOK_SIGNATURE_INVALID` → 401 (`missing`, `invalid`, `invalid`), then two 200s; 11:22:45Z and 11:23:14Z two `invalid`-signature 401s; after the 11:25:40Z API redeploy, 11:26:18Z, 11:26:38Z, 11:26:52Z → 200.
- Worker `process_webhook` jobs, all `outcome: success`: 10:39:12Z (22 ms), 11:26:19Z (24 ms), 11:26:39Z (21 ms). No Worker job is logged for the 11:26:52Z request (not explained).
- Worker `housekeeping`, `reconcile_connections` and recurring `reconcile_publications` (every 5 min) jobs: success. Worker restarts at 10:34, 10:36 and 10:39Z, each clean (`SIGTERM`, `worker stopped`).
- Health: `GET /health` 200 at 11:26:06Z; `GET /ready` 200 at 10:38, 10:40 and 11:22Z; signed `GET /v1/gateway`, `/v1/gateway/health`, `/v1/capabilities` 200 at 10:38Z. Railway reports the latest deployment of all three services `SUCCESS`.
- The logs cannot show whether a given request was a real Zernio delivery or a signed manual test.

## 6B. RC1 revalidation (all seven live checks PASSED)

Results reported by the owner (USER-SUPPLIED) and corroborated by RAILWAY-OBSERVED logs of API deployment `589b77ca` and Worker deployment `fb21c9dd`. The live Zernio `profiles` check was deliberately not rerun (the Zernio client did not change in RC1).

| # | Check | Result | Railway log corroboration |
| --- | --- | --- | --- |
| 1 | Health | **PASS** — HTTP 200 `{"status":"ok"}` | `GET /health` 200, 11:58:59Z |
| 2 | Readiness | **PASS** — HTTP 200; database, migrations (2 applied) and configuration checks ok | `GET /ready` 200, 11:59:19Z |
| 3 | Signed `GET /v1/gateway` | **PASS** — 200; gateway `zernio`, Gateway Contract version 1 | `GET /v1/gateway` 200, 11:59:39Z |
| 4 | Signed capability discovery (workspace `ws_rc1_validation`) | **PASS** — `social.publishing` 1 and `social.scheduling` 1 (both currently unavailable: no connected account, as expected) | `GET /v1/capabilities` 200, 11:59:58Z |
| 5 | Invalid signed request | **PASS** — HTTP 401, `AUTHENTICATION_FAILED`, reason `signature mismatch` | `GET /v1/gateway` rejected `AUTHENTICATION_FAILED` → 401, 12:00:18Z |
| 6 | Real Zernio `webhook.test` | **PASS** — owner reports complete | `POST /v1/webhooks/zernio` → 200, 12:00:56Z (reqId `992727a8…`) |
| 7 | Worker `process_webhook` | **PASS** | Worker job `fc08cccd-de9d-4dce-ba1e-cb61847d68e4`, `process_webhook`, attempt 1, `outcome: success`, 10 ms, 12:00:57Z (about 1 s after the API 200). Admin `GET /v1/admin/webhook-events?limit=5` → 200 with four `webhook.test` events, all `processed`, one attempt each |

Also observed after the redeploy: Worker `reconcile_publications` succeeded at 11:50, 11:55 and 12:00Z; both services' pre-deploy migration steps were no-ops.

Side effect recorded: check 4 lazily registered one inert workspace row (`ws_rc1_validation`, opaque provider tenant ref) in the gateway database; no Zernio call was made.

## 7. Prior-session transcript scan (programme session `session_017Dx1BBy8GRisVy7Qy583Zd`)

The scan covered ~2026-10-01T07:05Z–11:34Z of that session; it contains no Railway, Zernio-API, set-variables or webhook.test calls. The earlier hours (2026-09-30T23:36Z–07:05Z) were not paged.

| Question | Status |
| --- | --- |
| Secret exposure (`ZEPTLY_SERVICE_SECRET`, `ZERNIO_WEBHOOK_SECRET`, `ZERNIO_API_KEY`) | **NOT ESTABLISHED** |
| Zernio-side webhook registration state (registered URL, subscribed event types, webhook id) | **NOT ESTABLISHED** |
| Leftover `webhook.test` rows in the gateway database (from the transcript scan) | **NOT ESTABLISHED** by the scan; see the update below |

Nothing here is guessed or reconstructed. (The leftover-rows status changed after RC1 revalidation; see the update below.) For reference only (not evidence of the live registration): the gateway's code and docs/RUNBOOK.md expect an endpoint at `<PUBLIC_BASE_URL>/v1/webhooks/zernio` subscribed to `post.platform.published`, `post.platform.failed`, `account.disconnected`, and the handler also accepts `webhook.test`. **Human action:** read the actual registration from the Zernio dashboard/API and record the URL and event list here.

Database: the writing session had no database access. Row counts for `webhook.test` (or any other table) are therefore not recorded; the admin endpoint `GET /v1/admin/webhook-events?limit=50` (signed) is the way to list them. If rows exist, `webhook.test` events are acknowledged and ignored by the handler; whether to delete them is a human decision (list ids first; no bulk delete). **Update from RC1 revalidation (USER-SUPPLIED via the admin endpoint, consistent with the Railway logs):** the gateway database holds **four** `webhook.test` events, all `processed` with one attempt each. By time they correspond to the 10:39Z signed test, the real deliveries at 11:26:18Z and 11:26:38Z (the 11:26:52Z request produced no job and is presumed deduplicated), and the 12:00:56Z RC1 test. Cleanup is **not required** (the handler acknowledges and ignores `webhook.test`); optional hygiene only, by explicit owner decision after listing ids. Other tables (connections, posts, publications) were not inspected.

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

1. Create the final release tag only after Zeptly staging acceptance (deliberately not created).
2. Rotate `ZEPTLY_SERVICE_SECRET` (and `ZERNIO_WEBHOOK_SECRET` if ever exposed) per Section 10 before Zeptly staging uses the service secret.
3. Record the Zernio-side webhook registration (URL, events, id) from Zernio.
4. Decide whether to remove the four inert `webhook.test` rows and the `ws_rc1_validation` workspace row (optional).
5. Supply the Zeptly staging inputs in Section 12.

## 12. Next phase: Zeptly staging integration

Run it in a **fresh session with all three repositories available** (Zeptly/zeptly-MVP, Zeptly/Gateway-Outstand, Zeptly/Gateway-Zernio). RC1 is accepted, so it can start once the secret and main-branch items it depends on (Section 0 items 2 and 3) are settled. Zeptly MVP was not touched by this handoff; no Gateway-Zernio features are to be added in this phase.

Exact inputs the staging session needs:

- Gateway base URL `https://api-production-c873b.up.railway.app`; gateway id `zernio`; Gateway Contract `1`; capabilities `social.publishing@1`, `social.scheduling@1`.
- The accepted RC1 SHA `4254506689ad2a0bfd27ebbac97d138bad47e220`, pinned on both services, with `gateway-contract@1` hash `3134ad65…` and OpenAPI hash `74273a93…` (full values at the top of this file).
- Zeptly staging environment name / `ZEPTLY_ENVIRONMENT` value and the staging Supabase project ref (never production `ikynpepqqxbmipesxjqh`).
- The gateway service secret delivered out-of-band into Zeptly staging config as `ZEPTLY_GATEWAY_*_SECRET` (exact suffix per `docs/provider-gateways/ROLLOUT.md` in zeptly-MVP), after any rotation; never in chat or git.
- A dedicated test social account and workspace id for the first live connect/publish/schedule validation, and explicit authorisation before any live publish.
- Confirmation that Gateway-Outstand production must not be mutated without explicit approval.
- The Zeptly staging origin to include in `ALLOWED_RETURN_URL_ORIGINS` (current Railway value is not recorded here).

## 13. Canonical-main transition (EXECUTED 2026-10-01 except tag and Railway branch switch)

Why PR #1 was misleading before the transition: `main` was a single README-only "Initial commit", so any PR into it showed the whole repository as new (146 files) and a "docs" title hid that; the branch also descended from `0c88006`, not RC1, so merging it would have put the pre-RC1 contract on `main`. After the steps below PR #1 shows 2 files.

Target end state: `main` contains RC1 `4254506` **with its SHA intact** (so Railway pins stay valid) plus the README secret-setup note and this handoff, with Railway still pinned to an exact SHA (never following `main`).

1. **RC1 accepted** (gate satisfied, see the top of this file).
2. **Land RC1 on `main` preserving SHAs** — DONE (fast-forward `594af31..4254506`, performed on the owner's instruction; no force, no squash, no rebase). Method used: preferably a fast-forward (`main` is an ancestor of `claude/funny-allen-b47ffl`: `git push origin 4254506:refs/heads/main`), or a PR from `claude/funny-allen-b47ffl` titled "Gateway-Zernio v0.1.0 RC1 (4254506): Gateway Contract v1 + social.publishing/scheduling@1" merged with a **merge commit**. **Never squash or rebase-merge**: that rewrites `0c88006`/`4254506` and orphans the deployed pin. Check branch protection first.
3. **Rebuild PR #1 as a small docs PR** — DONE: RC1 (`4254506`) has been merged (merge commit; no rebase, no force-push) into `claude/dreamy-lovelace-yv6otk`, resolving the single conflict in `docs/CLAUDE-CONTINUATION.md` by keeping this handoff plus RC1's checkpoint paragraph. Once `main` fast-forwards to `4254506`, this branch's diff against `main` is exactly `README.md` + `docs/CLAUDE-CONTINUATION.md`; `dba40af` (README-only) rides along. Retitle PR #1 "docs: handoff + local secret-setup README", rewrite its description, retarget if needed. Its diff against the new `main` should then be exactly `README.md` and `docs/CLAUDE-CONTINUATION.md`. Verified after the fast-forward: GitHub reports 2 changed files; CI re-run on the updated head before merging with a merge commit (not squash).
4. **Railway** (separate, deliberate step; NOT done — both services still track `claude/funny-allen-b47ffl` pinned to the exact SHA): once `main` contains RC1, optionally switch both services' source branch from `claude/funny-allen-b47ffl` to `main` **with the same `commitSha`** (`connect-service-source`), which rebuilds identical code; never remove the SHA pin. Docs-only commits to `main` must not redeploy anything.
5. **Tag**: NOT created. Deferred until after Zeptly staging acceptance; then tag the RC1 commit `gateway-zernio-v0.1.0-rc1` (annotated).
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

## Checkpoint — adapter isolation guard (criteria A, B)
Added `packages/gateway-core/test/adapter-isolation.test.ts`: no provider-neutral package imports provider code (A), and shared contracts name no provider outside comments (B). It found one leak: the gateway-id description example in the shared gateway contract named a provider; it now reads `acme-social`. Contract lock + OpenAPI + hash regenerated in both gateways (shared lock entries identical; Zernio intentionally omits `social.analytics.basic@1`). Evidence is local unit/typecheck/lint only; removing the adapter was exercised in a scratch copy (contract/core suites pass; only the adapter's own tests fail, as expected).
