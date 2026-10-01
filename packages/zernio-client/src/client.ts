import type { Logger } from "@zeptly-gateway/observability";
import { ZERNIO, ZernioError } from "./errors.js";
import { platformFor } from "./vocabulary.js";
import { ZernioHttp } from "./http.js";
import type { ZernioAccount, ZernioAccountHealth, ZernioCreatePostInput, ZernioPostState, ZernioProfile } from "./types.js";
import { ZernioWebhookVerifier } from "./webhooks.js";
import { accountListResponse, accountsHealthResponse, mapAccountHealth, connectedAccountResponse, connectUrlResponse, currentUserResponse, mapAccount, mapPost, mapProfile, parseOrProtocolError, postResponse, profileListResponse, profileResponse } from "./wire.js";

export interface ZernioClientOptions {
  apiKey: string;
  webhookSecret: string;
  /** Default https://zernio.com/api */
  baseUrl?: string;
  logger?: Logger;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
  maxAttempts?: number;
  retryBaseMs?: number;
}

export const DEFAULT_ZERNIO_BASE_URL = "https://zernio.com/api";

/**
 * The only code in the Zeptly gateway estate that speaks Zernio HTTP.
 * Wire shapes are private (./wire.ts); callers receive the typed results in ./types.ts.
 */
export class ZernioClient {
  readonly provider = ZERNIO;
  readonly webhooks: ZernioWebhookVerifier;
  private readonly http: ZernioHttp;

  constructor(opts: ZernioClientOptions) {
    this.http = new ZernioHttp({
      apiKey: opts.apiKey,
      baseUrl: opts.baseUrl ?? DEFAULT_ZERNIO_BASE_URL,
      ...(opts.logger ? { logger: opts.logger } : {}),
      ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
      ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
      ...(opts.maxAttempts !== undefined ? { maxAttempts: opts.maxAttempts } : {}),
      ...(opts.retryBaseMs !== undefined ? { retryBaseMs: opts.retryBaseMs } : {}),
    });
    this.webhooks = new ZernioWebhookVerifier(opts.webhookSecret);
  }

  /* ---------------------------- profiles ---------------------------- */

  async listProfiles(): Promise<ZernioProfile[]> {
    const json = await this.http.request("/v1/profiles");
    return parseOrProtocolError(profileListResponse, json, "GET /v1/profiles").profiles.map(mapProfile);
  }

  async findProfileByName(name: string): Promise<ZernioProfile | undefined> {
    return (await this.listProfiles()).find((p) => p.name === name);
  }

  /**
   * Find-or-create. Zernio profile names are unique per team, so a lost create
   * response converges: a duplicate returns 409 with the existing profile id.
   */
  async ensureProfile(name: string): Promise<ZernioProfile> {
    const existing = await this.findProfileByName(name);
    if (existing) return existing;
    try {
      const json = await this.http.request("/v1/profiles", { method: "POST", body: { name }, idempotencyKey: `profile:${name}`.slice(0, 200), mutating: true });
      return mapProfile(parseOrProtocolError(profileResponse, json, "POST /v1/profiles").profile);
    } catch (err) {
      if (err instanceof ZernioError && err.kind === "conflict" && typeof err.details?.existingProfileId === "string") {
        return { id: err.details.existingProfileId, name };
      }
      throw err;
    }
  }

  /* ---------------------------- accounts ---------------------------- */

  /**
   * `reconnectAccountId` is Zernio's safe reconnect: it refreshes THAT existing account (same account id, so posts and
   * mappings stay attached) and rejects a login that would land on a different account (`reconnect_account_mismatch`).
   */
  async getConnectUrl(input: { platform: string; profileId: string; redirectUrl: string; reconnectAccountId?: string }): Promise<{ authorizationUrl: string }> {
    const platform = platformFor(input.platform);
    assertSlug(platform);
    const json = await this.http.request(`/v1/connect/${platform}`, {
      query: { profileId: input.profileId, redirect_url: input.redirectUrl, ...(input.reconnectAccountId ? { reconnectAccountId: input.reconnectAccountId } : {}) },
    });
    return { authorizationUrl: parseOrProtocolError(connectUrlResponse, json, "GET /v1/connect/{platform}").authUrl };
  }

  /** Bluesky connects with a handle/email + app password. The credentials are forwarded once and never stored or logged. */
  async connectBlueskyWithCredentials(input: { profileId: string; identifier: string; appPassword: string }): Promise<ZernioAccount> {
    const user = parseOrProtocolError(currentUserResponse, await this.http.request("/v1/users"), "GET /v1/users");
    const json = await this.http.request("/v1/connect/bluesky/credentials", {
      method: "POST",
      body: { identifier: input.identifier, appPassword: input.appPassword, state: `${user.currentUserId}-${input.profileId}` },
      mutating: true,
    });
    return mapAccount(parseOrProtocolError(connectedAccountResponse, json, "POST /v1/connect/bluesky/credentials").account);
  }

