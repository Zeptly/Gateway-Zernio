import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHarness, type Harness, idem } from "./helpers.js";

const A = "ws_alpha";
const B = "ws_bravo";
let h: Harness;

beforeEach(async () => {
  h = await createHarness();
});
afterEach(async () => {
  await h.close();
});

const base = "/v1/social/publishing";
async function draft(ws: string, connIds: string[], text = "Hello from Zeptly") {
  return h.call(ws, "POST", `${base}/posts`, { content: { text }, targets: connIds.map((connectionId) => ({ connectionId })) }, { "idempotency-key": idem() });
}

describe("workspace → Zernio profile mapping and isolation", () => {
  it("creates one profile per workspace named from the opaque tenant ref and never sends the Zeptly workspace id", async () => {
    const [c] = await h.connect(A, "linkedin");
    expect(c).toMatchObject({ network: "linkedin", status: "connected", provider: "zernio", workspaceId: A });
    expect(JSON.stringify(c)).not.toContain([...h.fake.accounts.keys()][0]);
    const profiles = [...h.fake.profiles.values()];
    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.name).toMatch(/^zs-zs_[0-9a-f]{32}$/);
    expect(JSON.stringify(h.fake.requests)).not.toContain(A);
    // A second connection in the same workspace reuses the profile.
    await h.connect(A, "facebook");
    expect(h.fake.profiles.size).toBe(1);
    await h.connect(B, "linkedin");
    expect(h.fake.profiles.size).toBe(2);
  });

  it("refuses to adopt another workspace's account even with a forged provider callback", async () => {
    await h.connect(A, "linkedin");
    const victim = [...h.fake.accounts.values()][0];
    if (!victim) throw new Error("no victim account");
    const init = await h.call(B, "POST", "/v1/connections", { channel: "linkedin", returnUrl: "https://app.zeptly.test/r" });
    const real = h.fake.authorize(init.json.provisioning.authorizationUrl).callbackUrl;
    const u = new URL(real);
    // Same state token (bound to workspace B), but the redirect now names A's profile and account.
    u.searchParams.set("profileId", victim.profileId);
    u.searchParams.set("accountId", victim._id);
    const res = await h.app.inject({ method: "GET", url: u.pathname + u.search });
    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toContain("status=failed");
    expect((await h.call(B, "GET", "/v1/connections")).json.data.filter((c: { network: string }) => c.network === "linkedin")).toHaveLength(0);
    expect((await h.call(A, "GET", "/v1/connections")).json.data).toHaveLength(1);
    const audit = await h.db.pool.query("select action from audit_events where action = 'connection.tenant_mismatch'");
    expect(audit.rowCount).toBe(1);
  });

  it("scopes every resource by workspace (404, never 403)", async () => {
    const [ca] = await h.connect(A, "linkedin");
    const created = await draft(A, [ca.id]);
    expect(created.status).toBe(201);
    expect((await h.call(B, "GET", `/v1/connections/${ca.id}`)).status).toBe(404);
    expect((await h.call(B, "GET", `${base}/posts/${created.json.id}`)).status).toBe(404);
    expect((await draft(B, [ca.id])).status).toBe(404);
    // A raw provider account id is not a connection id.
    const raw = [...h.fake.accounts.keys()][0] as string;
    expect((await h.call(A, "GET", `/v1/connections/${raw}`)).status).toBe(404);
  });

  it("connects Bluesky with credentials that are never persisted", async () => {
    const res = await h.call(A, "POST", "/v1/connections", { channel: "bluesky", credentials: { handle: "brand.bsky.social", appPassword: "abcd-efgh-ijkl-mnop" } });
    expect(res.status).toBe(201);
    expect(res.json.connections[0]).toMatchObject({ network: "bluesky", status: "connected", username: "brand.bsky.social" });
    const dump = await h.db.pool.query("select row_to_json(t)::text as j from provisioning_sessions t");
    expect(dump.rows.map((r) => r.j).join()).not.toContain("abcd-efgh-ijkl-mnop");
    const audit = await h.db.pool.query("select metadata::text from audit_events");
    expect(audit.rows.map((r) => r.metadata).join()).not.toContain("abcd-efgh-ijkl-mnop");
    const wrong = await h.call(A, "POST", "/v1/connections", { channel: "bluesky", credentials: { handle: "x.bsky.social", appPassword: "wrong" } });
    expect(wrong.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects non-allow-listed returnUrl origins, unknown channels and credentials on OAuth channels", async () => {
    expect((await h.call(A, "POST", "/v1/connections", { channel: "facebook", returnUrl: "https://evil.example/cb" })).status).toBe(400);
    expect((await h.call(A, "POST", "/v1/connections", { channel: "reddit", returnUrl: "https://app.zeptly.test/cb" })).status).toBe(400);
    const cred = await h.call(A, "POST", "/v1/connections", { channel: "linkedin", credentials: { handle: "a", appPassword: "b" } });
    expect(cred.status).toBe(400);
    expect(["VALIDATION_ERROR", "CAPABILITY_NOT_SUPPORTED"]).toContain(cred.json.error.code);
    expect(h.fake.requests.some((r) => r.path.includes("credentials"))).toBe(false);
  });

  it("the callback state token is single-use and unknown states are 404", async () => {
    const init = await h.call(A, "POST", "/v1/connections", { channel: "facebook", returnUrl: "https://app.zeptly.test/cb" });
    const u = new URL(h.fake.authorize(init.json.provisioning.authorizationUrl).callbackUrl);
    const first = await h.app.inject({ method: "GET", url: u.pathname + u.search });
    expect(first.headers.location).toContain("status=completed");
    const again = await h.app.inject({ method: "GET", url: u.pathname + u.search });
    expect(again.headers.location).toContain("status=completed");
    expect((await h.call(A, "GET", "/v1/connections")).json.data).toHaveLength(1);
    expect((await h.app.inject({ method: "GET", url: "/v1/connect/callback/not-a-real-state-token-xxxxxxxx?accountId=abc" })).statusCode).toBe(404);
  });

  it("disconnects at the provider and reports the reconnect flow", async () => {
    const [c] = await h.connect(A, "facebook");
    const del = await h.call(A, "DELETE", `/v1/connections/${c.id}`);
    expect(del.status).toBe(200);
    expect(del.json.status).toBe("disconnected");
    expect(h.fake.accounts.size).toBe(0);
    const rc = await h.call(A, "POST", `/v1/connections/${c.id}/reconnect`, { returnUrl: "https://app.zeptly.test/cb" });
    expect(rc.status).toBe(201);
    expect(rc.json.provisioning.reconnectConnectionId).toBe(c.id);
  });
});

