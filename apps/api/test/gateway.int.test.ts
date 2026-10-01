import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "./helpers.js";

const WS = "ws_gateway";
let h: Harness;
afterEach(async () => {
  await h?.close();
});

describe("Gateway Contract v1 surface (Zernio)", () => {
  it("describes the gateway with exactly the capabilities it serves", async () => {
    h = await createHarness();
    const res = await h.call(null, "GET", "/v1/gateway");
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ gateway: "zernio", provider: "zernio", gatewayContractVersion: "1" });
    expect(res.json.capabilities.map((c: { id: string; version: string; enabled: boolean }) => `${c.id}@${c.version}:${c.enabled}`)).toEqual(["social.publishing@1:true", "social.scheduling@1:true"]);
    expect(res.json.channels.sort()).toEqual(["bluesky", "facebook", "instagram", "linkedin", "pinterest", "threads", "tiktok", "x", "youtube"]);
    const health = await h.call(null, "GET", "/v1/gateway/health");
    expect(health.json.status).toBe("ok");
    // Health and describe never generate provider traffic.
    expect(h.fake.requests.length).toBe(0);
  });

  it("reports per-workspace availability from active connections only", async () => {
    h = await createHarness();
    const before = await h.call(WS, "GET", "/v1/capabilities");
    expect(before.json.data.every((c: { available: boolean }) => !c.available)).toBe(true);
    const [li] = await h.connect(WS, "linkedin");
    const after = await h.call(WS, "GET", "/v1/capabilities");
    const byId = Object.fromEntries(after.json.data.map((c: { id: string }) => [c.id, c]));
    expect(byId["social.publishing"]).toMatchObject({ available: true, connectionIds: [li.id] });
    expect(byId["social.scheduling"]).toMatchObject({ available: true, connectionIds: [li.id] });
    const other = await h.call("ws_other", "GET", "/v1/capabilities");
    expect(other.json.data.flatMap((c: { connectionIds: string[] }) => c.connectionIds)).toEqual([]);
  });

  it("does not serve analytics, direct messages or legacy aliases", async () => {
    h = await createHarness();
    for (const url of ["/v1/social/analytics/metrics", "/v1/social/direct-messages/conversations", "/v1/posts", "/v1/metrics"]) {
      expect((await h.call(WS, "GET", url)).status).toBe(404);
    }
    const doc = (await h.app.inject({ method: "GET", url: "/openapi.json" })).json();
    expect(doc.info["x-gateway-contract-version"]).toBe("1");
    expect(doc.info["x-capability-contracts"]).toEqual(["social.publishing@1", "social.scheduling@1"]);
    const text = JSON.stringify(doc);
    expect(text).not.toMatch(/externalId|providerPostId|provider_post_id|profileId|network_data/);
  });

  it("lists channels with the credentials strategy for Bluesky only", async () => {
    h = await createHarness();
    const ch = await h.call(WS, "GET", "/v1/connections/channels");
    expect(ch.json.data.find((c: { channel: string }) => c.channel === "bluesky")).toMatchObject({ connectionStrategy: "credentials", supportedStrategies: ["credentials"] });
    expect(ch.json.data.find((c: { channel: string }) => c.channel === "linkedin")).toMatchObject({ connectionStrategy: "oauth_redirect" });
  });
});

/** Architecture test A: remove every capability and the gateway stays coherent. */
describe("architecture A: gateway without capability modules", () => {
  it("describes, provisions, handles account webhooks and runs jobs with no capabilities composed", async () => {
    h = await createHarness({ capabilities: [] });
    expect((await h.call(null, "GET", "/v1/gateway")).json.capabilities).toEqual([]);
    expect((await h.call(WS, "GET", "/v1/capabilities")).json.data).toEqual([]);

    const init = await h.call(WS, "POST", "/v1/connections", { channel: "threads", returnUrl: "https://app.zeptly.test/r" });
    expect(init.status).toBe(201);
    const { callbackUrl, account } = h.fake.authorize(init.json.provisioning.authorizationUrl);
    const cb = new URL(callbackUrl);
    expect((await h.app.inject({ method: "GET", url: cb.pathname + cb.search })).statusCode).toBe(303);
    const list = await h.call(WS, "GET", "/v1/connections");
    expect(list.json.data).toHaveLength(1);
    expect(list.json.data[0]).toMatchObject({ channel: "threads", status: "connected" });
    expect(list.json.data[0].capabilities).toBeUndefined();

    expect((await h.call(WS, "GET", "/v1/social/publishing/posts")).status).toBe(404);

    // Unintentional disconnect → reauthorization_required, handled by the gateway itself.
    const wh = await h.webhook({ id: "evt_disc_1", event: "account.disconnected", account: { accountId: account._id, profileId: account.profileId, platform: "threads", disconnectionType: "unintentional", reason: "token revoked" }, timestamp: new Date().toISOString() });
    expect(wh.status).toBe(200);
    // A publication event has no handler here: acknowledged, stored, ignored.
    expect((await h.webhook(h.fake.platformEvent("post.platform.published", "P_unknown", account._id))).status).toBe(200);
    await h.drain();
    expect((await h.call(WS, "GET", `/v1/connections/${list.json.data[0].id}`)).json.status).toBe("reauthorization_required");
    const events = await h.db.pool.query("select event_type, status from webhook_events order by received_at");
    expect(events.rows.map((r) => `${r.event_type}:${r.status}`)).toEqual(["account.disconnected:processed", "post.platform.published:ignored"]);
    const types = (await h.db.pool.query("select distinct type from jobs where type <> 'process_webhook'")).rows.map((r: { type: string }) => r.type).sort();
    expect(types).toEqual(["housekeeping", "reconcile_connections"]);
  });
});
