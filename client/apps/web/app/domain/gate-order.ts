import type { Translate } from "#shared/wording";
import type { GateCondition, GatePart, GatePartView } from "#shared/types";

// The gate order as a screen lays it out (the gate unit's docs/gates.md): the order itself is the server's, served
// with the agent list, and a screen reads where each gate stands out of it rather than keeping a list
// of gates of its own. What is kept here is only the words each part and each condition is shown in.

// The words each part is headed with, the owner's own names for the two parts of a turn.
export const GATE_PART_LABELS: Record<GatePart, string> = {
  pre: "agents.label.gate_part_pre",
  post: "agents.label.gate_part_post",
  apart: "agents.label.gate_part_apart"
};

// The words each Laya mode a gate may run in is said in (the gate unit's `docs/laya.md`).
const LAYA_MODE_WORDS: Record<string, string> = {
  off: "agents.label.laya_mode_off",
  shadow: "agents.label.laya_mode_shadow",
  filter: "agents.label.laya_mode_filter",
  asymmetric: "agents.label.laya_mode_asymmetric"
};

/** A Laya mode's words; one this screen has no words for stands as a sentence naming it. */
export function layaModeWord(t: Translate, mode: string | null): string {
  const key = mode === null ? undefined : LAYA_MODE_WORDS[mode];

  return key === undefined ? t("agents.label.laya_mode_unknown", { mode: mode ?? "—" }) : t(key);
}

// The words a step that runs in some turns only is marked with.
export const GATE_CONDITION_NOTES: Record<GateCondition, string> = {
  "fresh-session": "agents.label.gate_condition_fresh_session",
  "folding-dialect": "agents.label.gate_condition_folding_dialect"
};

// One place a gate stands: its part, its step's number within the part (none outside a turn),
// whether its step starts other gates with it, and the condition its step runs under.
export interface GatePlacement {
  key: string;
  part: GatePart;
  step: number | null;
  together: boolean;
  condition: GateCondition | null;
}

// Every place of the gate order, part by part and step by step. A gate that runs in both turn parts
// stands once in each.
export function gatePlacements(order: readonly GatePartView[]): GatePlacement[] {
  return order.flatMap((part) =>
    part.steps.flatMap((step, index) =>
      step.places.map((place) => ({
        key: place.key,
        part: part.part,
        step: part.inTurn ? index + 1 : null,
        together: step.places.length > 1,
        condition: place.condition
      }))
    )
  );
}

// Each gate once, where it first stands in the gate order. A key the order does not place is not in
// it; a screen puts such a gate after every placed one.
export function gateOrderKeys(order: readonly GatePartView[]): string[] {
  return [...new Set(gatePlacements(order).map((placement) => placement.key))];
}
