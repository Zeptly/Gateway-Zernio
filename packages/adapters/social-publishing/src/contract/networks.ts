import { z } from "zod";

/**
 * Canonical social channels representable in Social Publishing Contract v1.
 *
 * The contract is provider-NEUTRAL: whether a channel is representable here says nothing about
 * which provider can serve it. A gateway implementing the contract states which of these it
 * actually serves (its network catalog, `GET /v1/capabilities`, `GET /v1/connections/channels`) and
 * rejects the rest with NETWORK_NOT_SUPPORTED. Provider vocabulary (for example a provider calling X
 * "twitter") is mapped inside the gateway's client and never appears in this contract.
 *
 * `x` was added before the final v1 freeze (no immutable v1 tag existed) as a portability correction:
 * the earlier list had been shaped by one provider's Managed-Key/BYOK limits. Reddit, Google Business
 * Profile and Vimeo remain unrepresented until a requirement exists.
 */
export const SOCIAL_NETWORKS = [
  "linkedin",
  "instagram",
  "facebook",
  "threads",
  "tiktok",
  "pinterest",
  "youtube",
  "bluesky",
  "x",
] as const;

export const SocialNetworkSchema = z.enum(SOCIAL_NETWORKS);
export type SocialNetwork = z.infer<typeof SocialNetworkSchema>;

export function isSocialNetwork(value: unknown): value is SocialNetwork {
  return typeof value === "string" && (SOCIAL_NETWORKS as readonly string[]).includes(value);
}
