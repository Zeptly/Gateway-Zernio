import { createHmac, timingSafeEqual } from "node:crypto";
import type { WebhookSignatureCheck } from "@zeptly-gateway/gateway-contract";
import { z } from "zod";
import { ZernioError } from "./errors.js";
import type { ParsedZernioWebhook, ZernioWebhookEvent } from "./types.js";

/**
 * Zernio webhook contract (docs.zernio.com, API 1.181.0):
 *
 *   X-Zernio-Signature: lowercase hex HMAC-SHA256(raw body, endpoint secret)
 *   X-Zernio-Event-Id:  the payload's `id`, stable across retries/redeliveries (dedupe key)
 *   Payload: { id, event, timestamp, ... }
 *   post.platform.published | post.platform.failed  → { post{id}, platform{}, account{accountId} }
 *   account.disconnected                             → { account{accountId, disconnectionType, reason} }
 *   webhook.test                                     → { message }
 *   every other event                                → acknowledged and ignored by this gateway
 */
export const SIGNATURE_HEADER = "x-zernio-signature";
const SIGNATURE_FORMAT = /^[0-9a-f]{64}$/i;

export function computeSignature(secret: string, rawBody: Buffer | string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function verifySignature(rawBody: Buffer, header: string | undefined, secret: string): WebhookSignatureCheck {
  if (!secret) throw new Error("Zernio webhook secret is not configured");
  if (header === undefined || header.trim() === "") return "missing";
  const sig = header.trim();
  if (!SIGNATURE_FORMAT.test(sig)) return "invalid";
  const got = Buffer.from(sig, "hex");
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  if (got.length !== expected.length) return "invalid";
  return timingSafeEqual(expected, got) ? "valid" : "invalid";
}

const str = z.string().trim().min(1);
const optStr = z
  .string()
  .nullish()
  .transform((v) => (v ? v : undefined));

const envelope = z.object({ id: str, event: str, timestamp: z.iso.datetime({ offset: true }).optional() }).loose();
const platformEvent = z
  .object({
    post: z.object({ id: str }).loose(),
    platform: z.object({ platformPostId: optStr, publishedUrl: optStr, error: optStr, accountId: optStr }).loose().optional(),
    account: z.object({ accountId: str }).loose(),
  })
  .loose();
const disconnected = z
  .object({ account: z.object({ accountId: str, disconnectionType: optStr, reason: optStr }).loose() })
  .loose();

export class ZernioWebhookVerifier {
  constructor(private readonly secret: string) {}

  verify(rawBody: Buffer, signature: string | undefined): WebhookSignatureCheck {
    return verifySignature(rawBody, signature, this.secret);
  }

  /** Parse a payload that has already passed verify(). Throws ZernioError(protocol) when malformed. */
  parse(rawBody: Buffer): ParsedZernioWebhook {
    let json: unknown;
    try {
      json = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new ZernioError("protocol", "Zernio webhook body is not JSON", { retryable: false, ambiguous: false });
    }
    const env = envelope.safeParse(json);
    if (!env.success) throw new ZernioError("protocol", "Zernio webhook envelope is malformed", { retryable: false, ambiguous: false });
    const occurredAt = env.data.timestamp ? new Date(env.data.timestamp) : new Date();
    const fail = (what: string) => new ZernioError("protocol", `Zernio ${env.data.event} payload is malformed (${what})`, { retryable: false, ambiguous: false });
    let event: ZernioWebhookEvent;
    switch (env.data.event) {
      case "post.platform.published":
      case "post.platform.failed": {
        const p = platformEvent.safeParse(json);
        if (!p.success) throw fail("post/account");
        const published = env.data.event === "post.platform.published";
        event = {
          kind: "post_outcome",
          providerPostId: p.data.post.id,
          occurredAt,
          accounts: [
            {
              accountExternalId: p.data.account.accountId,
              outcome: published ? "published" : "failed",
              ...(p.data.platform?.platformPostId ? { platformPostId: p.data.platform.platformPostId } : {}),
              ...(p.data.platform?.publishedUrl ? { platformPostUrl: p.data.platform.publishedUrl } : {}),
              ...(!published ? { error: p.data.platform?.error ?? "Publication failed at the provider" } : {}),
            },
          ],
        };
        break;
      }
      case "account.disconnected": {
        const d = disconnected.safeParse(json);
        if (!d.success) throw fail("account");
        event = { kind: "account_disconnected", accountExternalId: d.data.account.accountId, unintentional: d.data.account.disconnectionType === "unintentional", ...(d.data.account.reason ? { reason: d.data.account.reason } : {}), occurredAt };
        break;
      }
      case "webhook.test":
        event = { kind: "test", occurredAt };
        break;
      default:
        event = { kind: "ignored", occurredAt };
    }
    return { eventId: env.data.id, type: env.data.event, event };
  }
}
