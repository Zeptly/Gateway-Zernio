# Zernio Gateway

`Zeptly/Gateway-Zernio` is Zeptly's gateway to [Zernio](https://zernio.com). It is one **provider gateway**: it knows exactly one upstream provider and exposes what that provider can do through versioned, provider-neutral contracts. It follows the repository convention `Zeptly/[Function]-[Provider]` and is the sibling of `Zeptly/Gateway-Outstand`.

- **Gateway Contract v1**: gateway identity, capability discovery, health, workspace-scoped connections and provisioning, canonical errors, webhook and audit envelopes. Every Zeptly provider gateway implements it ([docs/GATEWAY-CONTRACT.md](docs/GATEWAY-CONTRACT.md)).
- **Capability contracts served** (the minimum that proves portability): `social.publishing@1` and `social.scheduling@1`. Analytics and direct messages are *not* offered, and discovery says so.

> Status: **v0.1.0 (now including canonical `x`), validated against a test double only.** No live Zernio call has been made from this repository. See [docs/ZERNIO.md](docs/ZERNIO.md) for what is and is not validated.

## What it is not

- Not a router. It never picks between providers. Zeptly consumes semantic Capabilities (`invokeCapability()`); Cortex resolves an implementation to a Provider Gateway target.
- No UI, no AI generation, no approval policy. Zeptly owns all of that.
- Not a copy of Gateway-Outstand. The provider client, account lifecycle, webhook mapping and network catalog are Zernio-specific; shared infrastructure is provenance-tracked ([docs/SHARED-CODE.md](docs/SHARED-CODE.md)).

## Architecture

```
Zeptly ──signed ZS1 requests──▶ Zernio Gateway API (/v1)
                                  │ Gateway Contract v1           /v1/gateway · /v1/capabilities · /v1/connections
                                  │ Social capability contracts   /v1/social/publishing
                                  ▼
                        gateway-core (tenancy, auth, provisioning, idempotency, jobs, webhooks, audit, discovery)
                                  ▼
                        capability services + typed Zernio capability adapter
                                  ▼
                        zernio-client (transport, auth, wire types, errors, rate limits, webhook verification) ──▶ Zernio ──▶ networks
PostgreSQL ◀── API + Worker (durable jobs, reconciliation, webhooks)
```

| Path | Purpose |
| --- | --- |
| `apps/api` | Fastify HTTP API, route composition, OpenAPI generation |
| `apps/worker` | PostgreSQL-backed job runner |
| `packages/gateway-contract` | **Gateway Contract v1** (Zod only). Byte-identical to Gateway-Outstand's |
| `packages/gateway-core` | Tenancy, ZS1 auth, provisioning, idempotency, jobs, webhooks, audit, discovery. Knows no provider |
| `packages/zernio-client` | The only code that speaks Zernio HTTP: transport, private wire schemas, typed results, errors, webhook verification |
| `packages/adapters/social-publishing` | Social Publishing/Scheduling Contract v1 (`./contract`), the provider-neutral port and service, and the Zernio port implementation (`./zernio`) |
| `packages/zernio-gateway` | Composition root: config, channel catalog, **workspace → Zernio profile** account port, webhook source |
| `packages/database` | Drizzle schema, client, migrator, seed |
| `packages/observability` | Structured logging and secret redaction |
| `packages/test-utils` | Stateful fake Zernio (tests/local dev) and DB harness |
| `test/architecture.test.ts` | Static dependency and isolation rules |

## Local development

Requirements: Node ≥ 22.12, pnpm 10, PostgreSQL 16 (`docker compose up -d`).

```bash
pnpm install
cp .env.example .env     # then fill the values; the test suite needs no Zernio account
pnpm check               # lint, typecheck, tests, build, OpenAPI + ZS1 vector checks
```

For local API startup, fill in `DATABASE_URL`, `ZERNIO_API_KEY`, `ZERNIO_WEBHOOK_SECRET`, and URL/origin settings in `.env` as described in `.env.example`. Start PostgreSQL with `docker compose up -d`. The API reads process environment variables; it does not load `.env` itself. In zsh, load the local configuration and enter the service signing secret (at least 32 characters) without terminal echo in the same shell that starts the API:

```bash
set -a; source .env; set +a
read -rs ZEPTLY_SERVICE_SECRET && export ZEPTLY_SERVICE_SECRET
printf '\n'
test -n "$ZEPTLY_SERVICE_SECRET" && printf 'ZEPTLY_SERVICE_SECRET is set\n'
pnpm db:migrate
pnpm dev:api
```

Keep secrets out of Git, shell history, and logs. Exporting a variable in a different shell or terminal tab may not make it available to the API process. Startup validates the secret and passes it to the ZS1 HMAC authenticator; a successful startup alone does not prove a signed request was accepted. For deployment settings, see [docs/RAILWAY.md](docs/RAILWAY.md).

Tests run against `FakeZernio` (`packages/test-utils`). Passing them is **automated/mocked** evidence, never live provider validation.
