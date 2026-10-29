import type { GateCondition, GatePart, GatePartView } from "#shared/types";

// The gate order as a screen lays it out (the gate unit's docs/gates.md): the order itself is the server's, served
// with the agent list, and a screen reads where each gate stands out of it rather than keeping a list
// of gates of its own.

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
