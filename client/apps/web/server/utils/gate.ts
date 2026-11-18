import { PAGING } from "#shared/config";
import { gateConditions } from "#shared/types";

import { unitAt, unitFetch } from "./units";

import type { ExactMessageId, GateCondition, GateOfferRecord, GatePartView, Judgement, JudgementLine, JudgementMark, JudgementPage, JudgementRoad, KeptCounts, TokenSplit } from "#shared/types";

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

// The key whose integer names the receiver message a judgement stands under, read as an exact id.
const JUDGEMENT_MESSAGE_IDS: ReadonlySet<string> = new Set(["messageId"]);

// One judgement, as the gate writes it.
interface GateJudgement {
  id: number;
  roomId: number;
  messageId: ExactMessageId | null;
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

/** A judgement as a room's page carries it: what places it and colours its mark, without what only its card stands. A
 * silent turn's reason is read after the page, in the reader's language (the skip-reasons module). */
export function markOf(judgement: Judgement): JudgementMark {
  const { id, chatId, messageId, stage, verdict, createdAt, round } = judgement;

  return { id, chatId, messageId, stage, verdict, createdAt, round };
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

/** A room's judgements newest first, the page before `before` where it is given, written within `span`, of one stage
 * where `stage` names it. */
export async function judgementsOf(
  chatId: number,
  before: number | null,
  limit: number,
  span: JudgementSpan = OPEN,
  stage: string | null = null
): Promise<JudgementPage> {
  if (unitAt("GATE") === null) return { judgements: [], hasMore: false };

  const query = new URLSearchParams({ roomId: String(chatId), limit: String(Math.min(limit, PAGING.maxSize)) });

  if (stage !== null) query.set("gateName", stage);
  if (before !== null) query.set("before", String(before));
  if (span.from !== null) query.set("from", String(span.from * 1000));
  if (span.to !== null) query.set("to", String(span.to * 1000));

  const page = await unitFetch<GatePage>("GATE", `/judgements?${query.toString()}`, undefined, { exactIds: JUDGEMENT_MESSAGE_IDS });

  return { judgements: page.items.map(asJudgement), hasMore: page.more === true };
}

// How many of the gate's pages one stretch is read through at most. A room's busiest day writes a few
// thousand judgements; a stretch past this many pages keeps its newest.
const SPAN_PAGES = 10;

/** Every judgement of a room written within `span`, of one stage where `stage` names it, newest first, read page after
 * page. */
export async function judgementsWithin(chatId: number, span: JudgementSpan, stage: string | null = null): Promise<Judgement[]> {
  const held: Judgement[] = [];
  let before: number | null = null;

  for (let read = 0; read < SPAN_PAGES; read++) {
    const page = await judgementsOf(chatId, before, PAGING.maxSize, span, stage);
    const last = page.judgements.at(-1);

    held.push(...page.judgements);

    if (!page.hasMore || last === undefined) break;

    before = last.id;
  }

  return held;
}

// One reading the gate's translator made of an original (the gate's `docs/api.md`, 「Translations」): its words, and
// whether every part of it was translated.
export interface GateReading {
  text: string;
  whole: boolean;
}

// The most originals one call to the translator carries, the gate's own bound.
export const READINGS_PER_CALL = 16;

/** The gate's readings of `originals` in `language`, one for each in order, asked for a reader of `role`. The gate's
 * own 503, a translator too busy, passes on as it is; any other refusal as the console's. */
export async function gateReadings(language: string, originals: readonly string[], role: string): Promise<GateReading[]> {
  const answer = await unitFetch<{ readings?: { text?: unknown; whole?: unknown }[] }>(
    "GATE",
    "/translations",
    { method: "POST", headers: { "content-type": "application/json", "owner-role": role }, body: JSON.stringify({ language, originals }) },
    { passStatus: [503] }
  );

  return (answer?.readings ?? []).map((one, at) => ({ text: typeof one.text === "string" ? one.text : originals[at]!, whole: one.whole === true }));
}

// The gate order as the gate unit serves it (the gate unit's `docs/api.md`, 「Gates」): each gate's part, step and
// condition, which is where the agent list puts each gate's row.
interface GateRow {
  gateName: string;
  part: string;
  step: number;
  condition: string | null;
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