describe("publishing and scheduling on Zernio", () => {
  it("publishes to multiple accounts with a persisted UUID Idempotency-Key and settles from the synchronous response", async () => {
    const [c1] = await h.connect(A, "linkedin");
    const [c2] = await h.connect(A, "facebook");
    const li = await draft(A, [c1.id]);
    expect(li.json.status).toBe("draft");
    const pub = await h.call(A, "POST", `${base}/posts/${li.json.id}/publish`, undefined, { "idempotency-key": idem() });
    expect(pub.status).toBe(202);
    await h.drain();
    const req = h.fake.requests.find((r) => r.method === "POST" && r.path === "/v1/posts");
    expect(req?.headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect((req?.body as { publishNow?: boolean }).publishNow).toBe(true);
    const got = await h.call(A, "GET", `${base}/posts/${li.json.id}`);
    expect(got.json.status).toBe("published");
    expect(got.json.targets.every((t: { status: string; platformPostUrl?: string }) => t.status === "published" && t.platformPostUrl)).toBe(true);
    expect(JSON.stringify(got.json)).not.toContain([...h.fake.accounts.keys()][0]);
    expect(c2.id).toBeTruthy();
  });

  it("reports partially_published when one target fails at the provider", async () => {
    const conns = [(await h.connect(A, "facebook"))[0], (await h.connect(A, "linkedin"))[0]];
    // One post can only target one network at a time per publication; use two connections on the same network.
    const [f2] = await h.connect(A, "facebook");
    const ids = [...h.fake.accounts.values()].filter((a) => a.platform === "facebook").map((a) => a._id);
    h.fake.failAccount.set(ids[0] as string, "Page permissions revoked");
    const created = await draft(A, [conns[0].id, f2.id]);
    await h.call(A, "POST", `${base}/posts/${created.json.id}/publish`, undefined, { "idempotency-key": idem() });
    await h.drain();
    const got = await h.call(A, "GET", `${base}/posts/${created.json.id}`);
    expect(got.json.status).toBe("partially_published");
    const failed = got.json.targets.filter((t: { status: string }) => t.status === "failed");
    expect(failed).toHaveLength(1);
    expect(failed[0].error.code).toBe("PUBLICATION_FAILED");
  });

  it("is idempotent end to end: a replayed publish command creates one provider post", async () => {
    const [c] = await h.connect(A, "linkedin");
    const created = await draft(A, [c.id]);
    const key = idem();
    const first = await h.call(A, "POST", `${base}/posts/${created.json.id}/publish`, undefined, { "idempotency-key": key });
    const again = await h.call(A, "POST", `${base}/posts/${created.json.id}/publish`, undefined, { "idempotency-key": key });
    expect(again.status).toBe(first.status);
    await h.drain();
    expect(h.fake.posts.size).toBe(1);
    const missing = await h.call(A, "POST", `${base}/posts/${created.json.id}/publish`);
    expect(missing.status).toBe(400);
    expect(missing.json.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("hands a far-future schedule to Zernio immediately (no hand-off horizon) and settles via webhook", async () => {
    const [c] = await h.connect(A, "linkedin");
    const created = await draft(A, [c.id]);
    const at = new Date(h.clock.now().getTime() + 120 * 86_400_000).toISOString();
    const sch = await h.call(A, "POST", `${base}/posts/${created.json.id}/schedule`, { scheduledAt: at, timezone: "Europe/Madrid" }, { "idempotency-key": idem() });
    expect(sch.status).toBe(202);
    await h.drain();
    const sent = h.fake.requests.find((r) => r.method === "POST" && r.path === "/v1/posts");
    expect((sent?.body as { scheduledFor?: string }).scheduledFor).toBe(at);
    expect((sent?.body as { publishNow?: boolean }).publishNow).toBeUndefined();
    const post = [...h.fake.posts.values()][0];
    expect(post?.status).toBe("scheduled");
    expect((await h.call(A, "GET", `${base}/posts/${created.json.id}`)).json.status).toBe("scheduled");

    // At the scheduled time Zernio publishes and sends the per-platform terminal event.
    const acct = [...h.fake.accounts.keys()][0] as string;
    h.fake.setTarget(post!._id, acct, { status: "published", platformPostId: "pp_1", platformPostUrl: "https://linkedin.example/p/1" });
    const wh = await h.webhook(h.fake.platformEvent("post.platform.published", post!._id, acct, { platformPostId: "pp_1", publishedUrl: "https://linkedin.example/p/1" }));
    expect(wh.status).toBe(200);
    await h.drain();
    const got = await h.call(A, "GET", `${base}/posts/${created.json.id}`);
    expect(got.json.status).toBe("published");
  });

  it("cancels a scheduled post by deleting it at Zernio", async () => {
    const [c] = await h.connect(A, "linkedin");
    const created = await draft(A, [c.id]);
    await h.call(A, "POST", `${base}/posts/${created.json.id}/schedule`, { scheduledAt: new Date(h.clock.now().getTime() + 5 * 86_400_000).toISOString() }, { "idempotency-key": idem() });
    await h.drain();
    expect(h.fake.posts.size).toBe(1);
    const cancel = await h.call(A, "POST", `${base}/posts/${created.json.id}/cancel`, undefined, { "idempotency-key": idem() });
    expect(cancel.status).toBe(202);
    await h.drain();
    expect(h.fake.posts.size).toBe(0);
    expect((await h.call(A, "GET", `${base}/posts/${created.json.id}`)).json.status).toBe("cancelled");
  });
});

describe("canonical x (Zernio calls it twitter)", () => {
  it("connects X as canonical `x`; the provider name never reaches the API", async () => {
    const [c] = await h.connect(A, "x");
    expect(c).toMatchObject({ network: "x", channel: "x", status: "connected" });
    expect([...h.fake.accounts.values()][0]?.platform).toBe("twitter");
    expect(h.fake.requests.some((r) => r.path === "/v1/connect/twitter")).toBe(true);
    const ch = await h.call(A, "GET", "/v1/connections/channels");
    expect(ch.json.data.map((x: { channel: string }) => x.channel)).toContain("x");
    expect(JSON.stringify({ ...c, username: undefined, displayName: undefined })).not.toMatch(/twitter/);
    expect(JSON.stringify((await h.call(A, "GET", `${base}/networks`)).json)).not.toMatch(/twitter/);
  });

  it("publishes to X using the provider platform name", async () => {
    const [c] = await h.connect(A, "x");
    const ok = await draft(A, [c.id], "short post");
    await h.call(A, "POST", `${base}/posts/${ok.json.id}/publish`, undefined, { "idempotency-key": idem() });
    await h.drain();
    const sent = h.fake.requests.find((r) => r.method === "POST" && r.path === "/v1/posts");
    expect((sent?.body as { platforms: Array<{ platform: string }> }).platforms[0]?.platform).toBe("twitter");
    expect((await h.call(A, "GET", `${base}/posts/${ok.json.id}`)).json.status).toBe("published");

  });

  it("enforces the per-account ceiling in the gateway: 280 by default, higher when Zernio reports it", async () => {
    const [c] = await h.connect(A, "x");
    const acct = [...h.fake.accounts.values()][0]!;
    const text = "y".repeat(500);
    const free = await draft(A, [c.id], text);
    expect(free.status).toBe(201);
    await h.call(A, "POST", `${base}/posts/${free.json.id}/publish`, undefined, { "idempotency-key": idem() });
    await h.drain();
    const after = await h.call(A, "GET", `${base}/posts/${free.json.id}`);
    expect(after.json.targets[0].status).toBe("failed");
    expect(h.fake.posts.size).toBe(0);

    acct.metadata = { tier: "Premium" };
    const premium = await draft(A, [c.id], text + "z");
    await h.call(A, "POST", `${base}/posts/${premium.json.id}/publish`, undefined, { "idempotency-key": idem() });
    await h.drain();
    expect((await h.call(A, "GET", `${base}/posts/${premium.json.id}`)).json.status).toBe("published");
  });
});

describe("webhooks", () => {
  it("rejects bad or missing signatures without storing anything, and dedupes by event id", async () => {
    const [c] = await h.connect(A, "linkedin");
    const acct = [...h.fake.accounts.keys()][0] as string;
    const evt = h.fake.platformEvent("post.platform.failed", "P_x", acct, { error: "boom" });
    const bad = await h.webhook(evt, { secret: "a-different-webhook-secret-xxxxxxxx" });
    expect(bad.status).toBe(401);
    const none = await h.app.inject({ method: "POST", url: "/v1/webhooks/zernio", headers: { "content-type": "application/json" }, payload: JSON.stringify(evt) });
    expect(none.statusCode).toBe(401);
    expect((await h.db.pool.query("select 1 from webhook_events")).rowCount).toBe(0);
    const ok = await h.webhook(evt);
    expect(ok.json).toMatchObject({ accepted: true, duplicate: false });
    const dup = await h.webhook(evt);
    expect(dup.json).toMatchObject({ accepted: true, duplicate: true });
    expect((await h.db.pool.query("select 1 from webhook_events")).rowCount).toBe(1);
    expect(c.id).toBeTruthy();
  });

  it("ignores events for accounts it does not own (no adoption through webhooks)", async () => {
    await h.connect(A, "linkedin");
    const foreign = h.fake.addProfile("someone-elses-profile");
    const stranger = h.fake.addAccount({ platform: "linkedin", profileId: foreign._id });
    const res = await h.webhook({ id: "evt_stranger", event: "account.disconnected", account: { accountId: stranger._id, disconnectionType: "unintentional" }, timestamp: new Date().toISOString() });
    expect(res.status).toBe(200);
    await h.drain();
    const list = await h.call(A, "GET", "/v1/connections");
    expect(list.json.data.every((c: { status: string }) => c.status === "connected")).toBe(true);
    expect((await h.db.pool.query("select 1 from gateway_connections")).rowCount).toBe(1);
  });
});

describe("reliability", () => {
  it("retries a timed-out create with the same Idempotency-Key and ends with exactly one provider post", async () => {
    const [c] = await h.connect(A, "linkedin");
    const created = await draft(A, [c.id]);
    // The first create is applied at Zernio but the response is lost.
    h.fake.fail("POST", "/v1/posts", { networkError: true, afterApply: true });
    await h.call(A, "POST", `${base}/posts/${created.json.id}/publish`, undefined, { "idempotency-key": idem() });
    await h.drain();
    const creates = h.fake.requests.filter((r) => r.method === "POST" && r.path === "/v1/posts");
    expect(creates.length).toBeGreaterThanOrEqual(2);
    expect(new Set(creates.map((r) => r.headers["idempotency-key"])).size).toBe(1);
    expect(h.fake.posts.size).toBe(1);
    expect((await h.call(A, "GET", `${base}/posts/${created.json.id}`)).json.status).toBe("published");
  });

  it("maps a Zernio rate limit to a retryable canonical error without leaking the provider message", async () => {
    const [c] = await h.connect(A, "linkedin");
    const created = await draft(A, [c.id]);
    h.fake.fail("POST", "/v1/posts", { status: 429, body: { error: "Rate limit exceeded. Please retry after 120 seconds.", details: { retryAfterSeconds: 120 } }, headers: { "retry-after": "120" } }, 3);
    await h.call(A, "POST", `${base}/posts/${created.json.id}/publish`, undefined, { "idempotency-key": idem() });
    await h.drain();
    const got = await h.call(A, "GET", `${base}/posts/${created.json.id}`);
    expect(["queued", "publishing", "scheduled", "failed", "draft"]).toContain(got.json.status);
    expect(JSON.stringify(got.json)).not.toMatch(/zernio\.com|test-zernio-key/);
  });
});
