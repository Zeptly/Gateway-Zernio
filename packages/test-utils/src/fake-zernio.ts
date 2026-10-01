import { createHash, createHmac, randomBytes } from "node:crypto";

/**
 * Stateful in-memory fake of the parts of the Zernio REST API this gateway uses,
 * written against the public OpenAPI (docs.zernio.com, API 1.181.0): profiles
 * (unique names, 409 + details.existingProfileId), hosted OAuth connect that
 * redirects back with `connected, profileId, accountId`, accounts, posts with
 * Idempotency-Key replay (200 + original post), content-hash dedup (409),
 * per-platform statuses, signed webhooks.
 *
 * It is a TEST DOUBLE: passing tests against it is "automated/mocked" evidence,
 * never live provider validation.
 */
export const FAKE_ZERNIO_BASE = "https://fake.zernio.test/api";
export const FAKE_ZERNIO_AUTH_HOST = "https://fake.zernio.test/oauth";
export const FAKE_ZERNIO_USER_ID = "66a000000000000000000001";

export interface FakeZAccount {
  _id: string;
  platform: string;
  profileId: string;
  username: string;
  displayName: string;
  isActive: boolean;
  needsReconnection?: boolean;
  /** Zernio keeps the account listed as active, but its OAuth token can no longer be refreshed. */
  tokenExpired?: boolean;
  metadata?: Record<string, unknown>;
}
export interface FakeZProfile {
  _id: string;
  name: string;
}
export interface FakeZTarget {
  platform: string;
  accountId: string;
  status: "pending" | "published" | "failed" | "cancelled";
  platformPostId?: string;
  platformPostUrl?: string;
  errorMessage?: string;
}
export interface FakeZPost {
  _id: string;
  content: string;
  status: "draft" | "scheduled" | "publishing" | "published" | "partial" | "failed";
  scheduledFor?: string;
  publishedAt?: string;
  platforms: FakeZTarget[];
  body: Record<string, unknown>;
}

export type ZFault = { status: number; body?: unknown; headers?: Record<string, string> } | { networkError: true; afterApply?: boolean };

export class FakeZernio {
  profiles = new Map<string, FakeZProfile>();
  accounts = new Map<string, FakeZAccount>();
  posts = new Map<string, FakeZPost>();
  idempotency = new Map<string, string>();
  fingerprints = new Map<string, string>();
  pendingConnects = new Map<string, { platform: string; profileId: string; redirectUrl: string; reconnectAccountId?: string }>();
  requests: Array<{ method: string; path: string; query: Record<string, string>; headers: Record<string, string>; body: unknown }> = [];
  faults: Array<{ match: (method: string, path: string) => boolean; fault: ZFault; remaining: number }> = [];
  now: () => Date = () => new Date();
  private seq = 0;
  /** Platform-outcome of immediate publishes: accountId → error (fails that target). */
  failAccount = new Map<string, string>();

  constructor(readonly apiKey = "test-zernio-key") {}

  id(): string {
    this.seq++;
    return `${randomBytes(8).toString("hex")}${this.seq.toString(16).padStart(8, "0")}`.slice(0, 24);
  }

  addProfile(name: string): FakeZProfile {
    const p = { _id: this.id(), name };
    this.profiles.set(p._id, p);
    return p;
  }

  addAccount(a: Partial<FakeZAccount> & { platform: string; profileId: string }): FakeZAccount {
    const acct: FakeZAccount = {
      _id: a._id ?? this.id(),
      platform: a.platform,
      profileId: a.profileId,
      username: a.username ?? `${a.platform}_user_${this.seq}`,
      displayName: a.displayName ?? `${a.platform} account ${this.seq}`,
      isActive: a.isActive ?? true,
      ...(a.needsReconnection ? { needsReconnection: true } : {}),
      ...(a.metadata ? { metadata: a.metadata } : {}),
    };
    this.accounts.set(acct._id, acct);
    return acct;
  }

