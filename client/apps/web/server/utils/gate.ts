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
    createdAt: row.createdAt,
    ms: row.ms,
    roads,
    round: row.round
  };
}

/** A room's judgements newest first, the page before `before` where it is given. */
export async function judgementsOf(chatId: number, before: number | null, limit: number): Promise<JudgementPage> {
  if (unitAt("GATE") === null) return { judgements: [], hasMore: false };

  const query = new URLSearchParams({ roomId: String(chatId), limit: String(Math.min(limit, PAGING.maxSize)) });

  if (before !== null) query.set("before", String(before));

  const page = await unitFetch<GatePage>("GATE", `/judgements?${query.toString()}`);

  return { judgements: page.items.map(asJudgement), hasMore: page.more === true };
}
