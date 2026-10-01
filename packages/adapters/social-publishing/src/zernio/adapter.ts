import { createHash } from "node:crypto";
import { UpstreamError } from "@zeptly-gateway/gateway-contract";
import type { ZernioClient, ZernioMediaItem, ZernioPostState } from "@zeptly-gateway/zernio-client";

/** X accounts post 280 characters unless the provider reports a higher account ceiling. */
const X_DEFAULT_MAX_CHARS = 280;
import { ZERNIO } from "@zeptly-gateway/zernio-client";
import type { PreparedUpload, PublishRequest, RemoteMedia, RemotePostState, SocialPublishingPort } from "../port.js";

/**
 * Zernio implementation of the Social Publishing port. It translates between
 * the provider-neutral port types and the Zernio client's typed results;
 * Zernio transport, auth, wire shapes and error mapping stay inside
 * @zeptly-gateway/zernio-client.
 *
 * Scope: URL-referenced media, immediate publish, scheduling (Zernio accepts any
 * future `scheduledFor`, so there is no hand-off horizon), read and delete.
 * In-place post update and direct uploads are not implemented in this slice.
 */
export class ZernioSocialPublishingAdapter implements SocialPublishingPort {
  readonly provider = ZERNIO;
  readonly schedulingHorizonMs = undefined;
  readonly supportsPostUpdate = false;

  constructor(private readonly client: ZernioClient) {}

  prepareUpload(): Promise<PreparedUpload> {
    return Promise.reject(unsupported("Direct media upload"));
  }

  confirmUpload(): Promise<RemoteMedia> {
    return Promise.reject(unsupported("Direct media upload"));
  }

  /** Zernio ingests media by URL at publish time: registration records a durable reference only. */
  uploadFromUrl(input: { sourceUrl: string; filename: string; contentType: string; maxBytes: number }): Promise<RemoteMedia> {
    return Promise.resolve({
      externalId: `url_${createHash("sha256").update(input.sourceUrl).digest("hex").slice(0, 32)}`,
      url: input.sourceUrl,
      filename: input.filename,
      contentType: input.contentType,
    });
  }

  async publish(input: PublishRequest): Promise<RemotePostState> {
    await this.assertAccountLimits(input);
    return toRemotePost(await this.client.createPost(this.toCreate(input, { publishNow: true })));
  }

  async schedule(input: PublishRequest & { scheduledAt: Date }): Promise<RemotePostState> {
    await this.assertAccountLimits(input);
    return toRemotePost(await this.client.createPost(this.toCreate(input, { scheduledAt: input.scheduledAt })));
  }

  /**
   * Account-specific limits are provider mechanics and live here, not in Zeptly. X text is checked against
   * the account's ceiling (280 unless Zernio reports more) BEFORE any create call; nothing is truncated.
   */
  private async assertAccountLimits(input: PublishRequest): Promise<void> {
    if (input.network !== "x") return;
    const chars = [...input.text].length;
    if (chars <= X_DEFAULT_MAX_CHARS) return;
    const accounts = await this.client.listAccounts();
    for (const id of input.accountExternalIds) {
      const max = accounts.find((a) => a.externalId === id)?.maxPostChars ?? X_DEFAULT_MAX_CHARS;
      if (chars > max) {
        throw new UpstreamError(ZERNIO, "validation", `X post is ${chars} characters; this account allows ${max}`, {
          retryable: false,
          ambiguous: false,
          details: { providerCode: "X_CHAR_LIMIT_EXCEEDED", chars, max },
        });
      }
    }
  }

  async getPost(externalId: string): Promise<RemotePostState> {
    return toRemotePost(await this.client.getPost(externalId));
  }

  deletePost(externalId: string): Promise<void> {
    return this.client.deletePost(externalId);
  }

  private toCreate(input: PublishRequest, mode: { publishNow: true } | { scheduledAt: Date }) {
    return {
      idempotencyKey: input.idempotencyKey,
      text: input.text,
      media: input.media.map(toZernioMedia),
      targets: input.accountExternalIds.map((accountExternalId) => ({
        platform: input.network,
        accountExternalId,
        ...(Object.keys(input.options).length ? { platformOptions: input.options } : {}),
      })),
      ...mode,
    };
  }
}

function unsupported(what: string): UpstreamError {
  return new UpstreamError(ZERNIO, "unsupported", `${what} is not supported by the Zernio gateway`, { retryable: false, ambiguous: false });
}

function toZernioMedia(m: RemoteMedia): ZernioMediaItem {
  const ct = (m.contentType ?? "").toLowerCase();
  const type: ZernioMediaItem["type"] = ct === "image/gif" ? "gif" : ct.startsWith("video/") ? "video" : ct.startsWith("image/") ? "image" : "document";
  return { type, url: m.url, filename: m.filename, ...(m.contentType ? { mimeType: m.contentType } : {}), ...(m.sizeBytes ? { size: m.sizeBytes } : {}) };
}

function toRemotePost(p: ZernioPostState): RemotePostState {
  return {
    externalId: p.externalId,
    ...(p.scheduledAt ? { scheduledAt: p.scheduledAt } : {}),
    ...(p.publishedAt ? { publishedAt: p.publishedAt } : {}),
    targets: p.targets.map((t) => ({
      accountExternalId: t.accountExternalId,
      status: t.status,
      ...(t.platformPostId ? { platformPostId: t.platformPostId } : {}),
      ...(t.platformPostUrl ? { platformPostUrl: t.platformPostUrl } : {}),
      ...(t.error ? { error: t.error } : {}),
      ...(t.publishedAt ? { publishedAt: t.publishedAt } : {}),
    })),
  };
}