  fail(method: string, pathPrefix: string | RegExp, fault: ZFault, times = 1): void {
    this.faults.push({ match: (m, p) => m === method && (typeof pathPrefix === "string" ? p.startsWith(pathPrefix) : pathPrefix.test(p)), fault, remaining: times });
  }

  /** Simulate the end user finishing hosted OAuth: creates the account and returns the browser redirect Zernio would issue. */
  authorize(authUrl: string, account: Partial<FakeZAccount> = {}): { callbackUrl: string; account: FakeZAccount } {
    const state = new URL(authUrl).searchParams.get("state");
    const pending = state ? this.pendingConnects.get(state) : undefined;
    if (!pending) throw new Error("unknown auth url");
    // Safe reconnect refreshes THE SAME account (same id); otherwise a new account is created.
    const existing = pending.reconnectAccountId ? this.accounts.get(pending.reconnectAccountId) : undefined;
    if (existing) {
      existing.tokenExpired = false;
      existing.needsReconnection = false;
      existing.isActive = true;
    }
    const acct = existing ?? this.addAccount({ ...account, platform: pending.platform, profileId: pending.profileId });
    const cb = new URL(pending.redirectUrl);
    cb.searchParams.set("connected", pending.platform);
    cb.searchParams.set("profileId", pending.profileId);
    cb.searchParams.set("accountId", acct._id);
    cb.searchParams.set("username", acct.username);
    return { callbackUrl: cb.toString(), account: acct };
  }

  /** Build a signed webhook delivery (hex HMAC-SHA256 over the raw body, as documented). */
  webhook(secret: string, payload: Record<string, unknown>): { body: string; headers: Record<string, string> } {
    const body = JSON.stringify(payload);
    return { body, headers: { "content-type": "application/json", "x-zernio-signature": createHmac("sha256", secret).update(body).digest("hex"), "x-zernio-event-id": String(payload.id ?? "") } };
  }

  platformEvent(event: "post.platform.published" | "post.platform.failed", postId: string, accountId: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    const post = this.posts.get(postId);
    return {
      id: `evt_${this.id()}`,
      event,
      post: { id: postId, content: post?.content ?? "", status: post?.status ?? "publishing", scheduledFor: post?.scheduledFor ?? this.now().toISOString(), platforms: [] },
      platform: { platform: post?.platforms.find((t) => t.accountId === accountId)?.platform ?? "linkedin", status: event === "post.platform.published" ? "published" : "failed", accountId, ...extra },
      account: { accountId, id: accountId },
      timestamp: this.now().toISOString(),
    };
  }

  /** The fetch implementation handed to ZernioClient. */
  fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname.replace(/^\/api/, "");
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const query = Object.fromEntries(url.searchParams.entries());
    const body = typeof init?.body === "string" && init.body ? (JSON.parse(init.body) as unknown) : undefined;
    this.requests.push({ method, path, query, headers, body });

