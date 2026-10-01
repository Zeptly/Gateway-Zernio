import type { CapabilityAvailability, Gateway, GatewayConnection, GatewayDescriptor, GatewayHealth } from "@zeptly-gateway/gateway-contract";
import { GATEWAY_CONTRACT_VERSION } from "@zeptly-gateway/gateway-contract";
import type { Database } from "@zeptly-gateway/database";
import {
  type CapabilityModule,
  CapabilityRegistry,
  type ConnectionsContext,
  ensureWorkspace,
  GATEWAY_PERIODIC_JOBS,
  gatewayJobHandlers,
  gatewayWebhookHandlers,
  type JobHandler,
  type PeriodicJob,
  staticChannelCatalog,
  type WebhookContext,
  type WebhookEventHandler,
  type WorkerTick,
} from "@zeptly-gateway/gateway-core";
import { type Logger, registerSecret } from "@zeptly-gateway/observability";
import { NetworkCatalog, type SocialConnection, type SocialPublishingContext, socialPublishingModule, socialSchedulingModule, toSocialConnection } from "@zeptly-gateway/social-publishing";
import { ZERNIO_SOCIAL_CATALOG_VERSION, ZERNIO_SOCIAL_NETWORKS, ZernioSocialPublishingAdapter } from "@zeptly-gateway/social-publishing/zernio";
import { ZERNIO, ZernioClient } from "@zeptly-gateway/zernio-client";
import { ZernioAccountPort } from "./accounts.js";
import { ZERNIO_CHANNELS } from "./channels.js";
import type { AppConfig } from "./config.js";
import { zernioWebhookSource } from "./webhooks.js";

/** Everything the Zernio gateway's infrastructure and capabilities receive. */
export type ZernioGatewayContext = ConnectionsContext & WebhookContext & SocialPublishingContext;

/**
 * Capabilities this gateway serves. Deliberately the minimum that proves contract
 * portability: Social Publishing v1 and Social Scheduling v1. Analytics and direct
 * messages are NOT offered, and discovery says so.
 */
export type ZernioCapabilityId = "social.publishing" | "social.scheduling";
export const ZERNIO_CAPABILITIES: readonly ZernioCapabilityId[] = ["social.publishing", "social.scheduling"];

export const ZERNIO_GATEWAY_VERSION = "0.1.0";

export interface ZernioGatewayOptions {
  config: AppConfig;
  db: Database;
  logger: Logger;
  /** Injected client (tests); otherwise built from config. */
  client?: ZernioClient;
  /** Custom fetch for the built client (tests use the Zernio fake). */
  fetchImpl?: typeof fetch;
  capabilities?: readonly ZernioCapabilityId[];
  /** Dispatch from the API process right after publish (default true; the worker passes false). */
  inlineDispatch?: boolean;
  now?: () => Date;
  skipMediaDnsCheck?: boolean;
  version?: string;
  /** Local health checks (database, migrations); must not call Zernio. */
  healthProbe?: () => Promise<Record<string, { ok: boolean; detail?: string }>>;
}

export interface ZernioGatewayRuntime {
  gateway: Gateway;
  ctx: ZernioGatewayContext;
  registry: CapabilityRegistry<ZernioGatewayContext>;
  jobs: Record<string, JobHandler<ZernioGatewayContext>>;
  periodic: PeriodicJob[];
  ticks: WorkerTick<ZernioGatewayContext>[];
  client: ZernioClient;
  /** Connection as returned by the API: social view when Social Publishing is composed. */
  presentConnection(c: GatewayConnection): GatewayConnection | SocialConnection;
}

export function buildZernioClient(config: AppConfig, logger: Logger, opts: { fetchImpl?: typeof fetch; now?: () => Date } = {}): ZernioClient {
  return new ZernioClient({
    apiKey: config.ZERNIO_API_KEY,
    webhookSecret: config.ZERNIO_WEBHOOK_SECRET,
    baseUrl: config.ZERNIO_API_BASE_URL,
    logger: logger.child({ component: "zernio-client" }),
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    ...(opts.now ? { now: opts.now } : {}),
  });
}

/**
 * Composition root of the Zernio Gateway: Zernio client → typed capability
 * adapter → canonical capability services, on top of gateway-core infrastructure.
 */