  async listAccounts(filter: { profileId?: string } = {}): Promise<ZernioAccount[]> {
    const json = await this.http.request("/v1/accounts", { query: { ...(filter.profileId ? { profileId: filter.profileId } : {}) } });
    return parseOrProtocolError(accountListResponse, json, "GET /v1/accounts").accounts.map(mapAccount);
  }

  /**
   * Token health of every account (`GET /v1/accounts/health`). Zernio's account list keeps `isActive: true` for an account
   * whose OAuth token can no longer be refreshed; this endpoint is what reports it. Best effort: callers treat a failure as "unknown".
   */
  async getAccountsHealth(filter: { profileId?: string } = {}): Promise<ZernioAccountHealth[]> {
    const json = await this.http.request("/v1/accounts/health", { query: { ...(filter.profileId ? { profileId: filter.profileId } : {}) } });
    return parseOrProtocolError(accountsHealthResponse, json, "GET /v1/accounts/health").accounts.map(mapAccountHealth).filter((h): h is ZernioAccountHealth => h !== undefined);
  }

  /** Idempotent: an already-disconnected account resolves successfully. */
  async disconnectAccount(externalId: string): Promise<void> {
    try {
      await this.http.request(`/v1/accounts/${encodeURIComponent(externalId)}`, { method: "DELETE", mutating: true });
    } catch (err) {
      if (err instanceof ZernioError && err.kind === "not_found") return;
      throw err;
    }
  }

  /* ------------------------------ posts ------------------------------ */

  async createPost(input: ZernioCreatePostInput): Promise<ZernioPostState> {
    const body: Record<string, unknown> = {
      content: input.text,
      ...(input.media.length
        ? { mediaItems: input.media.map((m) => ({ type: m.type, url: m.url, ...(m.filename ? { filename: m.filename } : {}), ...(m.mimeType ? { mimeType: m.mimeType } : {}), ...(m.size ? { size: m.size } : {}) })) }
        : {}),
      platforms: input.targets.map((t) => ({ platform: platformFor(t.platform), accountId: t.accountExternalId, ...(t.platformOptions ? { platformSpecificData: t.platformOptions } : {}) })),
      ...(input.scheduledAt ? { scheduledFor: input.scheduledAt.toISOString(), timezone: "UTC" } : {}),
      ...(input.publishNow ? { publishNow: true } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };
    const json = await this.http.request("/v1/posts", { method: "POST", body, idempotencyKey: input.idempotencyKey, mutating: true });
    return mapPost(parseOrProtocolError(postResponse, json, "POST /v1/posts").post);
  }

  async getPost(externalId: string): Promise<ZernioPostState> {
    const json = await this.http.request(`/v1/posts/${encodeURIComponent(externalId)}`);
    return mapPost(parseOrProtocolError(postResponse, json, "GET /v1/posts/{postId}").post);
  }

  /** Idempotent: an already-deleted post resolves successfully. */
  async deletePost(externalId: string): Promise<void> {
    try {
      await this.http.request(`/v1/posts/${encodeURIComponent(externalId)}`, { method: "DELETE", mutating: true });
    } catch (err) {
      if (err instanceof ZernioError && err.kind === "not_found") return;
      throw err;
    }
  }

  /**
   * Remove an already-PUBLISHED post from its network (`POST /v1/posts/{id}/unpublish`); Zernio keeps the post
   * record (status "cancelled"). `DELETE /v1/posts/{id}` refuses published posts, so this is a separate operation.
   * Idempotent: a post that no longer exists resolves successfully. Zernio does not support it on Instagram, TikTok
   * or Snapchat (the call is refused here, before any request).
   */
  async unpublishPost(input: { externalId: string; channel: string; accountExternalId?: string }): Promise<void> {
    const platform = platformFor(input.channel);
    assertSlug(platform);
    if (UNPUBLISH_UNSUPPORTED.has(input.channel)) {
      throw new ZernioError("unsupported", `Unpublishing is not supported for ${input.channel}`, { retryable: false, ambiguous: false });
    }
    const body = { platform, ...(input.accountExternalId ? { accountId: input.accountExternalId } : {}) };
    try {
      await this.http.request(`/v1/posts/${encodeURIComponent(input.externalId)}/unpublish`, { method: "POST", body, mutating: true });
    } catch (err) {
      if (err instanceof ZernioError && err.kind === "not_found") return;
      throw err;
    }
  }
}

/** Networks on which Zernio documents that unpublishing is NOT supported. */
const UNPUBLISH_UNSUPPORTED: ReadonlySet<string> = new Set(["instagram", "tiktok", "snapchat"]);

function assertSlug(platform: string): void {
  if (!/^[a-z][a-z0-9]{1,31}$/.test(platform)) throw new ZernioError("validation", "Invalid platform", { retryable: false, ambiguous: false });
}
