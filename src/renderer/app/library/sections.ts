// The Worlds library's sections, in nav order. To add one (e.g. a Market): write a panel that takes
// SectionProps, add its label to i18n/strings/library.ts, and add one entry here. A panel owns its
// keys: it registers exactly one Escape handler (useKeys) that first closes its own sub-form (a
// remix form, a delete confirmation) and otherwise calls `onClose`, which leaves for the title.
// It marks the control it wants focused first with AUTOFOCUS (./focus), else its first control is.

import type { StringKey } from "@renderer/i18n";
import type { Loadable } from "@shared/result";
import type { JSX } from "react";
import { ArchivePanel } from "../title/ArchivePanel";
import { CartridgesPanel } from "../title/CartridgesPanel";
import { ContinentPanel } from "../title/ContinentPanel";
import type { LibraryData } from "../title/useLibrary";
import { NewGamePanel } from "./NewGamePanel";
import { SavesPanel } from "./SavesPanel";

export interface SectionProps {
  /** Everything on disk (cartridges, saves, drafts, legacy worlds) as one Loadable. */
  data: Loadable<LibraryData>;
  refresh(): Promise<void>;
  /** Back to the title. */
  onClose(): void;
}

export interface Section {
  id: string;
  label: StringKey;
  Panel: (props: SectionProps) => JSX.Element;
  /** A count shown beside the label once the library has loaded. */
  count?: (library: LibraryData) => number;
  /** Shown only when this holds for the loaded library (absent = always shown). */
  when?: (library: LibraryData) => boolean;
}

export const SECTIONS: readonly Section[] = [
  { id: "new", label: "library.sectionNew", Panel: NewGamePanel },
  {
    id: "saves",
    label: "library.sectionSaves",
    Panel: SavesPanel,
    count: (library) => library.instances.length,
  },
  {
    id: "cartridges",
    label: "library.sectionCartridges",
    Panel: CartridgesPanel,
    count: (library) => library.cartridges.length + library.workspaces.length,
  },
  { id: "continent", label: "library.sectionContinent", Panel: ContinentPanel },
  {
    id: "archive",
    label: "library.sectionArchive",
    Panel: ArchivePanel,
    count: (library) => library.legacy.length,
    when: (library) => library.legacy.length > 0,
  },
];