    const idx = this.faults.findIndex((f) => f.remaining > 0 && f.match(method, path));
    const faulted = idx >= 0 ? this.faults[idx] : undefined;
    if (faulted) {
      faulted.remaining--;
      if ("networkError" in faulted.fault) {
        if (faulted.fault.afterApply) await this.handle(method, path, query, headers, body);
        throw new TypeError("fetch failed");
      }
      return json(faulted.fault.status, faulted.fault.body ?? { error: "fault" }, faulted.fault.headers);
    }
    if (headers.authorization !== `Bearer ${this.apiKey}`) return json(401, { error: "Invalid API key" });
    return this.handle(method, path, query, headers, body);
  };

  private async handle(method: string, path: string, query: Record<string, string>, headers: Record<string, string>, body: unknown): Promise<Response> {
    const b = (body ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (path === "/v1/users" && method === "GET") return json(200, { currentUserId: FAKE_ZERNIO_USER_ID });

    if (path === "/v1/profiles" && method === "GET") return json(200, { profiles: [...this.profiles.values()] });
    if (path === "/v1/profiles" && method === "POST") {
      const key = headers["idempotency-key"];
      if (key && this.idempotency.has(`profile:${key}`)) return json(201, { message: "ok", profile: this.profiles.get(this.idempotency.get(`profile:${key}`) as string) });
      const dup = [...this.profiles.values()].find((p) => p.name === b.name);
      if (dup) return json(409, { error: "Profile name already exists", details: { existingProfileId: dup._id } });
      const p = this.addProfile(String(b.name));
      if (key) this.idempotency.set(`profile:${key}`, p._id);
      return json(201, { message: "Profile created", profile: p });
    }

    const connect = /^\/v1\/connect\/([a-z]+)$/.exec(path);
    if (connect && method === "GET") {
      const profileId = query.profileId;
      if (!profileId || !this.profiles.has(profileId)) return json(404, { error: "Profile not found" });
      const state = randomBytes(12).toString("hex");
      if (query.reconnectAccountId && !this.accounts.has(query.reconnectAccountId)) return json(404, { error: "reconnect_account_not_found" });
      this.pendingConnects.set(state, { platform: connect[1] as string, profileId, redirectUrl: query.redirect_url ?? "", ...(query.reconnectAccountId ? { reconnectAccountId: query.reconnectAccountId } : {}) });
      return json(200, { authUrl: `${FAKE_ZERNIO_AUTH_HOST}/${connect[1]}?state=${state}`, state });
    }
    if (path === "/v1/connect/bluesky/credentials" && method === "POST") {
      const [userId, profileId] = String(b.state ?? "").split("-");
      if (userId !== FAKE_ZERNIO_USER_ID || !profileId || !this.profiles.has(profileId)) return json(400, { error: "Invalid state" });
      if (b.appPassword === "wrong") return json(401, { error: "Invalid credentials" });
      const acct = this.addAccount({ platform: "bluesky", profileId, username: String(b.identifier) });
      return json(200, { message: "Connected", account: acct });
    }

    if (path === "/v1/accounts/health" && method === "GET") {
      const list = [...this.accounts.values()].filter((a) => !query.profileId || a.profileId === query.profileId);
      return json(200, { accounts: list.map((a) => ({ accountId: a._id, platform: a.platform, status: a.tokenExpired ? "error" : "healthy", tokenValid: !a.tokenExpired, needsReconnect: a.tokenExpired === true || a.needsReconnection === true })) });
    }
    if (path === "/v1/accounts" && method === "GET") {
      const list = [...this.accounts.values()].filter((a) => !query.profileId || a.profileId === query.profileId);
      return json(200, { accounts: list, hasAnalyticsAccess: false });
    }
    const acct = /^\/v1\/accounts\/([^/]+)$/.exec(path);
    if (acct && method === "DELETE") {
      if (!this.accounts.delete(decodeURIComponent(acct[1] as string))) return json(404, { error: "Account not found" });
      return json(200, { message: "Disconnected" });
    }

    if (path === "/v1/posts" && method === "POST") return this.createPost(headers, b);
    const unpub = /^\/v1\/posts\/([^/]+)\/unpublish$/.exec(path);
    if (unpub && method === "POST") {
      const p = this.posts.get(decodeURIComponent(unpub[1] as string));
      if (!p) return json(404, { error: "Post not found" });
      const platform = String(b.platform ?? "");
      const dead = p.platforms.map((t) => this.accounts.get(t.accountId)).find((a) => a?.tokenExpired && a.platform === platform);
      if (dead) return json(401, { error: `Token expired or revoked for ${platform}. Please reconnect your account.`, code: "TOKEN_EXPIRED" });
      if (!platform) return json(400, { error: "platform is required" });
      if (["instagram", "tiktok", "snapchat"].includes(platform)) return json(400, { error: `Unpublish is not supported on ${platform}` });
      const targets = p.platforms.filter((t) => t.platform === platform && (!b.accountId || t.accountId === b.accountId) && t.status === "published");
      if (targets.length === 0) return json(409, { error: "No published target on that platform" });
      for (const t of targets) t.status = "cancelled";
      if (p.platforms.every((t) => t.status === "cancelled")) (p as { status: string }).status = "cancelled";
      return json(200, { message: "Post unpublished", post: p });
    }
    const post = /^\/v1\/posts\/([^/]+)$/.exec(path);
    if (post) {
      const id = decodeURIComponent(post[1] as string);
      const p = this.posts.get(id);
      if (!p) return json(404, { error: "Post not found" });
      if (method === "GET") return json(200, { post: p });
      if (method === "DELETE") {
        if (p.status === "published") return json(400, { error: "Published posts cannot be deleted" });
        this.posts.delete(id);
        return json(200, { message: "Post deleted" });
      }
    }
    return json(404, { error: `No fake route for ${method} ${path}` });
  }

  private createPost(headers: Record<string, string>, b: Record<string, any>): Response { // eslint-disable-line @typescript-eslint/no-explicit-any
    const key = headers["idempotency-key"];
    if (key && this.idempotency.has(key)) {
      return json(200, { message: "Idempotent replay", post: this.posts.get(this.idempotency.get(key) as string) });
    }
    const platforms = (b.platforms ?? []) as Array<{ platform: string; accountId: string }>;
    if (platforms.length === 0) return json(400, { error: "platforms is required" });
    for (const t of platforms) {
      const a = this.accounts.get(t.accountId);
      if (!a) return json(400, { error: `Account ${t.accountId} not found` });
      if (a.platform !== t.platform) return json(400, { error: "Platform does not match the account" });
      const fp = createHash("sha256").update(`${t.platform}|${t.accountId}|${b.content ?? ""}|${JSON.stringify(b.mediaItems ?? [])}`).digest("hex");
      const existing = this.fingerprints.get(fp);
      if (existing && this.posts.has(existing)) return json(409, { error: "Duplicate content", accountId: t.accountId, platform: t.platform, existingPostId: existing });
    }
    const scheduled = typeof b.scheduledFor === "string" && !b.publishNow;
    const post: FakeZPost = {
      _id: this.id(),
      content: String(b.content ?? ""),
      status: b.publishNow ? "published" : scheduled ? "scheduled" : "draft",
      ...(scheduled ? { scheduledFor: b.scheduledFor as string } : {}),
      ...(b.publishNow ? { publishedAt: this.now().toISOString() } : {}),
      platforms: platforms.map((t) => {
        const err = this.failAccount.get(t.accountId);
        return b.publishNow
          ? err
            ? { platform: t.platform, accountId: t.accountId, status: "failed", errorMessage: err }
            : { platform: t.platform, accountId: t.accountId, status: "published", platformPostId: `pp_${this.id()}`, platformPostUrl: `https://${t.platform}.example/p/${this.seq}` }
          : { platform: t.platform, accountId: t.accountId, status: "pending" };
      }),
      body: b,
    };
    if (b.publishNow) post.status = post.platforms.every((t) => t.status === "failed") ? "failed" : post.platforms.some((t) => t.status === "failed") ? "partial" : "published";
    this.posts.set(post._id, post);
    if (key) this.idempotency.set(key, post._id);
    for (const t of platforms) this.fingerprints.set(createHash("sha256").update(`${t.platform}|${t.accountId}|${b.content ?? ""}|${JSON.stringify(b.mediaItems ?? [])}`).digest("hex"), post._id);
    return json(b.publishNow && post.status !== "published" ? 207 : 201, { message: "Post created", post });
  }

  /** Test hook: move a scheduled post's target to a terminal state (what Zernio's workers do at the scheduled time). */
  setTarget(postId: string, accountId: string, patch: Partial<FakeZTarget>): void {
    const p = this.posts.get(postId);
    const t = p?.platforms.find((x) => x.accountId === accountId);
    if (!p || !t) throw new Error("unknown post/target");
    Object.assign(t, patch);
    p.status = p.platforms.every((x) => x.status === "published") ? "published" : p.platforms.every((x) => x.status === "failed") ? "failed" : p.platforms.some((x) => x.status === "pending") ? "publishing" : "partial";
  }
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}
