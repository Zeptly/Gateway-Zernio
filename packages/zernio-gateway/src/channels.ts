import type { ChannelDescriptor } from "@zeptly-gateway/gateway-core";
import { ZERNIO_SOCIAL_NETWORKS } from "@zeptly-gateway/social-publishing/zernio";

/**
 * Account channels the Zernio gateway can provision. For this gateway every
 * channel is a social network. Connection strategies are Zernio facts: hosted
 * OAuth for all networks except Bluesky, which connects with a handle + app password.
 */
const STRATEGIES: Record<string, Pick<ChannelDescriptor, "connectionStrategy" | "supportedStrategies">> = {
  bluesky: { connectionStrategy: "credentials", supportedStrategies: ["credentials"] },
};

export const ZERNIO_CHANNELS: ChannelDescriptor[] = Object.values(ZERNIO_SOCIAL_NETWORKS).map((d) => ({
  channel: d.network,
  displayName: d.displayName,
  ...(STRATEGIES[d.network] ?? { connectionStrategy: "oauth_redirect", supportedStrategies: ["oauth_redirect"] }),
  notes: [...d.notes],
}));
