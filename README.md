# Gateway-Zernio

Zeptly Social gateway backed by [Zernio](https://zernio.com). Sibling of `Gateway-Outstand`; intended to expose the same provider-neutral interface to `zeptly-mvp`.

## Status

Scaffold only. Layout mirrors Gateway-Outstand:

- `apps/` — deployable services (API, worker)
- `packages/` — shared libraries and provider adapters
- `docs/` — design notes

## Development

```sh
pnpm install
pnpm check
```

Requires Node >= 22.12 and pnpm 10.
