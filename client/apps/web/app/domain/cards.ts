import { countText } from "./numbers";
import { elapsedText } from "bmo-ui/app/domain/time";
import { appUrl } from "./urls";

import type { CardNode, CardProcess, CardsState, CardUnit, CardView, UnitDetail, UnitKind } from "#shared/cards";

// The card arbiter screen's reading of the card master (docs/web.md, 「Monitor's services tab」): the picture
// once, then each `state` event of the master's stream as it comes; the last picture read stays while the
// master is away and the stream is opened again.

type Translate = (key: string, values?: Record<string, unknown>) => string;

export function useCards(): { state: Ref<CardsState | null>; failed: Ref<string | null>; loading: Ref<boolean> } {
  const state = ref<CardsState | null>(null);
  const failed = ref<string | null>(null);
  const loading = ref(true);
  let source: EventSource | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;

  const open = () => {
    source?.close();
    source = new EventSource(appUrl("/api/cards/events"));
    source.addEventListener("state", (event) => {
      try {
        state.value = JSON.parse((event as MessageEvent<string>).data) as CardsState;
        failed.value = null;
        loading.value = false;
      } catch {
        // A frame cut short is followed by a whole one.
      }
    });
    source.onerror = () => {
      source?.close();
      source = null;
      void read();
      retry = setTimeout(open, 5_000);
    };
  };

  const read = async () => {
    try {
      state.value = await $fetch<CardsState>("/api/cards/state");
      failed.value = null;
    } catch (fault) {
      const said = (fault as { statusMessage?: string; message?: string });
      failed.value = said.statusMessage ?? said.message ?? String(fault);
    } finally {
      loading.value = false;
    }
  };

  onMounted(() => {
    void read();
    open();
  });
  onBeforeUnmount(() => {
    source?.close();
    if (retry !== null) clearTimeout(retry);
  });

  return { state, failed, loading };
}

/** A memory figure in MiB with its thousands mark, or the unread word where it was not read. */
export function mibText(t: Translate, value: number | null): string {
  return value === null ? t("hardware.label.unread") : `${countText(Math.round(value))} MiB`;
}

/** A wait or a hold in the largest unit that fits it, as the console reads every "since when". */
export function waitText(t: Translate, seconds: number): string {
  return elapsedText(t, seconds);
}

/** How long ago an epoch-seconds moment was, as a wait. */
export function sinceText(t: Translate, at: number | null, now: number): string {
  return at === null ? t("hardware.label.unread") : waitText(t, now - at);
}

/** A move's time in ms, or a dash where the unit has not moved since the slave started. */
export function msText(value: number | null): string {
  return value === null ? "—" : `${countText(Math.round(value))} ms`;
}

/** A service's colour: the class a bar paints with, and the theme variable a chart reads the same colour from. */
export interface ServiceTone {
  bar: string;
  color: string;
}

const SERVICE_TONES: ServiceTone[] = [
  { bar: "bg-emerald-500", color: "--color-emerald-500" },
  { bar: "bg-sky-500", color: "--color-sky-500" },
  { bar: "bg-amber-500", color: "--color-amber-500" },
  { bar: "bg-violet-500", color: "--color-violet-500" },
  { bar: "bg-rose-500", color: "--color-rose-500" },
  { bar: "bg-teal-500", color: "--color-teal-500" },
  { bar: "bg-orange-500", color: "--color-orange-500" },
  { bar: "bg-fuchsia-500", color: "--color-fuchsia-500" },
  { bar: "bg-lime-500", color: "--color-lime-500" },
  { bar: "bg-indigo-500", color: "--color-indigo-500" },
];

/** Which colour each service wears on the screen. */
export type Palette = (service: string) => ServiceTone;

/** The services given the colours in the order they stand, so no two of the first ten share one; a
 * service the order does not name wears one drawn from its name. */
export function palette(services: string[]): Palette {
  const given = new Map(services.map((service, at) => [service, SERVICE_TONES[at % SERVICE_TONES.length]!]));
  return (service) => {
    const known = given.get(service);
    if (known !== undefined) return known;
    let hash = 0;
    for (const char of service) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return SERVICE_TONES[hash % SERVICE_TONES.length]!;
  };
}

export interface BarPiece {
  key: string;
  label: string;
  share: number;
  tone: string;
}