export function createZernioGateway(opts: ZernioGatewayOptions): ZernioGatewayRuntime {
  const { config } = opts;
  registerSecret(config.ZEPTLY_SERVICE_SECRET);
  registerSecret(config.ZEPTLY_SERVICE_SECRET_PREVIOUS);
  registerSecret(config.ZERNIO_API_KEY);
  registerSecret(config.ZERNIO_WEBHOOK_SECRET);
  const now = opts.now ?? (() => new Date());
  const client = opts.client ?? buildZernioClient(config, opts.logger, { ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}), now });
  const selected = new Set(opts.capabilities ?? ZERNIO_CAPABILITIES);
  const socialCatalog = new NetworkCatalog(ZERNIO_SOCIAL_NETWORKS);

  const modules: CapabilityModule<ZernioGatewayContext>[] = [];
  const networksWith = (f: "publish" | "schedule") => () => socialCatalog.networksWith(f);
  if (selected.has("social.publishing")) modules.push(socialPublishingModule(networksWith("publish")) as CapabilityModule<ZernioGatewayContext>);
  if (selected.has("social.scheduling")) modules.push(socialSchedulingModule(networksWith("schedule")) as CapabilityModule<ZernioGatewayContext>);
  const registry = new CapabilityRegistry<ZernioGatewayContext>(modules);

  const webhookHandlers: WebhookEventHandler<ZernioGatewayContext>[] = [
    ...(gatewayWebhookHandlers() as WebhookEventHandler<ZernioGatewayContext>[]),
    ...modules.flatMap((m) => m.webhookHandlers ?? []),
  ];

  const ctx: ZernioGatewayContext = {
    gatewayId: ZERNIO,
    db: opts.db,
    logger: opts.logger,
    settings: { publicBaseUrl: config.PUBLIC_BASE_URL, allowedReturnOrigins: config.ALLOWED_RETURN_URL_ORIGINS },
    now,
    accounts: new ZernioAccountPort(client, config.ZERNIO_PROFILE_PREFIX),
    channels: staticChannelCatalog(ZERNIO_CHANNELS),
    webhookSource: zernioWebhookSource(config.ZERNIO_WEBHOOK_SECRET),
    webhookHandlers: webhookHandlers as WebhookEventHandler<never>[],
    publishing: new ZernioSocialPublishingAdapter(client),
    socialCatalog,
    publishingSettings: {
      // Zernio has no scheduling horizon, so the hand-off margin is unused; kept for the shared service shape.
      handoffMarginMs: 0,
      inlineDispatch: opts.inlineDispatch ?? true,
      ...(opts.skipMediaDnsCheck ? { skipMediaDnsCheck: true } : {}),
    },
  };

  const housekeepingHooks = modules.flatMap((m) => (m.housekeeping ? [m.housekeeping] : []));
  const jobs: Record<string, JobHandler<ZernioGatewayContext>> = { ...gatewayJobHandlers<ZernioGatewayContext>(housekeepingHooks) };
  for (const m of modules) {
    for (const [type, handler] of Object.entries(m.jobs ?? {})) {
      if (jobs[type]) throw new Error(`Duplicate job type ${type}`);
      jobs[type] = handler;
    }
  }
  const periodic = [...GATEWAY_PERIODIC_JOBS, ...modules.flatMap((m) => m.periodic ?? [])];
  const ticks = modules.flatMap((m) => m.ticks ?? []);

  const identity = {
    gateway: ZERNIO,
    provider: ZERNIO,
    displayName: "Zernio Gateway",
    gatewayContractVersion: GATEWAY_CONTRACT_VERSION,
    version: opts.version ?? ZERNIO_GATEWAY_VERSION,
  } as const;

  const gateway: Gateway = {
    describe(): GatewayDescriptor {
      return { ...identity, capabilities: registry.descriptors(), channels: ZERNIO_CHANNELS.map((c) => c.channel) };
    },
    async capabilities(workspaceId: string): Promise<CapabilityAvailability[]> {
      const ws = await ensureWorkspace(ctx.db, workspaceId);
      return registry.availability(ctx, ws);
    },
    async health(): Promise<GatewayHealth> {
      let checks: GatewayHealth["checks"];
      try {
        checks = opts.healthProbe ? await opts.healthProbe() : {};
      } catch {
        checks = { probe: { ok: false, detail: "health probe failed" } };
      }
      checks.catalog = { ok: true, detail: `zernio social catalog ${ZERNIO_SOCIAL_CATALOG_VERSION}` };
      const failed = Object.values(checks).filter((c) => !c.ok).length;
      return { status: failed === 0 ? "ok" : checks.database?.ok === false ? "unavailable" : "degraded", checks, checkedAt: now().toISOString() };
    },
  };

  const social = registry.get("social.publishing") !== undefined;
  return {
    gateway,
    ctx,
    registry,
    jobs,
    periodic,
    ticks,
    client,
    presentConnection: (c) => (social ? toSocialConnection(c, socialCatalog) : c),
  };
}
