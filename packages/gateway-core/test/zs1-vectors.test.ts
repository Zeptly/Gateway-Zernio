import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HmacServiceAuthenticator, canonicalString, signRequest } from "../src/auth.js";

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../gateway-contract/vectors/zs1.v1.json");
const doc = JSON.parse(readFileSync(file, "utf8")) as {
  secret: string;
  nowUnixSeconds: number;
  vectors: Array<{ name: string; input: { timestamp: string; method: string; url: string; workspaceId: string; caller: string; agent: string; body: string }; canonical: string; signature: string }>;
  mustReject: Array<{ name: string; base: string; override?: Record<string, string>; nowOffsetSeconds?: number }>;
};

function headers(v: (typeof doc.vectors)[number]["input"], signature: string): Record<string, string> {
  return {
    "x-zeptly-caller": v.caller,
    "x-zeptly-timestamp": v.timestamp,
    "x-zeptly-signature": signature,
    ...(v.workspaceId ? { "x-zeptly-workspace-id": v.workspaceId } : {}),
    ...(v.agent ? { "x-zeptly-agent": v.agent } : {}),
  };
}

describe("ZS1 conformance vectors", () => {
  const auth = (offset = 0) => new HmacServiceAuthenticator(doc.secret, undefined, () => (doc.nowUnixSeconds + offset) * 1000);

  for (const v of doc.vectors) {
    it(`reproduces canonical string and signature: ${v.name}`, () => {
      const p = { ...v.input, body: Buffer.from(v.input.body, "utf8") };
      expect(canonicalString(p)).toBe(v.canonical);
      expect(signRequest(doc.secret, p)).toBe(v.signature);
    });
    it(`authenticates: ${v.name}`, () => {
      const caller = auth().authenticate({ method: v.input.method, url: v.input.url, headers: headers(v.input, v.signature), rawBody: Buffer.from(v.input.body, "utf8") });
      expect(caller.service).toBe(v.input.caller);
      expect(caller.workspaceExternalId).toBe(v.input.workspaceId || undefined);
    });
  }

  for (const r of doc.mustReject) {
    it(`rejects: ${r.name}`, () => {
      const base = doc.vectors.find((v) => v.name === r.base)!;
      const input = { ...base.input, ...(r.override ?? {}) };
      expect(() =>
        auth(r.nowOffsetSeconds ?? 0).authenticate({ method: input.method, url: input.url, headers: headers(input, base.signature), rawBody: Buffer.from(input.body, "utf8") }),
      ).toThrow(/authentication failed/i);
    });
  }
});