/** The card's memory as one bar: each resident unit in its service's colour, then the free room. */
export function memoryBar(t: Translate, card: CardNode["cards"][number], tone: Palette): BarPiece[] {
  const total = card.totalMiB ?? 0;
  if (total <= 0) return [];
  const pieces: BarPiece[] = card.units
    .filter((unit) => unit.state === "resident" || unit.state === "mixed")
    .map((unit) => ({ key: unit.name, label: `${unit.name} ${mibText(t, unit.vramMiB)}`, share: unit.vramMiB / total, tone: tone(unit.service).bar }));
  const free = card.freeMiB ?? 0;
  pieces.push({ key: "free", label: `${t("cards.label.free")} ${mibText(t, free)}`, share: free / total, tone: "bg-elevated" });
  return pieces;
}

export function unitStateWord(t: Translate, unit: CardUnit): string {
  if (unit.state === "evicted") return t("cards.status.evicted");
  if (unit.state === "ram") return t("cards.status.in_ram");
  return unit.state === "mixed" ? t("cards.status.mixed") : "";
}

/** The host memory the node's dumps take, with what is available, their most and a claim's floor. */
export function ramText(t: Translate, ram: CardNode["cards"][number]["ram"]): string {
  const parts = [mibText(t, ram.dumpsMiB)];
  if (ram.maxMiB !== null) parts.push(t("cards.status.ram_max", { m: mibText(t, ram.maxMiB) }));
  if (ram.availableMiB !== null) parts.push(t("cards.status.ram_available", { m: mibText(t, ram.availableMiB) }));
  if (ram.floorMiB !== null && ram.floorMiB > 0) parts.push(t("cards.status.ram_floor", { m: mibText(t, ram.floorMiB) }));
  return parts.join(" · ");
}

/** A node's link to the master as its chip says it. */
export function linkWord(t: Translate, node: CardNode, now: number): string {
  if (node.link.state === "lost") return t("cards.status.lost_since", { t: sinceText(t, node.link.since, now) });
  return node.link.state === "connected" ? t("cards.status.connected") : t("cards.status.unknown");
}

/** The nodes of a group as the state has them, and those no group chooses after every group. */
export function sections(state: CardsState): { name: string; pool: boolean; totalMiB: number | null; freeMiB: number | null; nodes: CardNode[] }[] {
  const byName = new Map(state.nodes.map((node) => [node.name, node]));
  const placed = new Set<string>();
  const groups = state.groups.map((group) => {
    group.nodes.forEach((name) => placed.add(name));
    return { name: group.name, pool: group.pool, totalMiB: group.totalMiB, freeMiB: group.freeMiB, nodes: group.nodes.map((name) => byName.get(name)).filter((node): node is CardNode => node !== undefined) };
  });
  const rest = state.nodes.filter((node) => !placed.has(node.name));
  return rest.length === 0 ? groups : [...groups, { name: "", pool: false, totalMiB: null, freeMiB: null, nodes: rest }];
}

// The whole board at the top of the screen (docs/web.md, 「Monitor's services tab」): every card as one bar,
// every service with its units under it, and every waiting ticket. Every name in it is the state's.

/** Where a unit is now: where its slave says, held while a waiting ticket asks for it off the card, or
 * unplaced where only the rules name it. */
export type UnitWhere = CardUnit["state"] | "held" | "unplaced";

/** A node's card where it stands on the board, its number kept for a node with more than one. */
export interface CardPlace {
  node: string;
  index: number;
  many: boolean;
}

export interface BoardCard extends CardPlace {
  key: string;
  name: string | null;
  totalMiB: number | null;
  usedMiB: number | null;
  freeMiB: number | null;
  /** The units on the card, each by its name without the node. */
  pieces: { unit: string; service: string; part: string; pattern: number; vramMiB: number }[];
  /** The memory in use that no unit on the card accounts for, each share named as far as the slave can. */
  others: BoardOther[];
}

/** A share of a card's memory in use that is no unit: a service's processes' own (their CUDA context
 * past the units they hold), a process no service is known for, what the driver keeps that no process
 * accounts for, or, where the slave cannot read the processes, all of it in one. */
export interface BoardOther {
  key: string;
  what: "context" | "process" | "driver" | "unsplit";
  /** The processes' names, for a context or a process. */
  process: string | null;
  vramMiB: number;
}

export interface BoardUnit {
  key: string;
  part: string;
  pattern: number;
  vramMiB: number | null;
  kind: UnitKind | null;
  where: UnitWhere;
  detail: UnitDetail | null;
}

/** One card's share of a service — or, for the units no card holds, the service's units held or
 * unplaced — with its units and its processes' own memory there. */
