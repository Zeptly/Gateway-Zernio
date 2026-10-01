import { UpstreamError } from "@zeptly-gateway/gateway-contract";
import type { PendingProviderConnection, ProviderAccountPort, ProviderAccountRecord, ProviderCallbackResult } from "@zeptly-gateway/gateway-core";
import { ZERNIO, type ZernioAccount, type ZernioClient } from "@zeptly-gateway/zernio-client";

const ID = /^[A-Za-z0-9_-]{8,64}$/;
/** Sentinel tenant ref for accounts in profiles this gateway did not create: matches no workspace. */
const FOREIGN = "foreign:";

/**
 * Provider-account lifecycle on Zernio.
 *
 *  - workspace → Zernio profile: one profile per workspace, named `<prefix><opaque tenantRef>`.
 *    The Zeptly workspace id is never sent to Zernio.
 *  - Zernio's standard OAuth flow creates the account before redirecting back with
 *    `connected, profileId, accountId`. The redirect carries the result, so the "session token"
 *    is `<profileId>.<accountId>`. It is NEVER trusted: every account record carries the tenant
 *    ref derived from its profile's name, and gateway-core refuses to adopt an account whose
 *    tenant ref is not the requesting workspace's.
 */
export class ZernioAccountPort implements ProviderAccountPort {
  constructor(
    private readonly client: ZernioClient,
    private readonly profilePrefix: string = "zs-",
  ) {}

  private profileName(tenantRef: string): string {
    return `${this.profilePrefix}${tenantRef}`;
  }

  private tenantRefOf(profileName: string | undefined): string {
    return profileName?.startsWith(this.profilePrefix) ? profileName.slice(this.profilePrefix.length) : `${FOREIGN}${profileName ?? "unknown"}`;
  }

  parseCallback(query: Record<string, unknown>): ProviderCallbackResult {
    const one = (v: unknown) => (typeof v === "string" ? v : undefined);
    if (one(query.error) || one(query.error_description)) return { error: "provider reported an error" };
    const profileId = one(query.profileId);
    const accountId = one(query.accountId);
    if (profileId && accountId && ID.test(profileId) && ID.test(accountId)) return { session: `${profileId}.${accountId}` };
    return {};
  }

  async initiateConnection(input: { channel: string; redirectUri: string; tenantRef: string }): Promise<{ authorizationUrl: string }> {
    const profile = await this.client.ensureProfile(this.profileName(input.tenantRef));
    return this.client.getConnectUrl({ platform: input.channel, profileId: profile.id, redirectUrl: input.redirectUri });
  }

  async connectWithCredentials(input: { channel: string; tenantRef: string; credentials: { handle: string; appPassword: string } }): Promise<ProviderAccountRecord[]> {
    if (input.channel !== "bluesky") throw new UpstreamError(ZERNIO, "unsupported", "Credential connection is only available for Bluesky", { retryable: false, ambiguous: false });
    const profile = await this.client.ensureProfile(this.profileName(input.tenantRef));
    const account = await this.client.connectBlueskyWithCredentials({ profileId: profile.id, identifier: input.credentials.handle, appPassword: input.credentials.appPassword });
    return [toRecord(account, input.tenantRef)];
  }

  async getPendingConnection(session: string): Promise<PendingProviderConnection> {
    const account = await this.resolveSession(session);
    return {
      channel: account.platform,
      options: [
        {
          id: account.externalId,
          name: account.displayName ?? account.username ?? account.externalId,
          ...(account.username ? { username: account.username } : {}),
          ...(account.avatarUrl ? { avatarUrl: account.avatarUrl } : {}),
        },
      ],
    };
  }

  async finalizeConnection(session: string, optionIds: string[]): Promise<ProviderAccountRecord[]> {
    const account = await this.resolveSession(session);
    if (optionIds.length > 0 && !optionIds.includes(account.externalId)) return [];
    const profiles = await this.client.listProfiles();
    return [toRecord(account, this.tenantRefOf(profiles.find((p) => p.id === account.profileId)?.name))];
  }

  async listAccounts(filter: { tenantRef?: string } = {}): Promise<ProviderAccountRecord[]> {
    if (filter.tenantRef) {
      const profile = await this.client.findProfileByName(this.profileName(filter.tenantRef));
      if (!profile) return [];
      return (await this.client.listAccounts({ profileId: profile.id })).map((a) => toRecord(a, filter.tenantRef as string));
    }
    const [profiles, accounts] = await Promise.all([this.client.listProfiles(), this.client.listAccounts()]);
    const names = new Map(profiles.map((p) => [p.id, p.name]));
    return accounts.map((a) => toRecord(a, this.tenantRefOf(names.get(a.profileId))));
  }

  disconnectAccount(externalId: string): Promise<void> {
    return this.client.disconnectAccount(externalId);
  }

  private async resolveSession(session: string): Promise<ZernioAccount> {
    const [profileId, accountId] = session.split(".");
    if (!profileId || !accountId || !ID.test(profileId) || !ID.test(accountId)) {
      throw new UpstreamError(ZERNIO, "validation", "Malformed provider session", { retryable: false, ambiguous: false });
    }
    const account = (await this.client.listAccounts({ profileId })).find((a) => a.externalId === accountId);
    if (!account) throw new UpstreamError(ZERNIO, "not_found", "Account not found in the profile", { retryable: false, ambiguous: false });
    return account;
  }
}

function toRecord(a: ZernioAccount, tenantRef: string): ProviderAccountRecord {
  return {
    externalId: a.externalId,
    channel: a.platform,
    ...(a.username ? { username: a.username } : {}),
    ...(a.displayName ? { displayName: a.displayName } : {}),
    ...(a.avatarUrl ? { avatarUrl: a.avatarUrl } : {}),
    isActive: a.isActive,
    tenantRef,
  };
}
