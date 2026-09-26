// `window.seed.images.*` (rev 6 phase 4, D4): the image providers this build has, each with its
// licence; the device's choice (main's `<userData>/images.json`); a test of a provider's server; and
// the licence audit of a published revision. The renderer names only a provider id or a revision —
// never a URL or a key (Rule 6) — and every payload is zod-checked in main (src/main/images/ipc.ts).

import type {
  ImageProbe,
  ImageProviderId,
  ImageSettings,
  LicenceAudit,
  LicenceAuditTarget,
} from "./images";
import type { Result } from "./result";

export const IMAGES_IPC = {
  settings: "images:settings",
  choose: "images:choose",
  probe: "images:probe",
  audit: "images:audit",
} as const;

export interface ImagesApi {
  /** Every provider with its licence line, the current choice and whether commercial mode is on. */
  settings(): Promise<Result<ImageSettings>>;
  /** Stores the device's choice; refused for a non-commercial provider in commercial mode. */
  choose(id: ImageProviderId): Promise<Result<ImageSettings>>;
  /** Asks the provider's server whether it answers and serves its model; draws nothing. */
  probe(id: ImageProviderId): Promise<Result<ImageProbe>>;
  /** Every picture of a published revision with its licence (inherited ones included). */
  audit(target: LicenceAuditTarget): Promise<Result<LicenceAudit>>;
}
