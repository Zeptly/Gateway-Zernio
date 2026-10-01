import type { ConnectionStrategy, ProvisioningOption } from "@zeptly-gateway/gateway-contract";

/**
 * Provider-account port: the narrow set of provider operations the gateway's
 * provisioning and connection-health infrastructure needs. Implemented once per
 * gateway on top of its provider client (e.g. the Zernio client). This is
 * NOT a universal provider abstraction — it only covers account lifecycle.
 */
export interface ProviderAccountRecord {
  /** Provider account id — stored only in provider_accounts; never an ownership proof. */
  externalId: string;
  channel: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  accountType?: "personal" | "organization";
  isActive: boolean;
  /** Opaque tenant correlation value the provider recorded, when available. */
  tenantRef?: string;
}

export interface PendingProviderConnection {
  channel: string;
  expiresAt?: Date;
  options: ProvisioningOption[];
}

/** Provider redirect query → the gateway's session token (or an error). Providers whose redirect carries the result directly implement this. */
export interface ProviderCallbackResult {
  session?: string;
  error?: string;
}

export interface ProviderAccountPort {
  /**
   * Interpret the provider's browser redirect. Optional: when absent the gateway
   * reads the conventional `session` / `error` query parameters. The result is
   * never trusted for ownership: accounts returned by finalizeConnection must
   * carry the workspace's tenant ref, which the gateway verifies.
   */
  parseCallback?(query: Record<string, unknown>): ProviderCallbackResult;
  /**
   * `reconnectAccountExternalId` is set when re-authorising an EXISTING connection: a provider that supports it
   * refreshes that same account (stable ids) instead of creating a new one.
   */
  initiateConnection(input: { channel: string; redirectUri: string; tenantRef: string; reconnectAccountExternalId?: string }): Promise<{ authorizationUrl: string }>;
  /** Only for channels whose catalog entry supports the `credentials` strategy. */
  connectWithCredentials?(input: { channel: string; tenantRef: string; credentials: { handle: string; appPassword: string } }): Promise<ProviderAccountRecord[]>;
  getPendingConnection(sessionToken: string): Promise<PendingProviderConnection>;
  finalizeConnection(sessionToken: string, optionIds: string[]): Promise<ProviderAccountRecord[]>;
  listAccounts(filter?: { tenantRef?: string }): Promise<ProviderAccountRecord[]>;
  disconnectAccount(externalId: string): Promise<void>;
}

/** A channel = a kind of provider account this gateway can provision (for social gateways: a network). */
export interface ChannelDescriptor {
  channel: string;
  displayName: string;
  /** Default strategy used when a connection request carries no credentials. */
  connectionStrategy: ConnectionStrategy;
  supportedStrategies: ConnectionStrategy[];
  notes: string[];
}

export interface ChannelCatalog {
  channels(): ChannelDescriptor[];
  get(channel: string): ChannelDescriptor | undefined;
}

export function staticChannelCatalog(descriptors: ChannelDescriptor[]): ChannelCatalog {
  const byId = new Map(descriptors.map((d) => [d.channel, d]));
  return { channels: () => [...descriptors], get: (c) => byId.get(c) };
}
