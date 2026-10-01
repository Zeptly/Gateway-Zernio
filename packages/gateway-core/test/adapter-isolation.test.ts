/**
 * Success criteria A and B — a provider adapter is removable, and the shared contract carries no provider types.
 *
 *  A. No provider-neutral package may IMPORT provider code (the adapter, the provider client, the gateway composition).
 *     Deleting those leaves the shared packages compiling; only the composition root (apps/api) and the adapter's own
 *     tests/packages reference them.
 *  B. The shared contracts (gateway-contract, social-publishing contract/service/port) must not import or name
 *     provider wire types. Provider names may appear only in prose comments.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const PROVIDER = "zernio";

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(join(ROOT, dir))) {
    if (n === "node_modules" || n === "dist") continue;
    const rel = join(dir, n);
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.ts$/.test(n)) out.push(rel);
  }
  return out;
}
const importsOf = (src: string) => [...src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => (m[1] ?? "").toLowerCase());
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const SHARED = [
  "packages/gateway-contract/src",
  "packages/gateway-core/src",
  "packages/adapters/social-publishing/src/contract",
  "packages/adapters/social-publishing/src/service",
  "packages/adapters/social-publishing/src/port.ts",
];
const sharedFiles = () => SHARED.flatMap((p) => (p.endsWith(".ts") ? [p] : walk(p)));

describe("A: provider adapters are removable", () => {
  it("no provider-neutral source imports provider code", () => {
    const offenders = sharedFiles().filter((f) => importsOf(readFileSync(join(ROOT, f), "utf8")).some((i) => i.includes(PROVIDER)));
    expect(offenders).toEqual([]);
  });
});

describe("B: shared contracts are provider-neutral", () => {
  it("code (comments excluded) in shared contracts never names the provider", () => {
    const offenders = sharedFiles().filter((f) => new RegExp(PROVIDER, "i").test(stripComments(readFileSync(join(ROOT, f), "utf8"))));
    expect(offenders).toEqual([]);
  });
});
