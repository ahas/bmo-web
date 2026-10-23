import { describe, expect, test } from "bun:test";

import { board, detailText, memoryBar, mibText, otherWord, palette, sections, waitText } from "../../../apps/web/app/domain/cards";

import type { CardsState, CardUnit } from "../../../apps/web/shared/cards";

// The host's settings bmo-ui reads a figure's thousands mark by.
Object.assign(globalThis, { useAppConfig: () => ({ bmoUi: { zone: "Asia/Seoul", locale: "ko-KR", dateLocale: "ko" } }) });

const t = (key: string, values?: Record<string, unknown>) => `${key}${values ? JSON.stringify(values) : ""}`;

const card = (free: number, units: [string, string, number, "resident" | "ram" | "evicted"][]) => ({
  index: 0, name: "NVIDIA GeForce RTX 4070", totalMiB: 11875, usedMiB: 11875 - free, freeMiB: free,
  units: units.map(([name, service, vramMiB, state]) => ({ name, service, part: name.split("/")[1]!.split("@")[0]!, vramMiB, state, ramMiB: 0, since: null, evictable: true, reason: null, loadMs: null, unloadMs: null, detail: null as CardUnit["detail"] })),
  turn: null, queue: [], claim: { by: null, since: null }, ram: { dumpsMiB: 0, availableMiB: null, maxMiB: null, floorMiB: null, dump: null }, stage: { waiting: false, waitingS: 0 }, store: null,
});

const node = (name: string, view: ReturnType<typeof card>) => ({
  name, role: null, desktop: false, version: "v", rules: null, occupants: [], cards: [view],
  link: { state: "connected" as const, since: 1, readAt: 1, lastReadMs: 50, error: null },
});