export interface BoardChunk {
  key: string;
  place: CardPlace | null;
  /** The memory its units and its processes take on the card, or none where nothing is measured. */
  vramMiB: number | null;
  /** The kinds and the places its units are in, each once: one of each is said for the chunk as a whole. */
  kinds: (UnitKind | null)[];
  wheres: UnitWhere[];
  units: BoardUnit[];
  others: BoardOther[];
}

export interface BoardTicket extends CardPlace {
  ticket: string;
  service: string;
  unit: string | null;
  position: number | null;
  waitedS: number;
  waitS: number | null;
}

export interface BoardService {
  name: string;
  /** The nodes it holds a unit, a turn or a claim on. */
  nodes: string[];
  /** The memory its units and its processes take on the cards. */
  vramMiB: number;
  claims: string[];
  turns: number;
  waiting: number;
  chunks: BoardChunk[];
}

export interface Board {
  cards: BoardCard[];
  services: BoardService[];
  /** Each card's memory in use that no service accounts for, a chunk to a card that has any. */
  outside: BoardChunk[];
  waiting: BoardTicket[];
  /** The services' colours in the order they stand here, worn the same on the tiles below. */
  tone: Palette;
}

/** How many patterns tell a service's parts apart on a bar, the first being none. */
export const PART_PATTERNS = 3;

// A part's pattern laid over its service's colour: on the chart as a decal, beside a unit's name as the
// same marks drawn by CSS, light over the colour in every theme.
const PATTERN_INK = "rgba(255, 255, 255, 0.5)";

/** The chart's decal for a part's pattern, or none for the first. */
export function partDecal(pattern: number): Record<string, unknown> | null {
  if (pattern === 1) return { symbol: "rect", symbolSize: 1, dashArrayX: [1, 0], dashArrayY: [2, 4], rotation: -Math.PI / 4, color: PATTERN_INK };
  if (pattern === 2) return { symbol: "circle", symbolSize: 0.6, dashArrayX: [[4, 4], [0, 4, 4, 0]], dashArrayY: [4, 0], color: PATTERN_INK };
  return null;
}

/** The same pattern as the style of a swatch painted in its service's colour. */
export function partSwatch(pattern: number): Record<string, string> {
  if (pattern === 1) return { backgroundImage: `repeating-linear-gradient(45deg, ${PATTERN_INK} 0 2px, transparent 2px 6px)` };
  if (pattern === 2) return { backgroundImage: `radial-gradient(circle, ${PATTERN_INK} 1px, transparent 1.5px)`, backgroundSize: "4px 4px" };
  return {};
}

const bareName = (name: string): string => name.split("@")[0]!;
const partName = (name: string): string => bareName(name).split("/").slice(1).join("/") || bareName(name);

