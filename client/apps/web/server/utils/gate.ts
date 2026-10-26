import { PAGING } from "#shared/config";
import { gateConditions } from "#shared/types";

import { unitAt, unitFetch } from "./units";

import type { GateCondition, GateOfferRecord, GatePartView, Judgement, JudgementLine, JudgementPage, JudgementRoad, KeptCounts, LayaAgreement, LayaGateView, LayaHealth, LayaMode, LayaModeRefusal, TokenSplit, TurnGateView } from "#shared/types";

// A room's judgements as the gate's console API holds them (the gate's `docs/api.md`, 「Judgements」): newest
// first, a page at a time, each road a gate run walked beside it. The gate's address and token stand in the
// console's environment as `GATE_ADDRESS` and `GATE_TOKEN` (docs/boundary.md, 「Settings」); a console whose
// environment names no gate answers every page empty, as a screen of a unit not yet split does.

// One road a gate run walked, as the gate writes it.
interface GateRoad {
  id: number;
  provider: string;
  model: string;
  outcome: string;
  ms: number;
  tokens?: TokenSplit | null;
}

// One gate's row of its round's offers record, as the gate hands it with a judgement.
interface GateOffer {
  gateName: string;
  held: number;
  asked: number;
  kept: Partial<KeptCounts>;
  capped: number;
  rules: string[] | null;
}

// One judgement, as the gate writes it.
interface GateJudgement {
  id: number;
  roomId: number;
  messageId: number | null;
  gateName: string;
  verdict: string;
  detail: string | null;
  createdAt: number;
  ms: number | null;
  round: string | null;
  roads?: GateRoad[];
  offers?: GateOffer[];
  lines?: { line?: unknown; answer?: unknown }[];
}

/** The lines a judgement's model read of its candidates, each with its answer; a line that does not read is left out. */
export function linesOf(lines: readonly { line?: unknown; answer?: unknown }[] | undefined): JudgementLine[] {
  return (lines ?? []).flatMap((one) =>
    typeof one?.line === "string" ? [{ line: one.line, answer: typeof one.answer === "string" ? one.answer : null }] : []
  );
}

interface GatePage {
  items: GateJudgement[];
  more: boolean;
}

// The gate's words for a judgement, in the ones the room screen reads.
function asJudgement(row: GateJudgement): Judgement {
  const roads: JudgementRoad[] = (row.roads ?? []).map((road) => ({
    id: road.id,
    provider: road.provider,
    model: road.model,
    outcome: road.outcome,
    ms: road.ms,
    tokens: road.tokens ?? null
  }));

  const offers = (row.offers ?? []).map(offerOf);
  const lines = linesOf(row.lines);

  return {
    id: row.id,
    chatId: row.roomId,
    messageId: row.messageId,
    stage: row.gateName,
    verdict: row.verdict,
    detail: row.detail,
    // The gate states its times in epoch milliseconds; the room screen draws unix seconds.
    createdAt: Math.floor(row.createdAt / 1000),
    ms: row.ms,
    roads,
    round: row.round,
    // The round's offers record rides on the verdict; its quiet instructions are the receiver's, put in beside it.
    ...(offers.length === 0 ? {} : { opening: { instructions: [], offers } }),
    ...(lines.length === 0 ? {} : { lines })
  };
}

// A row of the offers record in the room screen's words. A count the gate does not hand is none kept.
function offerOf(offer: GateOffer): GateOfferRecord {
  const kept = offer.kept;

  return {
    stage: offer.gateName,
    held: offer.held,
    asked: offer.asked,
    kept: { item: kept.item ?? 0, keyword: kept.keyword ?? 0, word: kept.word ?? 0, person: kept.person ?? 0, recent: kept.recent ?? 0 },
    capped: offer.capped,
    rules: offer.rules
  };
}

// The stretch of time a read is narrowed to, in unix seconds; an end left null is open.
export interface JudgementSpan {
  from: number | null;
  to: number | null;
}

const OPEN: JudgementSpan = { from: null, to: null };

/** A room's judgements newest first, the page before `before` where it is given, written within `span`. */
export async function judgementsOf(chatId: number, before: number | null, limit: number, span: JudgementSpan = OPEN): Promise<JudgementPage> {
  if (unitAt("GATE") === null) return { judgements: [], hasMore: false };

  const query = new URLSearchParams({ roomId: String(chatId), limit: String(Math.min(limit, PAGING.maxSize)) });

  if (before !== null) query.set("before", String(before));
  if (span.from !== null) query.set("from", String(span.from * 1000));
  if (span.to !== null) query.set("to", String(span.to * 1000));

  const page = await unitFetch<GatePage>("GATE", `/judgements?${query.toString()}`);

  return { judgements: page.items.map(asJudgement), hasMore: page.more === true };
}

// How many of the gate's pages one stretch is read through at most. A room's busiest day writes a few
// thousand judgements; a stretch past this many pages keeps its newest.
const SPAN_PAGES = 10;

/** Every judgement of a room written within `span`, newest first, read page after page. */
export async function judgementsWithin(chatId: number, span: JudgementSpan): Promise<Judgement[]> {
  const held: Judgement[] = [];
  let before: number | null = null;

  for (let read = 0; read < SPAN_PAGES; read++) {
    const page = await judgementsOf(chatId, before, PAGING.maxSize, span);
    const last = page.judgements.at(-1);

    held.push(...page.judgements);

    if (!page.hasMore || last === undefined) break;

    before = last.id;
  }

  return held;
}

