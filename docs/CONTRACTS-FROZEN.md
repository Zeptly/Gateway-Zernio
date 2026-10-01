# Frozen contracts and conformance artifacts

Gateway Contract v1 and the capability contracts below are **frozen** and shared with `Zeptly/Gateway-Outstand`. This gateway proves portability by carrying the *same* artifacts.

| Artifact | Location | Guard |
| --- | --- | --- |
| Gateway Contract v1 (`GATEWAY_CONTRACT_VERSION = "1"`) | `packages/gateway-contract` | `contracts.lock.json` fingerprint, `packages/gateway-contract/test/contract-freeze.test.ts` |
| `social.publishing@1`, `social.scheduling@1` | `packages/adapters/social-publishing/src/contract` | same fingerprint file |
| ZS1-HMAC-SHA256 vectors | `packages/gateway-contract/vectors/zs1.v1.json` | `pnpm zs1:check` and `packages/gateway-core/test/zs1-vectors.test.ts` |
| OpenAPI 3.1 document | `openapi/openapi.json`, hash in `openapi/openapi.sha256` | `pnpm openapi:check` |

## Parity with Gateway-Outstand

The fingerprints of `gateway-contract@1` and `social.publishing@1+social.scheduling@1` in `packages/gateway-contract/contracts.lock.json` are **identical** to the ones in Gateway-Outstand's lock, and `zs1.v1.json` is byte-identical. When either repository changes a frozen artifact the other must receive the same change in the same release. Verify with:

```bash
sha256sum packages/gateway-contract/vectors/zs1.v1.json   # must match Gateway-Outstand
jq -S '."gateway-contract@1", ."social.publishing@1+social.scheduling@1"' packages/gateway-contract/contracts.lock.json
```

Not frozen across gateways: `social.analytics.basic@1` and `social.direct_messages@1` (not offered by this gateway).

## OpenAPI version and hash

`info.version` is the deployed API version, `info.x-gateway-contract-version` the Gateway Contract version, `info.x-capability-contracts` the served `id@version` list, and `openapi/openapi.sha256` the SHA-256 of `openapi/openapi.json`. `pnpm openapi:check` fails when either is stale.

## Changing a frozen contract

1. Additive change inside version 1: regenerate the lock with `UPDATE_CONTRACT_LOCK=1 pnpm vitest run --project unit packages/gateway-contract`, review the diff, `pnpm openapi:generate`, bump `API_VERSION`, and apply the identical change in Gateway-Outstand.
2. Breaking change: publish a new contract version beside the old one. Never edit version 1 in place.
