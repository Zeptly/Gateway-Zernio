/** Public, typed, sanitized Zernio results. The only Zernio shapes that leave this package. */

export interface ZernioProfile {
  id: string;
  name: string;
}

export interface ZernioAccount {
  externalId: string;
  /** Zernio platform slug (for this gateway: the channel). */
  platform: string;
  /** Zernio profile the account belongs to (the gateway maps one profile per workspace). */
  profileId: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  isActive: boolean;
  needsReconnection: boolean;
  /**
   * Account-level posting ceiling in characters, when Zernio reports one (X Premium accounts).
   * Parsed tolerantly from account metadata; field names are UNVERIFIED against live data.
   */
  maxPostChars?: number;
}

export interface ZernioTargetState {
  accountExternalId: string;
  platform: string;
  status: "pending" | "published" | "failed" | "deleted" | "unknown";
  platformPostId?: string;
  platformPostUrl?: string;
  error?: string;
  errorCategory?: string;
  publishedAt?: Date;
}

export interface ZernioPostState {
  externalId: string;
  /** Zernio's post-level status string, diagnostic only. */
  status?: string;
  scheduledAt?: Date;
  publishedAt?: Date;
  targets: ZernioTargetState[];
}

export interface ZernioMediaItem {
  type: "image" | "video" | "gif" | "document";
  url: string;
  filename?: string;
  mimeType?: string;
  size?: number;
}

export interface ZernioCreatePostInput {
  /** Sent as the Idempotency-Key header (24h window, scoped to the Zernio user). */
  idempotencyKey: string;
  profileId?: string;
  text: string;
  media: ZernioMediaItem[];
  targets: Array<{ platform: string; accountExternalId: string; platformOptions?: Record<string, unknown> }>;
  /** Omit and set publishNow for immediate publication. */
  scheduledAt?: Date;
  publishNow?: boolean;
  /** Opaque correlation echoed in webhooks. Never contains a Zeptly identifier. */
  metadata?: Record<string, string>;
}

export type ZernioWebhookEvent =
  | { kind: "post_outcome"; providerPostId: string; accounts: Array<{ accountExternalId: string; outcome: "published" | "failed"; platformPostId?: string; platformPostUrl?: string; error?: string }>; occurredAt: Date }
  | { kind: "account_disconnected"; accountExternalId: string; unintentional: boolean; reason?: string; occurredAt: Date }
  | { kind: "test"; occurredAt: Date }
  | { kind: "ignored"; occurredAt: Date };

export interface ParsedZernioWebhook {
  /** Zernio's stable event id (dedupe key). */
  eventId: string;
  type: string;
  event: ZernioWebhookEvent;
}

/** Token health of one account, from `GET /v1/accounts/health`. */
export interface ZernioAccountHealth {
  externalId: string;
  needsReconnection: boolean;
}
