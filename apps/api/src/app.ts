import { randomUUID } from "node:crypto";
import fastifySwagger from "@fastify/swagger";
import { ApiErrorBodySchema, isGatewayError, GatewayError, GATEWAY_CONTRACT_VERSION } from "@zeptly-gateway/gateway-contract";
import { type Actor, type AuthenticatedCaller, ensureWorkspace, type ServiceAuthenticator } from "@zeptly-gateway/gateway-core";
import type { ZernioGatewayRuntime } from "@zeptly-gateway/zernio-gateway";
import { LOG_REDACT_PATHS, type Logger } from "@zeptly-gateway/observability";
import Fastify, { type FastifyBaseLogger, type FastifyInstance, type FastifyRequest } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerConnectionRoutes } from "./routes/connections.js";
import { registerGatewayRoutes } from "./routes/gateway.js";
import { registerHealthRoutes, type ReadinessProbe } from "./routes/health.js";
import { registerMediaRoutes } from "./routes/media.js";
import { registerNetworkRoutes } from "./routes/networks.js";
import { registerPostRoutes } from "./routes/posts.js";
import { registerWebhookRoutes } from "./routes/webhooks.js";

export type AuthMode = "workspace" | "service" | "public";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
    caller?: AuthenticatedCaller;
    actor?: Actor;
  }
  interface FastifyContextConfig {
    auth?: AuthMode;
    /** Set on deprecated alias routes: the canonical successor path. */
    successor?: string;
  }
}

export interface BuildAppOptions {
  runtime: ZernioGatewayRuntime;
  authenticator: ServiceAuthenticator;
  readiness: ReadinessProbe;
  logger?: Logger | false;
  version?: string;
}

export const API_VERSION = "0.1.0";
/** Capability contracts this API serves (id@version). Published in the OpenAPI document. */
export const FROZEN_CAPABILITY_CONTRACTS = ["social.publishing@1", "social.scheduling@1"] as const;
const REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

