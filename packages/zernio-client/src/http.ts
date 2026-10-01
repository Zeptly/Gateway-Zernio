import { randomUUID } from "node:crypto";
import { type Logger, redactString } from "@zeptly-gateway/observability";
import { z } from "zod";
import { ZERNIO, ZernioError } from "./errors.js";

/**
 * Zernio error bodies seen in the API reference:
 *   { "error": "message", "code"?: "idempotency_conflict", "details"?: {...} }
 * The shape is treated tolerantly; only bounded, redacted strings leave this file.
 */
const errorBodySchema = z
  .object({
    error: z.union([z.string(), z.object({ message: z.string().optional(), code: z.string().optional() }).loose()]).optional(),
    message: z.string().optional(),
    code: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .loose();

export interface ZernioHttpOptions {
  apiKey: string;
  /** e.g. https://zernio.com/api (paths passed to request() start with /v1). */
  baseUrl: string;
  timeoutMs?: number;
  maxAttempts?: number;
  retryBaseMs?: number;
  /** Upper bound on honoured Retry-After before giving the error back to the caller (job-level retry). */
  maxRetryAfterMs?: number;
  fetchImpl?: typeof fetch;
  logger?: Logger;
  requestId?: () => string | undefined;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "DELETE" | "PUT" | "PATCH";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  idempotencyKey?: string;
  timeoutMs?: number;
  /** Mutating request whose failure after send may have been applied remotely. */
  mutating?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Defensive Zernio transport:
 *  - Bearer auth, server-side only; the key is registered for value redaction by the composition root.
 *  - Per-request timeout, no redirects followed.
 *  - Retries only when safe: GET/DELETE, or a mutating call carrying an Idempotency-Key.
 *  - Honours 429 Retry-After (bounded), 5xx and network errors with backoff + jitter.
 *  - Errors become ZernioError with redacted, bounded messages.
 */
export class ZernioHttp {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly retryBaseMs: number;
  private readonly maxRetryAfterMs: number;
  readonly fetchImpl: typeof fetch;
  private readonly logger: Logger | undefined;
  private readonly requestId: () => string | undefined;

  constructor(opts: ZernioHttpOptions) {
    if (!opts.apiKey) throw new Error("ZERNIO_API_KEY is required");
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
    this.retryBaseMs = opts.retryBaseMs ?? 500;
    this.maxRetryAfterMs = opts.maxRetryAfterMs ?? 10_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.logger = opts.logger;
    this.requestId = opts.requestId ?? (() => undefined);
  }

  async request(path: string, opts: RequestOptions = {}): Promise<unknown> {
    const method = opts.method ?? "GET";
    const retrySafe = method === "GET" || method === "DELETE" || Boolean(opts.idempotencyKey);
    const attempts = retrySafe ? this.maxAttempts : 1;
    const requestId = this.requestId() ?? randomUUID();
    let lastErr: ZernioError | undefined;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await this.once(path, method, opts, requestId, attempt);
      } catch (err) {
        if (!(err instanceof ZernioError)) throw err;
        lastErr = err;
        if (!err.retryable || attempt >= attempts) throw err;
        const retryAfterMs = (err.retryAfterSeconds ?? 0) * 1000;
        if (retryAfterMs > this.maxRetryAfterMs) throw err;
        const backoff = this.retryBaseMs * 2 ** (attempt - 1) + Math.floor(Math.random() * this.retryBaseMs);
        await sleep(Math.max(backoff, retryAfterMs));
      }
    }
    throw lastErr ?? new ZernioError("network", "request failed", { retryable: true, ambiguous: Boolean(opts.mutating) });
  }

  private url(path: string, query: RequestOptions["query"]): string {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) qs.set(k, String(v));
    const q = qs.toString();
    return `${this.baseUrl}${path}${q ? `?${q}` : ""}`;
  }

  private async once(path: string, method: string, opts: RequestOptions, requestId: string, attempt: number): Promise<unknown> {
    const started = performance.now();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
      "x-request-id": requestId,
    };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
    let res: Response;
    try {
      res = await this.fetchImpl(this.url(path, opts.query), {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(opts.timeoutMs ?? this.timeoutMs),
        redirect: "error",
      });
    } catch (err) {
      const isTimeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      this.logger?.warn({ provider: ZERNIO, method, path, attempt, requestId, outcome: isTimeout ? "timeout" : "network_error" }, "zernio request failed");
      throw new ZernioError(isTimeout ? "timeout" : "network", `Zernio ${method} ${path} ${isTimeout ? "timed out" : "network error"}`, {
        retryable: true,
        ambiguous: Boolean(opts.mutating),
      });
    }
    const text = await res.text();
    let json: unknown;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
    }
    this.logger?.debug(
      { provider: ZERNIO, method, path, status: res.status, attempt, requestId, latencyMs: Math.round(performance.now() - started), rateLimitRemaining: res.headers.get("x-ratelimit-remaining") ?? undefined },
      "zernio request",
    );
    if (!res.ok) throw this.httpError(res, method, path, json, text, Boolean(opts.mutating));
    if (json === undefined && text) {
      throw new ZernioError("protocol", `Zernio ${method} ${path} returned non-JSON`, { status: res.status, retryable: false, ambiguous: Boolean(opts.mutating) });
    }
    return json ?? {};
  }

  private httpError(res: Response, method: string, path: string, json: unknown, text: string, mutating: boolean): ZernioError {
    const status = res.status;
    const parsed = errorBodySchema.safeParse(json);
    const body = parsed.success ? parsed.data : undefined;
    const code = typeof body?.code === "string" ? body.code : typeof body?.error === "object" ? body.error.code : undefined;
    const msg = redactString(errorText(body) ?? (text.slice(0, 200) || `HTTP ${status}`)).slice(0, 500);
    const base = `Zernio ${method} ${path} → ${status}: ${msg}`;
    const ra = Number(res.headers.get("retry-after"));
    const retryAfterSeconds = Number.isFinite(ra) && ra > 0 ? ra : undefined;
    const details: Record<string, unknown> = { providerStatus: status, providerMessage: msg, ...(code ? { providerCode: code } : {}) };
    if (status === 401 || status === 403) return new ZernioError("auth", base, { status, retryable: false, ambiguous: false, details });
    if (status === 404) return new ZernioError("not_found", base, { status, retryable: false, ambiguous: false, details });
    if (status === 409) {
      // Same Idempotency-Key still being processed → retry after the delay. Anything else
      // (content-hash duplicate, duplicate profile name) is a definitive conflict.
      if (code === "idempotency_conflict") return new ZernioError("conflict", base, { status, retryable: true, ambiguous: true, retryAfterSeconds, details });
      const extra = body?.details ?? {};
      for (const k of ["existingPostId", "existingProfileId"]) if (typeof extra[k] === "string") details[k] = extra[k];
      const top = json as Record<string, unknown> | undefined;
      if (typeof top?.existingPostId === "string") details.existingPostId = top.existingPostId;
      return new ZernioError("conflict", base, { status, retryable: false, ambiguous: false, details });
    }
    if (status === 429) return new ZernioError("rate_limit", base, { status, retryable: true, ambiguous: false, retryAfterSeconds, details });
    if (status >= 500) return new ZernioError("server", base, { status, retryable: true, ambiguous: mutating, retryAfterSeconds, details });
    return new ZernioError("validation", base, { status, retryable: false, ambiguous: false, details });
  }
}

function errorText(body: z.infer<typeof errorBodySchema> | undefined): string | undefined {
  if (!body) return undefined;
  const e = typeof body.error === "string" ? body.error : body.error?.message;
  return [e, body.message].filter((p): p is string => typeof p === "string" && p.length > 0).join(": ") || undefined;
}
