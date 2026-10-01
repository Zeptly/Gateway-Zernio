/**
 * Generates / checks the ZS1 conformance vectors shared by every Zeptly
 * provider gateway and by the Zeptly server-side client.
 *
 *   tsx scripts/zs1-vectors.ts          write packages/gateway-contract/vectors/zs1.v1.json
 *   tsx scripts/zs1-vectors.ts --check  fail when the committed file is stale
 *
 * The secret below is a published TEST secret. It protects nothing.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalString, signRequest } from "../packages/gateway-core/src/auth.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "packages/gateway-contract/vectors/zs1.v1.json");

const TEST_SECRET = "zs1-published-test-vector-secret-not-a-credential";
const TS = "1790000000";

interface Input {
  timestamp: string;
  method: string;
  url: string;
  workspaceId: string;
  caller: string;
  agent: string;
  body: string;
}
const base: Input = { timestamp: TS, method: "GET", url: "/v1/gateway", workspaceId: "", caller: "zeptly-app", agent: "", body: "" };
const cases: Array<{ name: string; input: Input }> = [
  { name: "service-get-no-workspace", input: base },
  { name: "workspace-get-with-query", input: { ...base, url: "/v1/capabilities?channel=linkedin", workspaceId: "ws_123" } },
  { name: "workspace-post-json-body", input: { ...base, method: "POST", url: "/v1/social/publishing/posts", workspaceId: "ws_123", agent: "agent:director", body: '{"content":{"text":"hello"}}' } },
  { name: "lowercase-method-normalised", input: { ...base, method: "post", url: "/v1/connections", workspaceId: "ws_abc.def:1", body: "{}" } },
  { name: "utf8-body", input: { ...base, method: "POST", url: "/v1/social/publishing/posts", workspaceId: "ws_123", body: '{"content":{"text":"café ☕ 日本語"}}' } },
];

function build() {
  const vectors = cases.map(({ name, input }) => {
    const body = Buffer.from(input.body, "utf8");
    const p = { ...input, body };
    return {
      name,
      input,
      bodySha256: createHash("sha256").update(body).digest("hex"),
      canonical: canonicalString(p),
      signature: signRequest(TEST_SECRET, p),
    };
  });
  const tamper = vectors[2]!;
  return {
    scheme: "ZS1-HMAC-SHA256",
    contractVersion: "1",
    note: "Published test vectors. The secret is a test value and protects nothing. Every implementation (gateways, Zeptly client) must reproduce canonical and signature byte-for-byte.",
    secret: TEST_SECRET,
    nowUnixSeconds: Number(TS),
    maxSkewSeconds: 300,
    vectors,
    mustReject: [
      { name: "wrong-workspace", base: tamper.name, override: { workspaceId: "ws_other" } },
      { name: "wrong-path", base: tamper.name, override: { url: "/v1/social/publishing/posts?x=1" } },
      { name: "wrong-method", base: tamper.name, override: { method: "PUT" } },
      { name: "wrong-caller", base: tamper.name, override: { caller: "other-service" } },
      { name: "wrong-agent", base: tamper.name, override: { agent: "agent:other" } },
      { name: "wrong-body", base: tamper.name, override: { body: '{"content":{"text":"HELLO"}}' } },
      { name: "skew-too-old", base: tamper.name, nowOffsetSeconds: 301 },
      { name: "skew-too-new", base: tamper.name, nowOffsetSeconds: -301 },
    ],
  };
}

const doc = `${JSON.stringify(build(), null, 2)}\n`;
if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(out, "utf8");
  } catch {
    /* missing */
  }
  if (current !== doc) {
    process.stderr.write("ZS1 vectors are stale. Run `pnpm zs1:vectors` and commit the result.\n");
    process.exit(1);
  }
  process.stdout.write("ZS1 vectors are up to date\n");
} else {
  writeFileSync(out, doc);
  process.stdout.write("wrote packages/gateway-contract/vectors/zs1.v1.json\n");
}
