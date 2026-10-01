import { GatewayError, UpstreamError } from "@zeptly-gateway/gateway-contract";
import { connections, getConnectionsForWorkspace, safeMessage } from "@zeptly-gateway/gateway-core";
import type { SocialPublishingContext } from "./context.js";

/**
 * A provider refusing an account's credentials (kind "auth": expired/revoked token) is a connection problem, not a
 * gateway-credential problem. Flag the affected connections `reauthorization_required` (so Zeptly can offer a one-click
 * reconnect and stops sending doomed requests) and return a precise, retry-after-reconnect error.
 * Returns undefined for any other error.
 */
export async function reauthorizationFromAuthError(ctx: SocialPublishingContext, workspaceId: string, connectionIds: string[], err: unknown): Promise<GatewayError | undefined> {
  if (!(err instanceof UpstreamError) || err.kind !== "auth") return undefined;
  const now = ctx.now();
  const found = await getConnectionsForWorkspace(ctx.db, workspaceId, connectionIds);
  for (const c of found.values()) {
    await connections.markReauthorizationRequired(ctx.db, { service: "worker", requestId: "auth-failure" }, c.connection, safeMessage(err), now);
  }
  return new GatewayError("REAUTHORIZATION_REQUIRED", "The connected account's authorisation has expired or was revoked; reconnect it to continue", {
    details: { connectionIds, provider: { name: err.provider, message: safeMessage(err).slice(0, 300) } },
    retryable: false,
  });
}
