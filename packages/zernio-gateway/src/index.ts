/**
 * @zeptly-gateway/zernio-gateway — the Zernio Gateway composition root:
 * configuration, Zernio channel catalog, provider-account port, webhook
 * source, capability composition and the Gateway Contract v1 implementation.
 */
export * from "./config.js";
export { ZERNIO_CHANNELS } from "./channels.js";
export { ZernioAccountPort } from "./accounts.js";
export { zernioWebhookSource } from "./webhooks.js";
export {
  buildZernioClient,
  createZernioGateway,
  ZERNIO_CAPABILITIES,
  ZERNIO_GATEWAY_VERSION,
  type ZernioCapabilityId,
  type ZernioGatewayContext,
  type ZernioGatewayOptions,
  type ZernioGatewayRuntime,
} from "./gateway.js";
