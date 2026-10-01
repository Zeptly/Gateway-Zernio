# Provider Gateway programme — continuation (2026-10-01)

No secrets are recorded here.

## State
| Repo | Branch | SHA | PR |
| --- | --- | --- | --- |
| Zeptly/zeptly-MVP | claude/funny-allen-b47ffl | 52b6479f | #9 (draft) |
| Zeptly/Gateway-Outstand | claude/funny-allen-b47ffl | 13a0065 | #1 (draft, base claude/zen-babbage-y7g3sy) |
| Zeptly/Gateway-Zernio | claude/funny-allen-b47ffl | 76df5e3 | none: the repo has no other branch to merge into; create a `main` first |

## Evidence (all automated/mocked; nothing live, nothing deployed)
- Outstand: lint, typecheck, 181 tests, build, openapi:check, zs1:check green (local Postgres 16).
- Zernio: lint, typecheck, 115 tests, build, openapi:check, zs1:check, db:check green. Docker image build NOT run.
- MVP: vitest provider-gateway (25) + architecture (13) + Cortex (41) green; Deno boundary (19) and social-capability-invoke (8) green; deno check of new files green; migration applied to a scratch Postgres with stubbed dependencies only. 7 vitest failures and Deno tenant-isolation/rls-regression failures are pre-existing (identical on main).

## Success criteria status
A met (tests in both gateways). B met (architecture tests; one sanctioned doc example). C **partial**: no Outstand call; 31 direct-Zernio files remain (ratcheted). D **partial**: canonical path implemented and tested with doubles; not wired into draft-approve; no implementation seeded. E met against a test double only. F met. G met (guard tests). H met for what exists; real-DB migration and Docker not run. I met (ROLLOUT, ADR, AUDIT).

## Human-only blockers / decisions
1. X/Twitter is not in Social Publishing Contract v1; draft-approve (X only) cannot migrate until `x` is added additively to the frozen contract in both gateways.
2. Deploy Gateway-Zernio (own Railway project/DB/secret), set ZERNIO_API_KEY + webhook secret, run its "First live validation". Not authorised/possible from here.
3. Apply the Zeptly migration to staging, set ZEPTLY_ENVIRONMENT and ZEPTLY_GATEWAY_*_SECRET, register gateways, bind implementations (docs/provider-gateways/ROLLOUT.md). Zeptly production/staging/dev identifiers were not supplied.
4. Python orchestrator still has the stale SendIt/Outstand boundary (AUDIT.md, Open).
5. Gateway-Outstand production (Railway) must not be mutated without explicit approval.

## Next tasks
- Wire gateway post state back into scheduled_posts/publish_attempts; migrate draft-approve once `x` exists.
- Gateway-Zernio: analytics slice, pagination, verify provisional network constraints, live validation.
- Extract shared gateway-contract/core into a package (docs/SHARED-CODE.md in Gateway-Zernio).
- Commands: `pnpm check` in each gateway (needs Postgres; TEST_DATABASE_URL); in MVP `npx vitest run src/test/provider-gateway*.test.ts`, `deno test --no-check -A supabase/functions/_shared/connector-boundary.test.ts supabase/functions/social-capability-invoke/index.test.ts`.
