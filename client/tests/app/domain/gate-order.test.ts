import { describe, expect, test } from "bun:test";

import { GATE_ORDER } from "../../support/gate-order";

import { gateOrderKeys, gatePlacements } from "../../../apps/web/app/domain/gate-order";

// An order as the gate unit serves one.
const order = GATE_ORDER;

describe("where each gate stands", () => {
  test("is every place of the gate order, part by part and step by step", () => {
    const placements = gatePlacements(order);

    expect(placements.map((one) => `${one.part}:${one.step ?? "-"}:${one.key}`)).toEqual(
      order.flatMap((part) =>
        part.steps.flatMap((step, index) => step.places.map((place) => `${part.part}:${part.inTurn ? index + 1 : "-"}:${place.key}`))
      )
    );
  });

  test("numbers the steps within each turn part, and none outside a turn", () => {
    const placements = gatePlacements(order);

    for (const part of ["pre", "post"] as const) {
      const steps = placements.filter((one) => one.part === part).map((one) => one.step);

      expect(steps[0]).toBe(1);
      expect(steps.every((step) => step !== null)).toBe(true);
    }

    expect(placements.filter((one) => one.part === "apart").every((one) => one.step === null)).toBe(true);
  });

  test("marks the gates of one step as starting together, and gives them one number", () => {
    const together = gatePlacements(order).filter((one) => one.together);
    const step = order.find((part) => part.steps.some((one) => one.places.length > 1))!;
    const shared = step.steps.find((one) => one.places.length > 1)!;

    expect(together.map((one) => one.key)).toEqual(shared.places.map((place) => place.key));
    expect(new Set(together.map((one) => one.step)).size).toBe(1);
  });

  test("stands a gate that runs in both turn parts in each", () => {
    const placements = gatePlacements(order);
    const twice = [...new Set(placements.map((one) => one.key))].filter((key) => placements.filter((one) => one.key === key).length > 1);

    for (const key of twice) {
      expect(placements.filter((one) => one.key === key).map((one) => one.part)).toEqual(["pre", "post"]);
    }
  });

  test("gives each gate once in the order where it first stands", () => {
    const keys = gateOrderKeys(order);

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys[0]).toBe(gatePlacements(order)[0]?.key);
  });

  test("is nothing at all before the order has been read", () => {
    expect(gatePlacements([])).toEqual([]);
    expect(gateOrderKeys([])).toEqual([]);
  });
});

