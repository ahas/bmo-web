// The card master's picture as the monitor screen's services tab reads it (docs/web.md, 「Monitor's services tab」),
// put in this shape by the console's server out of the master's `GET /cluster` (bmo-arbiter's `docs/api.md`, 「The
// cluster」); every moment is in seconds since the epoch and every wait in seconds. The console reads the master and
// never writes to it.

/** How the rules place a unit: always, while asked for, or in what is left. */
export type UnitKind = "resident" | "on-demand" | "fill";

export interface CardUnit {
  name: string;
  service: string;
  part: string;
  vramMiB: number;
  /** On the card, out in its owner's host memory, out in the dump store, or some of each. */
  state: "resident" | "ram" | "evicted" | "mixed";
  ramMiB: number;
  since: number | null;
  evictable: boolean;
  reason: string | null;
  loadMs: number | null;
  unloadMs: number | null;
  /** The kind the rules give it; none where no unit of the rules names it, and absent from a master that
   * does not say it. */
  kind?: UnitKind | null;
  /** What of its service the unit holds, as the service describes it to the master; none where nothing
   * describes it, and absent from a master that does not say it. */
  detail?: UnitDetail | null;
}

/** What a unit of a layered model holds on its card: its main blocks (first and last, counted from 0),
 * whether the output layer and the MTP head are among them, and for a store how many full attention
 * blocks it keeps the KV of. */
export interface UnitDetail {
  blocks: { from: number; to: number } | null;
  output: boolean;
  mtp: boolean;
  fullAttention: number | null;
}

/** A process using the card, its memory as the driver counts it, and the service the slave knows it
 * as, or none. */
export interface CardProcess {
  pid: number;
  name: string;
  service: string | null;
  usedMiB: number;
}

export interface CardTicket {
  ticket: string;
  service: string;
  turn: boolean;
  position: number | null;
  waitedS: number;
  waitS: number | null;
  unit: string | null;
  vramMiB: number | null;
}

export interface CardView {
  index: number;
  name: string | null;
  totalMiB: number | null;
  usedMiB: number | null;
  freeMiB: number | null;
  units: CardUnit[];
  turn: { service: string; ticket: string; waitedS: number; inUse: boolean | null } | null;
  queue: CardTicket[];
  claim: { by: string | null; since: number | null };
  ram: { dumpsMiB: number; availableMiB: number | null; maxMiB: number | null; floorMiB: number | null; dump: string | null };
  stage: { waiting: boolean; waitingS: number };
  store: { path: string; bytes: number; extents: number | null; slotsUsed: number; error: string | null } | null;
  /** Every process using the card; none where the slave cannot read them, and absent from a master that
   * does not say them. */
  processes?: CardProcess[] | null;
}

export interface CardNode {
  name: string;
  role: string | null;
  desktop: boolean;
  link: { state: "connected" | "lost" | "unknown"; since: number | null; readAt: number | null; lastReadMs: number | null; error: string | null };
  version: string | null;
  rules: { loadedAt: number | null; error: string | null } | null;
  occupants: string[];
  cards: CardView[];
}

export interface CardsState {
  master: { version: string; startedAt: number; rulesFile: string; rulesLoadedAt: number | null; rulesError: string | null; readEveryS: number };
  groups: { name: string; pool: boolean; nodes: string[]; totalMiB: number; freeMiB: number }[];
  nodes: CardNode[];
  /** The units the rules declare, by name or pattern; absent from a master that does not say them. */
  declared?: { unit: string; service: string; kind: UnitKind; vramMiB: number | null }[];
  events: { at: number; node: string | null; text: string }[];
  /** The occupants' tiers as the rules give them, lowest first, with the nodes each stands on. */
  tiers: { occupant: string; tier: number; nodes: string[] }[];
  /** Each service's placement as the rules give it: its tier and priority, the nodes it may go on, the card memory it
   * asks for, whether it spreads over many nodes and whether it holds a card alone. */
  services: { service: string; tier: number | null; priority: number | null; nodes: string[]; cardMiB: number | null; many: boolean; alone: boolean }[];
}
