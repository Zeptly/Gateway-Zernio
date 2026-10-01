/**
 * PRIVATE Zernio wire schemas. Nothing in this file is exported from the
 * package entry point: callers only ever see the typed results in ./types.ts.
 * Parsing is tolerant (unknown keys ignored) but each mapped field is strict.
 */
import { z } from "zod";
import type { ZernioAccount, ZernioAccountHealth, ZernioPostState, ZernioProfile, ZernioTargetState } from "./types.js";
import { ZernioError } from "./errors.js";

const str = z.string().trim().min(1);
const optStr = z
  .string()
  .nullish()
  .transform((v) => (v ? v : undefined));
/** An id that Zernio sometimes returns populated as an object. */
const refId = z.union([str, z.object({ _id: str }).loose().transform((o) => o._id), z.object({ id: str }).loose().transform((o) => o.id)]);

const profileWire = z.object({ _id: str, name: str }).loose();
export const profileResponse = z.object({ profile: profileWire }).loose();
export const profileListResponse = z.object({ profiles: z.array(profileWire) }).loose();

const accountWire = z
  .object({
    _id: str,
    platform: str,
    profileId: refId,
    username: optStr,
    displayName: optStr,
    profilePicture: optStr,
    isActive: z.boolean().default(true),
    needsReconnection: z.boolean().optional(),
    enabled: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).nullish(),
  })
  .loose();
export const accountListResponse = z.object({ accounts: z.array(accountWire) }).loose();

/**
 * `GET /v1/accounts/health` (documented shape: `{ summary, accounts: [{ accountId, platform, username, status, canPost,
 * canFetchAnalytics, tokenValid, needsReconnect, issues }] }`; per-account endpoint adds `tokenStatus: { valid, expiresAt, needsRefresh }`).
 *
 * Only EXPLICIT token signals mean "reconnect": `needsReconnect: true`, `tokenValid: false`, `tokenStatus.valid: false`.
 * `status` (healthy|warning|error), `canPost` and `issues` are recorded as evidence but never infer a dead token: an `error`
 * status can be a missing permission or an account-level warning. An unrecognised shape yields NO findings: it means "no explicit reauthorisation signal observed" (fail open), not a positive claim that the account is healthy.
 */
const healthEntry = z
  .object({
    accountId: refId.optional(),
    _id: refId.optional(),
    id: refId.optional(),
    status: optStr,
    needsReconnect: z.boolean().optional(),
    tokenValid: z.boolean().optional(),
    canPost: z.boolean().optional(),
    tokenStatus: z.object({ valid: z.boolean().optional() }).loose().optional(),
    issues: z.array(z.unknown()).optional(),
  })
  .loose();
export const accountsHealthResponse = z.object({ accounts: z.array(healthEntry).default([]) }).loose();

export function mapAccountHealth(w: z.infer<typeof healthEntry>): ZernioAccountHealth | undefined {
  const externalId = w.accountId ?? w._id ?? w.id;
  if (!externalId) return undefined;
  const reasons: string[] = [];
  if (w.needsReconnect === true) reasons.push("needsReconnect=true");
  if (w.tokenValid === false) reasons.push("tokenValid=false");
  if (w.tokenStatus?.valid === false) reasons.push("tokenStatus.valid=false");
  const issues = (w.issues ?? []).filter((i): i is string => typeof i === "string").map((i) => i.slice(0, 120)).slice(0, 5);
  const evidence = [`health.status=${w.status ?? "unknown"}`, ...(w.canPost !== undefined ? [`canPost=${w.canPost}`] : []), ...reasons, ...(issues.length ? [`issues=${issues.join("; ")}`] : [])].join(", ");
  return { externalId, needsReconnection: reasons.length > 0, evidence };
}

export const currentUserResponse = z.object({ currentUserId: str }).loose();
export const connectedAccountResponse = z.object({ account: accountWire }).loose();

export const connectUrlResponse = z.object({ authUrl: z.url() }).loose();

const targetWire = z
  .object({
    platform: str,
    accountId: refId,
    status: optStr,
    platformPostId: optStr,
    platformPostUrl: optStr,
    publishedAt: optStr,
    errorMessage: optStr,
    errorCategory: optStr,
  })
  .loose();
const postWire = z
  .object({
    _id: str,
    status: optStr,
    scheduledFor: optStr,
    publishedAt: optStr,
    platforms: z.array(targetWire).default([]),
  })
  .loose();
export const postResponse = z.object({ post: postWire }).loose();

export function mapProfile(w: z.infer<typeof profileWire>): ZernioProfile {
  return { id: w._id, name: w.name };
}

function postLimit(meta: Record<string, unknown> | null | undefined): number | undefined {
  const n = Number(meta?.maxPostChars ?? meta?.max_post_chars ?? meta?.characterLimit);
  if (Number.isFinite(n) && n >= 1) return Math.min(Math.floor(n), 25_000);
  const tier = String(meta?.tier ?? meta?.subscriptionType ?? "").toLowerCase();
  if (tier.includes("premium") || tier === "verified") return 25_000;
  return undefined;
}

export function mapAccount(w: z.infer<typeof accountWire>): ZernioAccount {
  const maxPostChars = postLimit(w.metadata);
  return {
    externalId: w._id,
    platform: w.platform,
    profileId: w.profileId,
    ...(w.username ? { username: w.username } : {}),
    ...(w.displayName ? { displayName: w.displayName } : {}),
    ...(w.profilePicture ? { avatarUrl: w.profilePicture } : {}),
    // "enabled: false" = created as a side effect, not usable for posting.
    isActive: w.isActive && w.needsReconnection !== true && w.enabled !== false,
    needsReconnection: w.needsReconnection === true,
    ...(maxPostChars ? { maxPostChars } : {}),
  };
}

export type ZernioTargetStatus = ZernioTargetState["status"];

export function mapTargetStatus(s: string | undefined): ZernioTargetStatus {
  switch (s) {
    case "published":
      return "published";
    case "failed":
      return "failed";
    case "cancelled":
      return "deleted";
    case "pending":
    case "processing":
    case "uploading":
    case "scheduled":
    case "publishing":
      return "pending";
    default:
      return "unknown";
  }
}

const date = (v: string | undefined): Date | undefined => {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};
export { date as parseDate };

export function mapPost(w: z.infer<typeof postWire>): ZernioPostState {
  const scheduledAt = date(w.scheduledFor);
  const publishedAt = date(w.publishedAt);
  return {
    externalId: w._id,
    ...(w.status ? { status: w.status } : {}),
    ...(scheduledAt ? { scheduledAt } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    targets: w.platforms.map((t) => {
      const at = date(t.publishedAt);
      return {
        accountExternalId: t.accountId,
        platform: t.platform,
        status: mapTargetStatus(t.status),
        ...(t.platformPostId ? { platformPostId: t.platformPostId } : {}),
        ...(t.platformPostUrl ? { platformPostUrl: t.platformPostUrl } : {}),
        ...(t.errorMessage ? { error: t.errorMessage } : {}),
        ...(t.errorCategory ? { errorCategory: t.errorCategory } : {}),
        ...(at ? { publishedAt: at } : {}),
      };
    }),
  };
}

export function parseOrProtocolError<T>(schema: z.ZodType<T>, json: unknown, what: string): T {
  const r = schema.safeParse(json);
  if (r.success) return r.data;
  throw new ZernioError("protocol", `Unexpected Zernio response for ${what}`, { retryable: false, ambiguous: false, details: { issues: r.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`) } });
}
