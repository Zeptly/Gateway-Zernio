import { describe, expect, it } from "vitest";
import { FakeZernio } from "../../test-utils/src/fake-zernio.js";
import { ZernioClient, ZernioError, computeSignature, verifySignature } from "../src/index.js";

const SECRET = "whsec_test_0123456789abcdef";
function setup(overrides: Partial<ConstructorParameters<typeof ZernioClient>[0]> = {}) {
  const fake = new FakeZernio("k");
  const client = new ZernioClient({ apiKey: "k", webhookSecret: SECRET, baseUrl: "https://fake.zernio.test/api", fetchImpl: fake.fetch, retryBaseMs: 1, maxAttempts: 3, ...overrides });
  return { fake, client };
}

describe("webhook signature (hex HMAC-SHA256 of the raw body)", () => {
  const body = Buffer.from('{"id":"evt_1","event":"webhook.test"}');
  it("accepts a correct signature, rejects wrong, malformed and missing ones", () => {
    const sig = computeSignature(SECRET, body);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(verifySignature(body, sig, SECRET)).toBe("valid");
    expect(verifySignature(body, sig.toUpperCase(), SECRET)).toBe("valid");
    expect(verifySignature(body, computeSignature("other-secret-value-xxxxxxxx", body), SECRET)).toBe("invalid");
    expect(verifySignature(body, `sha256=${sig}`, SECRET)).toBe("invalid");
    expect(verifySignature(body, "zz", SECRET)).toBe("invalid");
    expect(verifySignature(body, undefined, SECRET)).toBe("missing");
    expect(verifySignature(Buffer.from('{"id":"evt_2"}'), sig, SECRET)).toBe("invalid");
  });
  it("refuses to run without a secret (fail closed)", () => {
    expect(() => verifySignature(body, "a".repeat(64), "")).toThrow();
  });
});

describe("webhook parsing", () => {
  const { client } = setup();
  const parse = (o: unknown) => client.webhooks.parse(Buffer.from(JSON.stringify(o)));
  it("maps per-platform terminal post events", () => {
    const ok = parse({ id: "e1", event: "post.platform.published", timestamp: "2026-10-01T00:00:00Z", post: { id: "p1" }, platform: { platformPostId: "n1", publishedUrl: "https://x/1" }, account: { accountId: "a1" } });
    expect(ok.eventId).toBe("e1");
    expect(ok.event).toMatchObject({ kind: "post_outcome", providerPostId: "p1", accounts: [{ accountExternalId: "a1", outcome: "published", platformPostId: "n1", platformPostUrl: "https://x/1" }] });
    const bad = parse({ id: "e2", event: "post.platform.failed", post: { id: "p1" }, platform: { error: "denied" }, account: { accountId: "a1" } });
    expect(bad.event).toMatchObject({ kind: "post_outcome", accounts: [{ outcome: "failed", error: "denied" }] });
  });
  it("maps disconnects, tests, and ignores everything else", () => {
    expect(parse({ id: "e3", event: "account.disconnected", account: { accountId: "a1", disconnectionType: "unintentional", reason: "revoked" } }).event).toMatchObject({ kind: "account_disconnected", unintentional: true });
    expect(parse({ id: "e4", event: "account.disconnected", account: { accountId: "a1", disconnectionType: "intentional" } }).event).toMatchObject({ unintentional: false });
    expect(parse({ id: "e5", event: "webhook.test", message: "hi" }).event.kind).toBe("test");
    expect(parse({ id: "e6", event: "message.received" }).event.kind).toBe("ignored");
  });
  it("rejects malformed payloads", () => {
    expect(() => client.webhooks.parse(Buffer.from("not json"))).toThrow(ZernioError);
    expect(() => parse({ event: "post.platform.published" })).toThrow(ZernioError);
    expect(() => parse({ id: "e7", event: "post.platform.published", post: {} })).toThrow(ZernioError);
  });
});

describe("transport", () => {
  it("authenticates with a bearer key and maps 401/404/429/5xx", async () => {
    const { fake, client } = setup({ apiKey: "wrong" });
    await expect(client.listProfiles()).rejects.toMatchObject({ kind: "auth", retryable: false });
    const ok = setup();
    ok.fake.fail("GET", "/v1/profiles", { status: 429, body: { error: "slow down" }, headers: { "retry-after": "1" } }, 1);
    expect(await ok.client.listProfiles()).toEqual([]);
    ok.fake.fail("GET", "/v1/profiles", { status: 500, body: { error: "boom" } }, 5);
    await expect(ok.client.listProfiles()).rejects.toMatchObject({ kind: "server", retryable: true });
    expect(fake.requests.length).toBeGreaterThan(0);
  });

  it("never retries a mutating call that carries no idempotency key, and always sends one on create", async () => {
    const { fake, client } = setup();
    const profile = await client.ensureProfile("p1");
    const acct = fake.addAccount({ platform: "linkedin", profileId: profile.id });
    fake.fail("POST", "/v1/posts", { status: 500, body: { error: "boom" } }, 1);
    const post = await client.createPost({ idempotencyKey: "k-1", text: "hi", media: [], targets: [{ platform: "linkedin", accountExternalId: acct._id }], publishNow: true });
    expect(post.targets[0]?.status).toBe("published");
    const keys = fake.requests.filter((r) => r.path === "/v1/posts").map((r) => r.headers["idempotency-key"]);
    expect(keys).toEqual(["k-1", "k-1"]);
  });

  it("converges ensureProfile on a duplicate (409 existingProfileId) and a lost create response", async () => {
    const { fake, client } = setup();
    fake.fail("POST", "/v1/profiles", { networkError: true, afterApply: true });
    const p = await client.ensureProfile("dup-name");
    expect(fake.profiles.size).toBe(1);
    expect(p.name).toBe("dup-name");
    expect((await client.ensureProfile("dup-name")).id).toBe(p.id);
  });

  it("treats delete as idempotent", async () => {
    const { client } = setup();
    await expect(client.deletePost("missing")).resolves.toBeUndefined();
    await expect(client.disconnectAccount("missing")).resolves.toBeUndefined();
  });

  it("reports a content-hash duplicate as a definitive, non-retryable conflict", async () => {
    const { fake, client } = setup();
    const profile = await client.ensureProfile("p");
    const acct = fake.addAccount({ platform: "linkedin", profileId: profile.id });
    const input = { text: "same", media: [], targets: [{ platform: "linkedin", accountExternalId: acct._id }], publishNow: true };
    await client.createPost({ ...input, idempotencyKey: "a-1" });
    await expect(client.createPost({ ...input, idempotencyKey: "a-2" })).rejects.toMatchObject({ kind: "conflict", retryable: false, details: { existingPostId: expect.any(String) } });
  });

  it("redacts the API key from error messages and never logs credentials", async () => {
    const { client } = setup({ apiKey: "sk_super_secret_key_value" });
    const err = await client.listProfiles().catch((e) => e as ZernioError);
    expect(err).toBeInstanceOf(ZernioError);
    expect(JSON.stringify({ m: (err as ZernioError).message, d: (err as ZernioError).details })).not.toContain("sk_super_secret_key_value");
  });
});