// The gate order as the gate unit serves it (the gate unit's `docs/api.md`, 「Gates」): each gate's part, step and
// condition, whether its profile lets it be switched off, and its Laya probe.
interface GateRow {
  gateName: string;
  part: string;
  step: number;
  condition: string | null;
  switchable: boolean;
  layaProbe: boolean;
  defaultLayaMode: string | null;
}

interface GateOptions {
  enabled?: boolean;
  layaMode?: string | null;
  effective?: { layaMode?: string | null };
}

const knownCondition = (condition: string | null): GateCondition | null =>
  condition !== null && (gateConditions as readonly string[]).includes(condition) ? (condition as GateCondition) : null;

async function gateRows(): Promise<GateRow[]> {
  return (await unitFetch<{ items: GateRow[] }>("GATE", "/gates")).items;
}

/** The gate order, part by part and step by step, or null where the gate unit is not reached. */
export async function gateOrderView(): Promise<GatePartView[] | null> {
  if (unitAt("GATE") === null) return null;

  let rows: GateRow[];

  try {
    rows = await gateRows();
  } catch {
    return null;
  }

  const inTurn = (part: "pre" | "post"): GatePartView => {
    const steps = [...new Set(rows.filter((row) => row.part === part).map((row) => row.step))].sort((left, right) => left - right);

    return {
      part,
      inTurn: true,
      steps: steps.map((step) => ({
        places: rows.filter((row) => row.part === part && row.step === step).map((row) => ({ key: row.gateName, condition: knownCondition(row.condition) }))
      }))
    };
  };
  const apart = rows.filter((row) => row.part === "apart").map((row) => ({ places: [{ key: row.gateName, condition: null }] }));

  const parts: GatePartView[] = [inTurn("pre"), inTurn("post"), { part: "apart", inTurn: false, steps: apart }];

  return parts.filter((part) => part.steps.length > 0);
}

/** The gates a turn passes, each with its Laya mode as it runs and its switch where it has one. */
export async function turnGates(): Promise<TurnGateView[]> {
  const rows = (await gateRows()).filter((row) => row.part === "pre" || row.part === "post");

  return await Promise.all(
    rows.map(async (row): Promise<TurnGateView> => {
      const options = await unitFetch<GateOptions>("GATE", `/options/${encodeURIComponent(row.gateName)}`).catch((): GateOptions => ({}));

      return {
        name: row.gateName,
        part: row.part as "pre" | "post",
        step: row.step,
        condition: knownCondition(row.condition),
        switchable: row.switchable,
        enabled: options.enabled ?? true,
        layaProbe: row.layaProbe,
        layaMode: row.layaProbe ? (options.effective?.layaMode ?? options.layaMode ?? row.defaultLayaMode) : null
      };
    })
  );
}

/** One gate switched on or off, where its profile lets it be. */
export async function switchGate(name: string, enabled: boolean): Promise<void> {
  await unitFetch("GATE", `/options/${encodeURIComponent(name)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled }) });
}

// The Laya server's last health check and each gate's standing beside it, as the gate unit serves them (the gate
// unit's `docs/api.md`, 「Laya」), its moments in unix seconds as every screen reads them.
interface GateLaya {
  health: {
    state: string;
    model: string | null;
    device: string | null;
    vramBytes: number | null;
    loadMs: number | null;
    versions: Record<string, string>;
    address: string | null;
    checkMs: number | null;
    checkedAt: number | null;
    answeredAt: number | null;
  };
  gates: {
    gateName: string;
    mode: LayaMode;
    tau: number | null;
    agreement: (Omit<LayaAgreement, "stage"> & { gateName: string }) | null;
    checkpoint: string | null;
    refused: LayaGateView["refused"] | { mode: LayaMode; code: LayaModeRefusal }[];
  }[];
  modes: LayaMode[];
  taus: number[];
}

export interface LayaRead {
  health: LayaHealth;
  gates: LayaGateView[];
  modes: LayaMode[];
  taus: number[];
}

const seconds = (ms: number | null): number | null => (ms === null ? null : Math.floor(ms / 1000));

function refusedOf(refused: GateLaya["gates"][number]["refused"]): LayaGateView["refused"] {
  return Array.isArray(refused) ? Object.fromEntries(refused.map((one) => [one.mode, one.code])) : refused;
}

/** The Laya server's last health check and every gate's mode, tau, agreement and checkpoint. */
export async function layaOf(): Promise<LayaRead> {
  const read = await unitFetch<GateLaya>("GATE", "/laya");
  const { health } = read;

  return {
    health: {
      state: health.state as LayaHealth["state"],
      model: health.model,
      device: health.device,
      vramBytes: health.vramBytes,
      loadMs: health.loadMs,
      versions: health.versions ?? {},
      address: health.address,
      checkMs: health.checkMs,
      checkedAt: seconds(health.checkedAt),
      healthyAt: seconds(health.answeredAt)
    },
    gates: read.gates.map((gate) => ({
      stage: gate.gateName,
      mode: gate.mode,
      tau: gate.tau,
      agreement: gate.agreement === null ? null : { ...gate.agreement, stage: gate.agreement.gateName },
      checkpoint: gate.checkpoint,
      refused: refusedOf(gate.refused ?? {})
    })),
    modes: read.modes,
    taus: read.taus
  };
}
