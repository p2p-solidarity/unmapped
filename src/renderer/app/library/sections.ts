// The Worlds library's sections, in nav order: 我的世界 · 加入世界 · 市場 (+ 封存 only when legacy
// worlds exist). To add one: write a panel that takes SectionProps, add its label to
// i18n/strings/library.ts, and add one entry here. A panel owns its keys: it registers exactly one
// Escape handler (useKeys) that first closes its own sub-form (a remix form, a picker) and
// otherwise calls `onClose`, which leaves for the title. It marks the control it wants focused
// first with AUTOFOCUS (./focus), else its first control is.

import type { StringKey } from "@renderer/i18n";
import type { Loadable } from "@shared/result";
import type { JSX } from "react";
import { MarketPanel } from "../market/MarketPanel";
import { ArchivePanel } from "../title/ArchivePanel";
import type { LibraryData } from "../title/useLibrary";
import { JoinWorld } from "./JoinWorld";
import { MyWorldsPanel } from "./MyWorldsPanel";

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
  {
    id: "mine",
    label: "library.sectionMine",
    Panel: MyWorldsPanel,
    count: (library) => library.instances.length,
  },
  { id: "join", label: "world.sectionJoin", Panel: JoinWorld },
  { id: "market", label: "library.sectionMarket", Panel: MarketPanel },
  {
    id: "archive",
    label: "library.sectionArchive",
    Panel: ArchivePanel,
    count: (library) => library.legacy.length,
    when: (library) => library.legacy.length > 0,
  },
];
