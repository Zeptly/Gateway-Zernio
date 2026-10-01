/**
 * Contract freeze. A fingerprint of every exported Zod schema in a frozen
 * contract is committed in `contracts.lock.json`. Any change to a frozen wire
 * shape fails this test.
 *
 * Additive change inside a version is allowed, but it must be deliberate:
 * regenerate with `UPDATE_CONTRACT_LOCK=1 pnpm vitest run test/contract-freeze.test.ts`
 * and review the diff. A breaking change needs a new contract version instead.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as gateway from "../src/index.js";
import * as publishing from "../../adapters/social-publishing/src/contract/index.js";

const lockFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../contracts.lock.json");

function isSchema(v: unknown): v is z.ZodType {
  return typeof v === "object" && v !== null && "_zod" in v;
}

function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, stable(x)]),
    );
  }
  return v;
}

/** Schemas are fingerprinted by JSON Schema; plain data constants (ids, versions, patterns) by value. */
function fingerprint(mod: Record<string, unknown>): { schemas: number; constants: number; sha256: string } {
  const all = Object.entries(mod).sort(([a], [b]) => a.localeCompare(b));
  const schemas = all.filter(([, v]) => isSchema(v)).map(([name, v]) => [name, stable(z.toJSONSchema(v as z.ZodType, { unrepresentable: "any", io: "input" }))] as const);
  const constants = all
    .filter(([, v]) => !isSchema(v) && typeof v !== "function" && v !== undefined)
    .map(([name, v]) => [name, v instanceof RegExp ? v.source : stable(v)] as const);
  return { schemas: schemas.length, constants: constants.length, sha256: createHash("sha256").update(JSON.stringify([schemas, constants])).digest("hex") };
}

const current = {
  "gateway-contract@1": fingerprint(gateway),
  "social.publishing@1+social.scheduling@1": fingerprint(publishing),
};

describe("contract freeze", () => {
  it("frozen contract fingerprints match contracts.lock.json", () => {
    if (process.env.UPDATE_CONTRACT_LOCK === "1") {
      writeFileSync(lockFile, `${JSON.stringify(current, null, 2)}\n`);
    }
    const locked = JSON.parse(readFileSync(lockFile, "utf8"));
    expect(current).toEqual(locked);
  });

  it("every frozen contract exposes schemas", () => {
    for (const [name, f] of Object.entries(current)) expect(f.schemas, name).toBeGreaterThan(0);
  });

  it("Gateway Contract version is 1", () => {
    expect(gateway.GATEWAY_CONTRACT_VERSION).toBe("1");
  });
});
