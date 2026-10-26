import { POLL_INTERVAL_MS } from "#shared/config";

import { TURN_ENDED, useLiveRefresh } from "./events";
import { roadName, roadOutcome, stageLabel } from "./judgements";
import { countText } from "./numbers";
import { tokenText } from "./usage";

import type { RoundSpend, RunProgress, SpendFigure, TokenSplit, TurnFigures, TurnRoad } from "#shared/types";
import type { LogRow } from "./log";
import type { Translate } from "#shared/wording";
import type { Ref } from "vue";

// What a run spent, as a chip beside what the run answered: one figure, the tokens it wrote, and
// under it, when pressed, one line for every run the figure adds up — for a turn of the chat agent's the
// whole round it belongs to, for any other run that run alone — each with its four kinds.
//
// The chip is what this one answer made. Read, cache read and cache write are what each request
// carried in, and a continued session carries the whole of itself in again on every turn, so they
// say how long the session is rather than what the answer cost; they stand in the spread alone.

// A road written before the record kept what its run spent, or one whose run read nothing, has
// no figures; the four kinds then stand as the one dash an unmeasured kind reads as.
const UNMEASURED: TokenSplit = { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null };

// What a figure reads where nothing was measured.
const NOTHING = "—";

export interface TurnLine {
  key: number;
  stage: string;
  road: string;
  // How it ended, where it did not simply answer.
  outcome: string | null;
  took: string;
  // The four kinds and the total they are shares of; each kind null where it was never measured.
  tally: TokenSplit & { tokens: number };
  // What the cache read says of the run where the context it carried in is known: how many requests it made, the
  // context each carried, and the cache read itself; null where the context is not known.
  requests: string | null;
}

// A chip and what it spreads into.
export interface SpendChip {
  text: string;
  // The count the text reads, which turns as it changes; none where the text is no count.
  figure: number | null;
  // Whether the figure is still an estimate, which a running turn's is.
  estimated: boolean;
  lines: TurnLine[];
}

// The row each run's chip stands under: the end of the run, which is where what it answered is.
// A run still going has no end yet, and no chip here.
export function runEnds(rows: readonly LogRow[]): Map<string, string> {
  const ends = new Map<string, string>();

  for (const row of rows) {
    if (row.depth === 0 && row.line.kind === "end") {
      ends.set(row.key, row.line.run);
    }
  }

  return ends;
}

export function turnLines(t: Translate, roads: readonly TurnRoad[]): TurnLine[] {
  return roads.map((road) => ({
    key: road.id,
    stage: stageLabel(t, road.stage),
    road: roadName(road),
    outcome: road.outcome === "answered" ? null : roadOutcome(t, road.outcome),
    took: `${countText(road.ms)}ms`,
    tally: tallyOf(road.tokens ?? UNMEASURED),
    requests: null
  }));
}

function tallyOf(split: TokenSplit): TokenSplit & { tokens: number } {
  return {
    ...split,
    tokens: (split.inputTokens ?? 0) + (split.outputTokens ?? 0) + (split.cacheReadTokens ?? 0) + (split.cacheWriteTokens ?? 0)
  };
}

// A figure's four kinds, with nothing known where no run of it was measured.
function splitOf(figure: SpendFigure): TokenSplit {
  return figure.measured === 0 ? UNMEASURED : figure;
}

// What the chip reads: the tokens written over the measured runs, or a dash where none was.
export function spendText(figure: SpendFigure): string {
  return figure.measured === 0 ? NOTHING : tokenText(figure.outputTokens);
}

// The chip of one run or one round. A figure with runs of its own spreads into them; one without
// spreads into the one line of its own reading.
/**
 * Why a run's cache read stands as high as it does: a session carries its whole context in again on every request,
 * so the cache read over the context is about how many requests the run made. Null where either is not known.
 */