describe("the card arbiter screen", () => {
  test("a card's bar is each resident unit in its service's colour, then the free room", () => {
    const tone = palette(["kakia"]);
    const pieces = memoryBar(t, card(1600, [["kakia/weights@a", "kakia", 4039, "resident"], ["kakia/store@a", "kakia", 4739, "evicted"], ["kakia/compute@a", "kakia", 1300, "ram"]]), tone);
    expect(pieces.map((piece) => piece.key)).toEqual(["kakia/weights@a", "free"]);
    expect(pieces[0]!.tone).toBe(tone("kakia").bar);
    expect(pieces[1]!.share).toBeCloseTo(1600 / 11875);
    expect(mibText(t, 4039)).toBe("4,039 MiB");
    expect(mibText(t, null)).toBe("hardware.label.unread");
  });

  test("the groups stand in the rules' order, and a node no group chooses after them", () => {
    const state: CardsState = {
      master: { version: "m", startedAt: 0, rulesFile: "r", rulesLoadedAt: 0, rulesError: null, readEveryS: 2 },
      groups: [{ name: "compute", pool: true, nodes: ["b", "a"], totalMiB: 23750, freeMiB: 3200 }],
      nodes: [node("a", card(1600, [])), node("b", card(1600, [])), node("c", card(9000, []))],
      events: [],
    };
    expect(sections(state).map((section) => [section.name, section.nodes.map((one) => one.name)])).toEqual([["compute", ["b", "a"]], ["", ["c"]]]);
  });

  test("the board has every card's units and leftover use, each service with its units, and what waits", () => {
    const busy = {
      ...card(1600, [["kakia/weights@a", "kakia", 4000, "resident"], ["kakia/store@a", "kakia", 4000, "evicted"]]),
      queue: [{ ticket: "t1", service: "voice", turn: false, position: 1, waitedS: 4, waitS: 30, unit: "voice/big", vramMiB: null }],
    };
    const state: CardsState = {
      master: { version: "m", startedAt: 0, rulesFile: "r", rulesLoadedAt: 0, rulesError: null, readEveryS: 2 },
      groups: [],
      nodes: [{ ...node("a", card(0, [])), occupants: ["trainer", "kakia", "*"], cards: [busy] }],
      declared: [{ unit: "kakia/*", service: "kakia", kind: "resident", vramMiB: null }, { unit: "voice/small", service: "voice", kind: "on-demand", vramMiB: 900 }],
      events: [],
    };
    const shown = board(state);
    expect(shown.cards[0]!.pieces.map((piece) => [piece.unit, piece.pattern])).toEqual([["kakia/weights", 0]]);
    expect(shown.cards[0]!.others.map((other) => [other.what, other.vramMiB])).toEqual([["unsplit", 11875 - 1600 - 4000]]);
    expect(shown.outside.map((chunk) => [chunk.place?.node, chunk.vramMiB])).toEqual([["a", 11875 - 1600 - 4000]]);
    expect(shown.services.map((service) => [service.name, service.vramMiB, service.waiting])).toEqual([["kakia", 4000, 0], ["voice", 0, 1], ["trainer", 0, 0]]);
    expect(shown.services[0]!.chunks.map((chunk) => [chunk.place?.node, chunk.vramMiB, chunk.wheres])).toEqual([["a", 4000, ["resident", "evicted"]]]);
    expect(shown.services[0]!.chunks[0]!.units.map((unit) => [unit.part, unit.pattern, unit.where])).toEqual([["weights", 0, "resident"], ["store", 1, "evicted"]]);
    expect(shown.services[1]!.chunks.map((chunk) => [chunk.place?.node ?? null, chunk.units.map((unit) => [unit.key, unit.kind, unit.where])])).toEqual([
      ["a", [["voice/big", null, "held"]]],
      [null, [["voice/small", "on-demand", "unplaced"]]],
    ]);
    expect(shown.waiting.map((ticket) => [ticket.service, ticket.node, ticket.unit])).toEqual([["voice", "a", "voice/big"]]);
    expect(new Set(shown.services.map((service) => shown.tone(service.name).bar)).size).toBe(3);
  });

  test("a card's processes name its memory past the units: a service's context, a stray process, the driver's", () => {
    const busy = {
      ...card(1600, [["kakia/weights@a", "kakia", 4000, "resident"], ["kakia/store@a", "kakia", 5000, "resident"]]),
      processes: [{ pid: 7, name: "rpc-server", service: "kakia", usedMiB: 9450 }, { pid: 9, name: "Xorg", service: null, usedMiB: 120 }],
    };
    busy.units[0]!.detail = { blocks: { from: 0, to: 17 }, output: false, mtp: false, fullAttention: null };
    busy.units[1]!.detail = { blocks: { from: 57, to: 63 }, output: true, mtp: true, fullAttention: 2 };
    const state: CardsState = {
      master: { version: "m", startedAt: 0, rulesFile: "r", rulesLoadedAt: 0, rulesError: null, readEveryS: 2 },
      groups: [],
      nodes: [{ ...node("a", card(0, [])), cards: [busy] }],
      events: [],
    };
    const shown = board(state);
    const kakia = shown.services[0]!.chunks[0]!;
    expect(kakia.others.map((other) => [otherWord(t, other), other.vramMiB])).toEqual([['cards.label.context{"process":"rpc-server"}', 450]]);
    expect(kakia.vramMiB).toBe(9450);
    expect(shown.services[0]!.vramMiB).toBe(9450);
    expect(shown.outside[0]!.others.map((other) => [otherWord(t, other), other.vramMiB])).toEqual([["Xorg", 120], ["cards.label.driver", 11875 - 1600 - 9450 - 120]]);
    expect(detailText(t, kakia.units[0]!.detail)).toBe('cards.label.blocks{"from":"0","to":"17"}');
    expect(detailText(t, kakia.units[1]!.detail)).toBe('cards.label.blocks{"from":"57","to":"63"} · cards.label.full_attention{"n":"2"} · cards.label.mtp · cards.label.output');
  });

  test("a wait reads in the largest unit that fits it", () => {
    expect(waitText(t, 46.4)).toBe('common.label.seconds{"n":46}');
    expect(waitText(t, 167)).toBe('common.label.minutes{"m":2}');
    expect(waitText(t, 294 * 60 + 4)).toBe('common.label.hours_minutes{"h":4,"m":54}');
    expect(waitText(t, 2 * 86_400 + 60)).toBe('common.label.days{"d":"2"}');
  });
});
