import { UpstreamError, type UpstreamErrorKind, type UpstreamErrorOptions } from "@zeptly-gateway/gateway-contract";

export const ZERNIO = "zernio";

/** Any failed Zernio call. Messages and details are redacted and bounded. */
export class ZernioError extends UpstreamError {
  constructor(kind: UpstreamErrorKind, message: string, opts: UpstreamErrorOptions) {
    super(ZERNIO, kind, message, opts);
    this.name = "ZernioError";
  }
}