export type App = FastifyInstance;

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    ...(opts.logger ? { loggerInstance: opts.logger as unknown as FastifyBaseLogger } : { logger: false }),
    bodyLimit: 1024 * 1024,
    trustProxy: true,
    genReqId: (req) => {
      const h = req.headers["x-request-id"];
      return typeof h === "string" && REQUEST_ID.test(h) ? h : randomUUID();
    },
  }) as unknown as FastifyInstance;

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Keep the exact raw bytes: required for request signatures and webhook HMACs.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body: Buffer, done) => {
    (req as FastifyRequest).rawBody = body;
    if (body.length === 0) return done(null, undefined);
    try {
      done(null, JSON.parse(body.toString("utf8")));
    } catch {
      done(new GatewayError("VALIDATION_ERROR", "Request body is not valid JSON"), undefined);
    }
  });

  await app.register(fastifySwagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "Zernio Gateway API",
        version: opts.version ?? API_VERSION,
        ...({ "x-gateway-contract-version": GATEWAY_CONTRACT_VERSION, "x-capability-contracts": FROZEN_CAPABILITY_CONTRACTS } as object),
        description:
          "Zeptly's gateway to Zernio. Implements Gateway Contract v1 (/v1/gateway, /v1/capabilities, /v1/connections) and the capability contracts Zernio backs in this gateway: Social Publishing v1 (/v1/social/publishing) and Social Scheduling v1. Provider identifiers never appear in responses. Authenticated with ZS1-HMAC-SHA256 service signatures (see docs/SECURITY.md).",
      },
      components: {
        securitySchemes: {
          zeptlyServiceSignature: {
            type: "apiKey",
            in: "header",
            name: "X-Zeptly-Signature",
            description:
              "ZS1-HMAC-SHA256 signature. Also requires X-Zeptly-Caller, X-Zeptly-Timestamp and (workspace routes) X-Zeptly-Workspace-Id. See docs/SECURITY.md.",
          },
        },
      },
      tags: [
        { name: "gateway", description: "Gateway Contract v1: identity, capability discovery, health" },
        { name: "connections", description: "Gateway Contract v1: provider-account provisioning and connection lifecycle" },
        { name: "social-publishing", description: "Social Publishing Contract v1 (+ Social Scheduling v1)" },
        { name: "webhooks" },
        { name: "admin" },
        { name: "health" },
      ],
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  });

  app.addHook("onSend", async (req, reply) => {
    reply.header("x-request-id", req.id);
    reply.header("cache-control", "no-store");
  });

  app.addHook("preValidation", async (req) => {
    const mode: AuthMode = req.routeOptions.config.auth ?? "workspace";
    if (mode === "public") return;
    const caller = opts.authenticator.authenticate({ method: req.method, url: req.url, headers: req.headers, rawBody: req.rawBody });
    req.caller = caller;
    if (mode === "workspace") {
      if (!caller.workspaceExternalId) throw new GatewayError("WORKSPACE_FORBIDDEN", "X-Zeptly-Workspace-Id is required");
      const workspace = await ensureWorkspace(opts.runtime.ctx.db, caller.workspaceExternalId);
      req.actor = { workspace, service: caller.service, ...(caller.agent ? { agent: caller.agent } : {}), requestId: req.id };
      req.log = req.log.child({ workspaceId: caller.workspaceExternalId, caller: caller.service });
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (isGatewayError(err)) {
      if (err.status >= 500) req.log.error({ err, code: err.code, details: err.details }, "request failed");
      else req.log.info({ code: err.code }, "request rejected");
      if (err.code === "PROVIDER_RATE_LIMITED" && typeof err.details?.retryAfterSeconds === "number") reply.header("retry-after", String(err.details.retryAfterSeconds));
      return reply.status(err.status).send(err.toJSON(req.id));
    }
    if (hasZodFastifySchemaValidationErrors(err)) {
      const issues = err.validation.map((v) => ({ path: v.instancePath, message: v.message ?? "invalid" }));
      return reply.status(400).send(new GatewayError("VALIDATION_ERROR", "Request validation failed", { details: { issues } }).toJSON(req.id));
    }
    const e = err as { statusCode?: number; code?: string; message?: string };
    if (e.statusCode === 413) return reply.status(413).send(new GatewayError("VALIDATION_ERROR", "Request body too large", { status: 413 }).toJSON(req.id));
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
      return reply.status(e.statusCode).send(new GatewayError("VALIDATION_ERROR", "Invalid request", { status: e.statusCode, details: { reason: e.code } }).toJSON(req.id));
    }
    req.log.error({ err }, "unhandled error");
    return reply.status(500).send(new GatewayError("INTERNAL_ERROR", "Unexpected internal error").toJSON(req.id));
  });

  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send(new GatewayError("NOT_FOUND", "Route not found").toJSON(req.id));
  });

  const rt = opts.runtime;
  registerHealthRoutes(app, opts.readiness);
  registerGatewayRoutes(app, rt);
  registerConnectionRoutes(app, rt);
  // Capability surfaces exist only for capabilities composed into this gateway.
  if (rt.registry.get("social.publishing")) {
    registerNetworkRoutes(app, rt);
    registerMediaRoutes(app, rt.ctx);
    registerPostRoutes(app, rt.ctx);
  }
  registerWebhookRoutes(app, rt.ctx);
  registerAdminRoutes(app, rt);

  app.get("/openapi.json", { config: { auth: "public" }, schema: { hide: true } }, async () => app.swagger());

  return app;
}

export const errorResponses = {
  400: ApiErrorBodySchema,
  401: ApiErrorBodySchema,
  403: ApiErrorBodySchema,
  404: ApiErrorBodySchema,
  409: ApiErrorBodySchema,
  422: ApiErrorBodySchema,
  429: ApiErrorBodySchema,
  502: ApiErrorBodySchema,
  503: ApiErrorBodySchema,
} as const;

export function actorOf(req: FastifyRequest): Actor {
  if (!req.actor) throw new GatewayError("AUTHENTICATION_FAILED", "Unauthenticated");
  return req.actor;
}

export function idempotencyHeader(req: FastifyRequest): string | undefined {
  const v = req.headers["idempotency-key"];
  return typeof v === "string" ? v : undefined;
}

export { LOG_REDACT_PATHS };
