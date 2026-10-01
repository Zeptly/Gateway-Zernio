import type { DatabaseHandle } from "@zeptly-gateway/database";
import { HmacServiceAuthenticator, signRequest } from "@zeptly-gateway/gateway-core";
import { ZernioClient } from "@zeptly-gateway/zernio-client";
import { createZernioGateway, loadConfig, type ZernioCapabilityId, type ZernioGatewayContext, type ZernioGatewayRuntime } from "@zeptly-gateway/zernio-gateway";
import {
  FakeZernio,
  openTestDatabase,
  resetDatabase,
  silentLogger,
  TEST_ZERNIO_KEY,
  TEST_RETURN_ORIGIN,
  TEST_SERVICE_SECRET,
  TEST_WEBHOOK_SECRET,
  TestClock,
  testEnv,
} from "@zeptly-gateway/test-utils";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { buildApp } from "../src/app.js";
import { Worker } from "../../worker/src/runtime.js";

export interface Harness {
  app: FastifyInstance;
  ctx: ZernioGatewayContext;
  runtime: ZernioGatewayRuntime;
  fake: FakeZernio;
  db: DatabaseHandle;
  clock: TestClock;
  call(
    workspace: string | null,
    method: "GET" | "POST" | "DELETE" | "PATCH",
    url: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<{ status: number; json: any; headers: Record<string, unknown> }>;
  connect(workspace: string, network: string): Promise<any[]>;
  /** Run worker ticks until no job is claimed. */
  drain(maxTicks?: number): Promise<number>;
  webhook(payload: Record<string, unknown>, opts?: { secret?: string }): Promise<{ status: number; json: any }>;
  close(): Promise<void>;
}

let shared: DatabaseHandle | undefined;

export async function createHarness(opts: { inlineDispatch?: boolean; now?: Date; capabilities?: readonly ZernioCapabilityId[] } = {}): Promise<Harness> {
  shared ??= await openTestDatabase();
  const db = shared;
  await resetDatabase(db);
  const clock = new TestClock(opts.now?.getTime() ?? Date.now());
  const fake = new FakeZernio(TEST_ZERNIO_KEY);
  fake.now = clock.now;
  const logger = silentLogger();
  const config = loadConfig(testEnv());
  const client = new ZernioClient({
    apiKey: TEST_ZERNIO_KEY,
    webhookSecret: TEST_WEBHOOK_SECRET,
    baseUrl: config.ZERNIO_API_BASE_URL,
    fetchImpl: fake.fetch,
    retryBaseMs: 1,
    now: clock.now,
    maxAttempts: 3,
    logger,
  });
  const runtime = createZernioGateway({
    config,
    db: db.db,
    logger,
    client,
    inlineDispatch: opts.inlineDispatch ?? true,
    now: clock.now,
    skipMediaDnsCheck: true,
    ...(opts.capabilities ? { capabilities: opts.capabilities } : {}),
  });
  const ctx = runtime.ctx;
  const app = await buildApp({
    runtime,
    authenticator: new HmacServiceAuthenticator(TEST_SERVICE_SECRET, undefined, () => clock.now().getTime()),
    logger: false,
    readiness: { check: async () => ({ database: { ok: true } }) },
  });
  await app.ready();

  const call: Harness["call"] = async (workspace, method, url, body, headers = {}) => {
    const raw = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    const ts = String(Math.floor(clock.now().getTime() / 1000));
    const sig = signRequest(TEST_SERVICE_SECRET, { timestamp: ts, method, url, workspaceId: workspace ?? "", caller: "zeptly-app", agent: headers["x-zeptly-agent"] ?? "", body: raw });
    const res = await app.inject({
      method,
      url,
      headers: {
        "x-zeptly-caller": "zeptly-app",
        "x-zeptly-timestamp": ts,
        "x-zeptly-signature": sig,
        ...(workspace ? { "x-zeptly-workspace-id": workspace } : {}),
        ...(raw ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      ...(raw ? { payload: raw } : {}),
    });
    let json: unknown;
    try {
      json = res.json();
    } catch {
      json = res.body;
    }
    return { status: res.statusCode, json, headers: res.headers };
  };

  const connect: Harness["connect"] = async (workspace, network) => {
    if (network === "bluesky") {
      const res = await call(workspace, "POST", "/v1/connections", { channel: network, credentials: { handle: `${workspace}.bsky.social`, appPassword: "app-password-0000" } });
      if (res.status !== 201 && res.status !== 200) throw new Error(`connect failed: ${JSON.stringify(res.json)}`);
      return res.json.connections;
    }
    const init = await call(workspace, "POST", "/v1/connections", { channel: network, returnUrl: `${TEST_RETURN_ORIGIN}/social/return` });
    if (init.status !== 201) throw new Error(`connect init failed: ${JSON.stringify(init.json)}`);
    const { callbackUrl } = fake.authorize(init.json.provisioning.authorizationUrl);
    const cb = new URL(callbackUrl);
    const res = await app.inject({ method: "GET", url: cb.pathname + cb.search });
    if (res.statusCode !== 303) throw new Error(`callback failed ${res.statusCode} ${res.body}`);
    const back = new URL(res.headers.location as string);
    if (back.searchParams.get("status") !== "completed") throw new Error(`provisioning ended ${back.searchParams.get("status")}`);
    const list = await call(workspace, "GET", "/v1/connections");
    return list.json.data.filter((c: { network: string }) => c.network === network);
  };

  const webhook: Harness["webhook"] = async (payload, o = {}) => {
    const { body, headers } = fake.webhook(o.secret ?? TEST_WEBHOOK_SECRET, payload);
    const res = await app.inject({ method: "POST", url: "/v1/webhooks/zernio", headers, payload: body });
    return { status: res.statusCode, json: res.json() };
  };

  const worker = new Worker(runtime, { concurrency: 8, pollIntervalMs: 10, workerId: "test-worker" });
  const drain: Harness["drain"] = async (maxTicks = 20) => {
    let total = 0;
    for (let i = 0; i < maxTicks; i++) {
      const r = await worker.tick();
      total += r.jobs;
      if (r.jobs === 0) break;
    }
    return total;
  };

  return { app, ctx, runtime, fake, db, clock, call, connect, webhook, drain, close: () => app.close() };
}

export const idem = () => randomUUID();