/** The whole board out of the master's picture, the cards and services in the order the sections take. */
export function board(state: CardsState): Board {
  const nodes = sections(state).flatMap((section) => section.nodes);
  const declared = state.declared ?? [];
  const services = new Map<string, BoardService>();
  const service = (name: string, node?: string): BoardService => {
    let found = services.get(name);
    if (found === undefined) {
      found = { name, nodes: [], vramMiB: 0, claims: [], turns: 0, waiting: 0, chunks: [] };
      services.set(name, found);
    }
    if (node !== undefined && !found.nodes.includes(node)) found.nodes.push(node);
    return found;
  };
  const chunkOf = (owner: BoardService, place: CardPlace | null): BoardChunk => {
    const key = place === null ? "" : `${place.node}#${place.index}`;
    let found = owner.chunks.find((chunk) => chunk.key === key);
    if (found === undefined) {
      found = { key, place, vramMiB: null, kinds: [], wheres: [], units: [], others: [] };
      owner.chunks.push(found);
    }
    return found;
  };
  const addUnit = (owner: BoardService, place: CardPlace | null, unit: BoardUnit) => {
    const chunk = chunkOf(owner, place);
    chunk.units.push(unit);
    if (!chunk.kinds.includes(unit.kind)) chunk.kinds.push(unit.kind);
    if (!chunk.wheres.includes(unit.where)) chunk.wheres.push(unit.where);
  };
  // Each service's parts in the order they first stand, so one part wears one pattern across every card.
  const parts = new Map<string, string[]>();
  const pattern = (owner: string, part: string): number => {
    const known = parts.get(owner) ?? [];
    if (!known.includes(part)) known.push(part);
    parts.set(owner, known);
    return known.indexOf(part) % PART_PATTERNS;
  };

  const waiting: BoardTicket[] = nodes.flatMap((node) => node.cards.flatMap((card) => card.queue.filter((ticket) => !ticket.turn).map((ticket) => ({
    node: node.name, index: card.index, many: node.cards.length > 1,
    ticket: ticket.ticket, service: ticket.service, unit: ticket.unit, position: ticket.position, waitedS: ticket.waitedS, waitS: ticket.waitS,
  }))));
  const asked = new Set(waiting.flatMap((ticket) => (ticket.unit === null ? [] : [bareName(ticket.unit)])));
  const placed = new Set<string>();
  const outside: BoardChunk[] = [];

  const cards: BoardCard[] = nodes.flatMap((node) => node.cards.map((card) => {
    const place = { node: node.name, index: card.index, many: node.cards.length > 1 };
    const pieces: BoardCard["pieces"] = [];
    const resident = new Map<string, number>();
    for (const unit of card.units) {
      const owner = service(unit.service, node.name);
      const on = unit.state === "resident" || unit.state === "mixed";
      placed.add(bareName(unit.name));
      if (on) {
        pieces.push({ unit: bareName(unit.name), service: unit.service, part: unit.part, pattern: pattern(unit.service, unit.part), vramMiB: unit.vramMiB });
        resident.set(unit.service, (resident.get(unit.service) ?? 0) + unit.vramMiB);
      }
      addUnit(owner, place, { key: unit.name, part: unit.part, pattern: pattern(unit.service, unit.part), vramMiB: unit.vramMiB, kind: unit.kind ?? null,
        where: !on && asked.has(bareName(unit.name)) ? "held" : unit.state, detail: unit.detail ?? null });
    }
    if (card.turn !== null) service(card.turn.service, node.name).turns += 1;
    if (card.claim.by !== null) service(card.claim.by, node.name).claims.push(node.name);

    const others = cardOthers(card, resident);
    for (const other of others) {
      if (other.service === null) continue;
      chunkOf(service(other.service, node.name), place).others.push(other.share);
    }
    const loose = others.filter((other) => other.service === null).map((other) => other.share);
    if (loose.length > 0) outside.push({ key: `${node.name}#${card.index}`, place, vramMiB: loose.reduce((sum, one) => sum + one.vramMiB, 0), kinds: [], wheres: [], units: [], others: loose });
    for (const owner of services.values()) {
      const chunk = owner.chunks.find((one) => one.key === `${node.name}#${card.index}`);
      if (chunk === undefined) continue;
      const own = (resident.get(owner.name) ?? 0) + chunk.others.reduce((sum, one) => sum + one.vramMiB, 0);
      chunk.vramMiB = own;
      owner.vramMiB += own;
    }
    return { ...place, key: `${node.name}#${card.index}`, name: card.name, totalMiB: card.totalMiB, usedMiB: card.usedMiB, freeMiB: card.freeMiB, pieces,
      others: others.map((other) => other.share) };
  }));

  for (const ticket of waiting) {
    const owner = service(ticket.service);
    owner.waiting += 1;
    const unit = ticket.unit === null ? null : bareName(ticket.unit);
    if (unit !== null && !placed.has(unit) && !owner.chunks.some((chunk) => chunk.units.some((one) => one.key === unit))) {
      const place = { node: ticket.node, index: ticket.index, many: ticket.many };
      addUnit(owner, place, { key: unit, part: partName(unit), pattern: pattern(ticket.service, partName(unit)), vramMiB: null,
        kind: declared.find((spec) => spec.unit === unit)?.kind ?? null, where: "held", detail: null });
    }
  }
  for (const node of nodes) {
    for (const occupant of node.occupants) if (occupant !== "*") service(occupant);
  }
  for (const spec of declared) {
    const owner = service(spec.service);
    if (!spec.unit.includes("*") && !placed.has(spec.unit) && !owner.chunks.some((chunk) => chunk.units.some((one) => one.key === spec.unit))) {
      addUnit(owner, null, { key: spec.unit, part: partName(spec.unit), pattern: pattern(spec.service, partName(spec.unit)), vramMiB: spec.vramMiB, kind: spec.kind, where: "unplaced", detail: null });
    }
  }
  for (const owner of services.values()) {
    for (const chunk of owner.chunks) {
      if (chunk.place === null) chunk.vramMiB = chunk.units.every((unit) => unit.vramMiB === null) ? null : chunk.units.reduce((sum, unit) => sum + (unit.vramMiB ?? 0), 0);
    }
  }
  const listed = [...services.values()];
  return { cards, services: listed, outside, waiting, tone: palette(listed.map((one) => one.name)) };
}

