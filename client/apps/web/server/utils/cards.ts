import { unitAt, unitFetch, unitHeaders } from "./units";

import type { CardNode, CardProcess, CardsState, CardTicket, CardUnit, CardView, UnitDetail, UnitKind } from "#shared/cards";

// The card master's picture as the monitor screen's services tab reads it (docs/web.md, 「Monitor's services tab」),
// from the master at the address `ARBITER_ADDRESS` names (bmo-arbiter's `docs/api.md`, 「What the master serves」):
// its `GET /cluster`, put in the shape the board draws, every moment in seconds and every wait in seconds, and its
// event stream, whose every picture is handed on the same way. The console reads the master and writes nothing.

const UNIT = "ARBITER";

// The master answers from what it holds; one that takes longer is not there.
const READ_TIMEOUT_MS = 3_000;

type Maybe<T> = T | null | undefined;

interface ClusterUnit {
  name: string;
  serviceName: string;
  part: string;
  vramMiB: number;
  state: CardUnit["state"];
  ramMiB: number;
  sinceAt?: Maybe<number>;
  evictable: boolean;
  reason?: Maybe<string>;
  loadMs?: Maybe<number>;
  unloadMs?: Maybe<number>;
  kind?: Maybe<UnitKind>;
  detail?: Maybe<{ blocks?: Maybe<{ from: number; to: number }>; output: boolean; mtp: boolean; fullAttention?: Maybe<number> }>;
}

interface ClusterTicket {
  ticketId: string;
  serviceName: string;
  position?: Maybe<number>;
  waitedMs: number;
  waitMs?: Maybe<number>;
  unitName?: Maybe<string>;
  vramMiB?: Maybe<number>;
}

interface ClusterCard {
  index: number;
  name?: Maybe<string>;
  totalMiB?: Maybe<number>;
  usedMiB?: Maybe<number>;
  freeMiB?: Maybe<number>;
  units: ClusterUnit[];
  turn?: Maybe<{ serviceName: string; ticketId: string; waitedMs: number; inUse?: Maybe<boolean> }>;
  queue: ClusterTicket[];
  claim?: Maybe<{ claimantName?: Maybe<string>; claimedAt?: Maybe<number> }>;
  ram: { dumpsMiB: number; availableMiB?: Maybe<number>; maxMiB?: Maybe<number>; floorMiB?: Maybe<number>; dump?: Maybe<string> };
  stage: { waiting: boolean; waitingMs: number };
  store?: Maybe<{ path: string; bytes: number; extents?: Maybe<number>; slotsUsed: number; error?: Maybe<string> }>;
  processes?: Maybe<{ pid: number; name: string; serviceName?: Maybe<string>; usedMiB: number }[]>;
}

interface ClusterNode {
  name: string;
  role?: Maybe<string>;
  desktop: boolean;
  link: { state: CardNode["link"]["state"]; sinceAt?: Maybe<number>; readAt?: Maybe<number>; lastReadMs?: Maybe<number>; error?: Maybe<string> };
  version?: Maybe<string>;
  rules?: Maybe<{ loadedAt?: Maybe<number>; error?: Maybe<string> }>;
  occupants: string[];
  cards: ClusterCard[];
}

/** The master's picture as `GET /cluster` and its `cluster.changed` events hand it. */
export interface Cluster {
  master: { version: string; startedAt: number; rulesFile: string; rulesLoadedAt?: Maybe<number>; rulesError?: Maybe<string>; readEveryMs: number };
  groups: { name: string; pool: boolean; nodeNames: string[]; totalMiB: number; freeMiB: number }[];
  nodes: ClusterNode[];
  declared?: Maybe<{ unit: string; serviceName: string; kind: UnitKind; vramMiB?: Maybe<number> }[]>;
  events: { at: number; nodeName?: Maybe<string>; code: string; text: string }[];
  tiers?: Maybe<{ name: string; tier: number }[]>;
  services?: Maybe<{ serviceName: string; tier?: Maybe<number>; priority?: Maybe<number>; nodeNames?: Maybe<string[]>; cardMiB?: Maybe<number>; spread?: Maybe<string>; alone?: Maybe<boolean> }[]>;
}

function seconds(ms: Maybe<number>): number | null {
  return ms === null || ms === undefined ? null : Math.floor(ms / 1000);
}

function detailOf(detail: ClusterUnit["detail"]): UnitDetail | null {
  return detail === null || detail === undefined
    ? null
    : { blocks: detail.blocks ?? null, output: detail.output, mtp: detail.mtp, fullAttention: detail.fullAttention ?? null };
}

function unitOf(unit: ClusterUnit): CardUnit {
  return {
    name: unit.name,
    service: unit.serviceName,
    part: unit.part,
    vramMiB: unit.vramMiB,
    state: unit.state,
    ramMiB: unit.ramMiB,
    since: seconds(unit.sinceAt),
    evictable: unit.evictable,
    reason: unit.reason ?? null,
    loadMs: unit.loadMs ?? null,
    unloadMs: unit.unloadMs ?? null,
    kind: unit.kind ?? null,
    detail: detailOf(unit.detail)
  };
}

