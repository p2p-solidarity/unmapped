// Commercial mode (rev 6 phase 4, D4): one switch for every player of a build or gateway. On when
// the build sets UNMAPPED_COMMERCIAL=1 (main env; release builds from the day subscriptions go
// live), or when the configured gateway's `/v1/status` says `commercial: true`. Then no provider
// whose licence is not commercial may be chosen or draw, and no revision may add or change a
// picture whose licence is not commercial (./registry.ts, ./cartridgeLicences.ts, ./workLicences.ts).
//
// The gateway half is a seam: main has no gateway client yet. The route package's client calls
// `setGatewayCommercialSource` with a reader of `/v1/status` (`GatewayStatus` in @shared/quota);
// until then only the build switch counts. A gateway that cannot be reached says nothing, so the
// mode then follows the build switch alone — which is why release builds set it.

import type { CommercialMode } from "@shared/images";

export type EnvLike = Record<string, string | undefined>;

/** Reads the configured gateway's `/v1/status`: its `commercial`, or null when not known. */
export type GatewayCommercialSource = () => Promise<boolean | null>;

let gatewaySource: GatewayCommercialSource | null = null;

/** The seam for the route package's gateway client; null removes it. */
export function setGatewayCommercialSource(source: GatewayCommercialSource | null): void {
  gatewaySource = source;
}

export function buildCommercial(env: EnvLike = process.env): boolean {
  return env.UNMAPPED_COMMERCIAL === "1";
}

export async function commercialMode(env: EnvLike = process.env): Promise<CommercialMode> {
  if (buildCommercial(env)) return { on: true, source: "build" };
  if (gatewaySource !== null) {
    const said = await gatewaySource().catch(() => null);
    if (said === true) return { on: true, source: "gateway" };
  }
  return { on: false, source: null };
}