// A card's memory in use past its units, named as far as its processes say: each service's processes'
// own share past the units they hold on the card, each process no service is known for, and what the
// driver keeps that no process accounts for; or, where the slave cannot read the processes, all of it in
// one share. Shares under a MiB are left out.
function cardOthers(card: CardView, resident: Map<string, number>): { what: BoardOther["what"]; service: string | null; share: BoardOther }[] {
  const key = (what: string, name: string) => `${card.index}:${what}:${name}`;
  const units = [...resident.values()].reduce((sum, one) => sum + one, 0);
  const used = card.usedMiB;
  const processes = card.processes ?? null;
  if (processes === null) {
    const left = used === null ? 0 : Math.round(used - units);
    return left > 0 ? [{ what: "unsplit", service: null, share: { key: key("unsplit", ""), what: "unsplit", process: null, vramMiB: left } }] : [];
  }
  const shares: { what: BoardOther["what"]; service: string | null; share: BoardOther }[] = [];
  const byService = new Map<string, CardProcess[]>();
  for (const process of processes) {
    if (process.service === null) {
      shares.push({ what: "process", service: null, share: { key: key("process", String(process.pid)), what: "process", process: process.name, vramMiB: Math.round(process.usedMiB) } });
    } else {
      byService.set(process.service, [...(byService.get(process.service) ?? []), process]);
    }
  }
  for (const [owner, own] of byService) {
    // A service holding no unit on the card has its processes there whole, which is no context of units.
    const holds = resident.has(owner);
    const context = Math.round(own.reduce((sum, one) => sum + one.usedMiB, 0) - (resident.get(owner) ?? 0));
    const names = [...new Set(own.map((one) => one.name))].join(", ");
    const what = holds ? "context" : "process";
    if (context > 0) shares.unshift({ what, service: owner, share: { key: key(what, owner), what, process: names, vramMiB: context } });
  }
  const counted = units + shares.reduce((sum, one) => sum + one.share.vramMiB, 0);
  const driver = used === null ? 0 : Math.round(used - counted);
  if (driver > 0) shares.push({ what: "driver", service: null, share: { key: key("driver", ""), what: "driver", process: null, vramMiB: driver } });
  return shares.filter((one) => one.share.vramMiB > 0);
}

/** What a share of a card's memory past its units is, as the board names it. */
export function otherWord(t: Translate, other: BoardOther): string {
  if (other.what === "context") return t("cards.label.context", { process: other.process ?? "" });
  if (other.what === "process") return other.process ?? "";
  return other.what === "driver" ? t("cards.label.driver") : t("cards.label.unsplit");
}

/** What a unit holds of its service, as a line under its name, or none where nothing describes it. */
export function detailText(t: Translate, detail: UnitDetail | null): string | null {
  if (detail === null) return null;
  const said: string[] = [];
  if (detail.blocks !== null) {
    said.push(detail.blocks.from === detail.blocks.to
      ? t("cards.label.block", { n: countText(detail.blocks.from) })
      : t("cards.label.blocks", { from: countText(detail.blocks.from), to: countText(detail.blocks.to) }));
  }
  if (detail.fullAttention !== null) said.push(t("cards.label.full_attention", { n: countText(detail.fullAttention) }));
  if (detail.mtp) said.push(t("cards.label.mtp"));
  if (detail.output) said.push(t("cards.label.output"));
  return said.length === 0 ? null : said.join(" · ");
}

/** Where a unit is, as its column says it. */
export function whereWord(t: Translate, where: UnitWhere): string {
  if (where === "resident") return t("cards.status.on_card");
  if (where === "held") return t("cards.status.held");
  if (where === "unplaced") return t("cards.status.unplaced");
  if (where === "evicted") return t("cards.status.evicted");
  return where === "ram" ? t("cards.status.in_ram") : t("cards.status.mixed");
}

/** A unit's kind from the rules, or a dash where no unit of the rules names it. */
export function kindWord(t: Translate, kind: UnitKind | null): string {
  if (kind === null) return "—";
  if (kind === "on-demand") return t("cards.label.on_demand");
  return kind === "fill" ? t("cards.label.fill") : t("cards.label.resident");
}

/** A card's place on the board: its node's label, and its number where the node has more than one. */
export function placeText(t: Translate, place: CardPlace, label: string): string {
  return place.many ? t("cards.label.card_of", { node: label, n: countText(place.index) }) : label;
}