function ticketOf(ticket: ClusterTicket): CardTicket {
  return {
    ticket: ticket.ticketId,
    service: ticket.serviceName,
    turn: false,
    position: ticket.position ?? null,
    waitedS: ticket.waitedMs / 1000,
    waitS: ticket.waitMs === null || ticket.waitMs === undefined ? null : ticket.waitMs / 1000,
    unit: ticket.unitName ?? null,
    vramMiB: ticket.vramMiB ?? null
  };
}

function processOf(process: NonNullable<ClusterCard["processes"]>[number]): CardProcess {
  return { pid: process.pid, name: process.name, service: process.serviceName ?? null, usedMiB: process.usedMiB };
}

function cardOf(card: ClusterCard): CardView {
  return {
    index: card.index,
    name: card.name ?? null,
    totalMiB: card.totalMiB ?? null,
    usedMiB: card.usedMiB ?? null,
    freeMiB: card.freeMiB ?? null,
    units: card.units.map(unitOf),
    turn: card.turn === null || card.turn === undefined
      ? null
      : { service: card.turn.serviceName, ticket: card.turn.ticketId, waitedS: card.turn.waitedMs / 1000, inUse: card.turn.inUse ?? null },
    queue: card.queue.map(ticketOf),
    claim: { by: card.claim?.claimantName ?? null, since: seconds(card.claim?.claimedAt) },
    ram: {
      dumpsMiB: card.ram.dumpsMiB,
      availableMiB: card.ram.availableMiB ?? null,
      maxMiB: card.ram.maxMiB ?? null,
      floorMiB: card.ram.floorMiB ?? null,
      dump: card.ram.dump ?? null
    },
    stage: { waiting: card.stage.waiting, waitingS: card.stage.waitingMs / 1000 },
    store: card.store === null || card.store === undefined
      ? null
      : { path: card.store.path, bytes: card.store.bytes, extents: card.store.extents ?? null, slotsUsed: card.store.slotsUsed, error: card.store.error ?? null },
    processes: card.processes === null || card.processes === undefined ? null : card.processes.map(processOf)
  };
}

function nodeOf(node: ClusterNode): CardNode {
  return {
    name: node.name,
    role: node.role ?? null,
    desktop: node.desktop,
    link: {
      state: node.link.state,
      since: seconds(node.link.sinceAt),
      readAt: seconds(node.link.readAt),
      lastReadMs: node.link.lastReadMs ?? null,
      error: node.link.error ?? null
    },
    version: node.version ?? null,
    rules: node.rules === null || node.rules === undefined ? null : { loadedAt: seconds(node.rules.loadedAt), error: node.rules.error ?? null },
    occupants: node.occupants,
    cards: node.cards.map(cardOf)
  };
}

/** The master's picture in the shape the board draws. */
export function cardsStateOf(cluster: Cluster): CardsState {
  return {
    master: {
      version: cluster.master.version,
      startedAt: Math.floor(cluster.master.startedAt / 1000),
      rulesFile: cluster.master.rulesFile,
      rulesLoadedAt: seconds(cluster.master.rulesLoadedAt),
      rulesError: cluster.master.rulesError ?? null,
      readEveryS: cluster.master.readEveryMs / 1000
    },
    groups: cluster.groups.map((group) => ({ name: group.name, pool: group.pool, nodes: group.nodeNames, totalMiB: group.totalMiB, freeMiB: group.freeMiB })),
    nodes: cluster.nodes.map(nodeOf),
    declared: (cluster.declared ?? []).map((one) => ({ unit: one.unit, service: one.serviceName, kind: one.kind, vramMiB: one.vramMiB ?? null })),
    events: cluster.events.map((event) => ({ at: Math.floor(event.at / 1000), node: event.nodeName ?? null, text: event.text })),
    tiers: (cluster.tiers ?? []).map((one) => ({ occupant: one.name, tier: one.tier, nodes: cluster.nodes.filter((node) => node.occupants.includes(one.name)).map((node) => node.name) })),
    services: (cluster.services ?? []).map((one) => ({
      service: one.serviceName,
      tier: one.tier ?? null,
      priority: one.priority ?? null,
      nodes: one.nodeNames ?? [],
      cardMiB: one.cardMiB ?? null,
      many: one.spread === "many",
      alone: one.alone === true
    }))
  };
}

/** The master's picture now. */
export async function readCards(): Promise<CardsState> {
  return cardsStateOf(await unitFetch<Cluster>(UNIT, "/cluster", undefined, READ_TIMEOUT_MS));
}

/** The master's event stream of its pictures, opened with its token; null where no address is set. */
export async function cardsStream(signal: AbortSignal): Promise<Response | null> {
  const unit = unitAt(UNIT);

  if (unit === null) return null;

  return await fetch(`${unit.address}/events?kinds=cluster.changed`, { headers: { ...unitHeaders(unit), accept: "text/event-stream" }, signal });
}
