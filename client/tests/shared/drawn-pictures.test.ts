import { describe, expect, test } from "bun:test";

import { DRAWN_STEPS, drawnAddress, drawnStep } from "../../apps/web/shared/drawn-pictures";

describe("the steps a picture is drawn small at", () => {
  test("run from 16 to 2048, each at most a quarter wider than the one before", () => {
    expect(DRAWN_STEPS[0]).toBe(16);
    expect(DRAWN_STEPS.at(-1)).toBe(2048);

    for (let at = 1; at < DRAWN_STEPS.length; at += 1) {
      expect(DRAWN_STEPS[at]! / DRAWN_STEPS[at - 1]!).toBeLessThanOrEqual(1.25);
      expect(DRAWN_STEPS[at]!).toBeGreaterThan(DRAWN_STEPS[at - 1]!);
    }
  });

  test("answer a width asked with the first step at or above it, and the widest past the last", () => {
    expect(drawnStep("16")).toBe(16);
    expect(drawnStep("50")).toBe(DRAWN_STEPS.find((step) => step >= 50)!);
    expect(drawnStep("99999")).toBe(2048);
  });

  test("answer no width where none, nothing or no number is asked", () => {
    for (const value of [undefined, "", "0", "-5", "1.5", "wide", ["40"]]) expect(drawnStep(value)).toBeNull();
  });

  test("ask a width beside whatever the address already asks", () => {
    expect(drawnAddress("/p", 40)).toBe("/p?w=40");
    expect(drawnAddress("/p?v=1", 40)).toBe("/p?v=1&w=40");
  });
});
