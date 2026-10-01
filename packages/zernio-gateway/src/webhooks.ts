import type { WebhookEnvelope } from "@zeptly-gateway/gateway-contract";
import { GATEWAY_EVENT_KINDS, type WebhookSource } from "@zeptly-gateway/gateway-core";
import { PUBLICATION_OUTCOME_EVENT } from "@zeptly-gateway/social-publishing";
import { SIGNATURE_HEADER, ZERNIO, type ZernioWebhookEvent, ZernioWebhookVerifier } from "@zeptly-gateway/zernio-client";

/**
 * Zernio webhooks → gateway webhook envelopes. Signature verification and
 * payload parsing stay in the Zernio client; this maps Zernio's typed facts
 * onto the event kinds claimed by gateway infrastructure and capabilities.
 */
export function zernioWebhookSource(secret: string): WebhookSource {
  const verifier = new ZernioWebhookVerifier(secret);
  return {
    provider: ZERNIO,
    signatureHeader: SIGNATURE_HEADER,
    verify: (rawBody, signature) => verifier.verify(rawBody, signature),
    parse(rawBody): WebhookEnvelope {
      const parsed = verifier.parse(rawBody);
      return { provider: ZERNIO, eventType: parsed.type, eventId: parsed.eventId, occurredAt: parsed.event.occurredAt, event: toGatewayEvent(parsed.event) };
    },
  };
}

function toGatewayEvent(e: ZernioWebhookEvent): { kind: string } & Record<string, unknown> {
  switch (e.kind) {
    case "post_outcome":
      return { kind: PUBLICATION_OUTCOME_EVENT, providerPostId: e.providerPostId, accounts: e.accounts.map((a) => ({ ...a })) };
    case "account_disconnected":
      // Intentional disconnects are user actions on the provider side; only token loss needs a reconnect.
      return e.unintentional
        ? { kind: GATEWAY_EVENT_KINDS.accountReauthorizationRequired, accountExternalId: e.accountExternalId, ...(e.reason ? { reason: e.reason } : {}) }
        : { kind: GATEWAY_EVENT_KINDS.ignored };
    case "test":
      return { kind: GATEWAY_EVENT_KINDS.test };
    case "ignored":
      return { kind: GATEWAY_EVENT_KINDS.ignored };
  }
}
