import { PAGING } from "#shared/config";

import { unitAt, unitFetch } from "./units";

import type { Judgement, JudgementPage, JudgementRoad, TokenSplit } from "#shared/types";

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
    round: row.round
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