export function requestsText(t: Translate, cacheReadTokens: number | null, contextTokens: number | null | undefined): string | null {
  if (contextTokens === null || contextTokens === undefined || contextTokens <= 0 || cacheReadTokens === null || cacheReadTokens <= 0) return null;

  return [
    t("agents.label.run_requests", { n: countText(Math.max(1, Math.round(cacheReadTokens / contextTokens))) }),
    t("agents.label.run_context", { tokens: tokenText(contextTokens) }),
    t("agents.label.run_cache_read", { n: countText(cacheReadTokens) })
  ].join(" · ");
}

export function spendChip(t: Translate, figure: SpendFigure & { contextTokens?: number | null }, roads: readonly TurnRoad[]): SpendChip {
  const lines =
    roads.length > 0
      ? turnLines(t, roads)
      : [
          {
            key: 0,
            stage: t("agents.label.this_run"),
            road: "",
            outcome: figure.measured === 0 ? t("agents.label.unmeasured") : null,
            took: "",
            tally: tallyOf(splitOf(figure)),
            requests: figure.measured === 0 ? null : requestsText(t, figure.cacheReadTokens, figure.contextTokens)
          }
        ];

  return { text: spendText(figure), figure: figure.measured === 0 ? null : figure.outputTokens, estimated: false, lines };
}

export function roundChip(t: Translate, spend: RoundSpend): SpendChip {
  return spendChip(t, spend, spend.roads);
}

// The chip of a turn still running, from what its stream has said so far. What it wrote is its
// thinking as the CLI counts it and its words and calls by their length, so it is marked as an
// estimate until the round's own figure replaces the chip; read, cache read and cache write are
// what the requests reported, and stand in the spread.
export function liveChip(t: Translate, progress: RunProgress | null): SpendChip {
  const written =
    progress === null || (progress.thinkingTokens === null && progress.writtenTokens === null)
      ? null
      : (progress.thinkingTokens ?? 0) + (progress.writtenTokens ?? 0);
  const spent = progress?.spent ?? null;
  const split: TokenSplit = {
    inputTokens: spent?.inputTokens ?? null,
    outputTokens: written,
    cacheReadTokens: spent?.cacheReadTokens ?? null,
    cacheWriteTokens: spent?.cacheWriteTokens ?? null
  };

  return {
    text: written === null ? NOTHING : `~${tokenText(written)}`,
    figure: written,
    estimated: true,
    lines: [{ key: 0, stage: t("agents.status.running"), road: "", outcome: null, took: "", tally: tallyOf(split), requests: null }]
  };
}

// The chips of the runs a view is showing, asked for the runs whose end it holds and has not been
// told about yet. A run is written down as it ends, so the newest run without a chip is asked
// again whenever a turn ends and on the poll; one that has a chip is never asked twice.
export function useRunChips(t: Translate, agent: string, rows: Readonly<Ref<LogRow[]>>): Ref<Map<string, SpendChip>> {
  const found = ref(new Map<string, SpendChip>());
  let asking = false;

  async function ask(runs: string[]): Promise<void> {
    if (asking || runs.length === 0) {
      return;
    }

    asking = true;

    try {
      const answer = await $fetch<{ turns: TurnFigures[] }>(`/api/agents/${encodeURIComponent(agent)}/turns`, {
        query: { runs: runs.join(",") }
      });
      const next = new Map(found.value);

      for (const turn of answer.turns) {
        if (turn.spend !== null) {
          next.set(turn.run, spendChip(t, turn.spend, turn.roads));
        }
      }

      found.value = next;
    } catch {
      // Figures are beside the log, not part of it: a question that failed leaves the log as it is.
    } finally {
      asking = false;
    }
  }

  const missing = (): string[] => [...new Set(runEnds(rows.value).values())].filter((run) => !found.value.has(run));

  watch(
    () => [...runEnds(rows.value).values()].join(","),
    () => void ask(missing()),
    { immediate: true }
  );

  useLiveRefresh(() => void ask(missing().slice(-1)), { on: TURN_ENDED, everyMs: POLL_INTERVAL_MS });

  return found;
}
