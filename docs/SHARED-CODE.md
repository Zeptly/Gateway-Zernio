# Shared code with Gateway-Outstand

There is no shared package registry yet, so the provider-neutral infrastructure is **copied** from `Zeptly/Gateway-Outstand` @ `claude/funny-allen-b47ffl` (commit `13a0065` at the time of the copy) and kept byte-identical where it is contract-bearing.

| Package | Status | Rule |
| --- | --- | --- |
| `gateway-contract` | identical (incl. `contracts.lock.json` minus analytics, `vectors/zs1.v1.json`) | change both repositories together |
| `gateway-core` | identical except a comment | change both together |
| `database`, `observability` | identical except `application_name`, seed provider and one redaction key | schema/migrations must stay in lockstep |
| `adapters/social-publishing` (`contract`, `port`, `service`) | identical; `./zernio` replaces `./outstand` | the contract is frozen |
| `apps/api`, `apps/worker` | derived: no analytics/DM/legacy routes | |
| `zernio-client`, `zernio-gateway`, `adapters/*/src/zernio` | **Zernio-only** | never imported from Outstand |

Extracting `gateway-contract`, `gateway-core`, `database` and `observability` into a published package is the right long-term answer; until then, compare before every release:

```bash
for p in gateway-contract gateway-core database observability; do diff -r ../Gateway-Outstand/packages/$p packages/$p -x node_modules -x dist; done
```
