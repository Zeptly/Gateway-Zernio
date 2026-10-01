# Railway deployment (not yet performed)

No Railway project exists for this gateway yet and nothing has been deployed. Creating one, setting variables and registering the Zernio webhook are **human-gated** operations.

One image, two services (same Dockerfile as Gateway-Outstand), plus PostgreSQL:

| Service | Start | Pre-deploy | Health |
| --- | --- | --- | --- |
| API | `node apps/api/dist/main.js` | `node apps/api/dist/migrate.js` | `GET /ready` |
| Worker | `node apps/worker/dist/main.js` | `node apps/worker/dist/migrate.js` | none (no HTTP) |

Variables (API; the worker references the API's with `${{API.…}}`): `NODE_ENV=production`, `DATABASE_URL`, `ZEPTLY_SERVICE_SECRET` (+ optional `_PREVIOUS`), `ZERNIO_API_KEY`, `ZERNIO_WEBHOOK_SECRET`, `ZERNIO_API_BASE_URL`, `ZERNIO_PROFILE_PREFIX`, `PUBLIC_BASE_URL`, `ALLOWED_RETURN_URL_ORIGINS`, `LOG_LEVEL`; worker also `WORKER_CONCURRENCY`, `WORKER_POLL_INTERVAL_MS`. Secrets are set in Railway only, never in the repository.

Use a **separate** Railway project and a **separate** database from Gateway-Outstand, and a distinct `ZEPTLY_SERVICE_SECRET` per gateway.
