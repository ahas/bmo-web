import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import {
  chainOwn,
  chainToPolicy,
  movedStage,
  placedStage,
  stageNameFault,
  stageTextFault,
  stageTextSet,
  stageToPolicy,
  stagesChange,
  stagesFormOf,
  stagesHeld,
  withAddedStage,
  withoutAddedStage,
  withoutStage,
  withStage
} from "../../../apps/web/app/domain/instruction-stages";

import type { SupervisorStagesView } from "../../../apps/web/shared/instruction-stages";

// A supervisor's draft block (docs/web.md, 「Agent management screen」, the settings dialog's draft block): how the chain
// of instruction stages is ordered, what a stage is refused before it goes, and what a save of the block sends.

const POLICY = ["review"];

function view(over: Partial<SupervisorStagesView> = {}): SupervisorStagesView {
  return {
    source: "default",
    stages: POLICY,
    policy: POLICY,
    texts: [
      { name: "review", text: "Did it address everyone rightly?", source: "default", policyText: "Did it address everyone rightly?" },
      { name: "sources", text: "Is every fact sourced?", source: "default", policyText: "Is every fact sourced?" }
    ],
    ...over
  };
}

describe("the chain", () => {
  test("adds a stage at its end once, and takes one out", () => {
    expect(withStage(["review"], "sources")).toEqual(["review", "sources"]);
    expect(withStage(["review", "sources"], "review")).toEqual(["review", "sources"]);
    expect(withoutStage(["review", "sources"], "review")).toEqual(["sources"]);
  });

  test("moves a stage up or down, never past either end", () => {
    expect(movedStage(["review", "sources", "tone"], "sources", -1)).toEqual(["sources", "review", "tone"]);
    expect(movedStage(["review", "sources", "tone"], "sources", 1)).toEqual(["review", "tone", "sources"]);
    expect(movedStage(["review", "sources"], "review", -1)).toEqual(["review", "sources"]);
    expect(movedStage(["review", "sources"], "sources", 1)).toEqual(["review", "sources"]);
  });

  test("carries a stage to another stage's place", () => {
    expect(placedStage(["review", "sources", "tone"], 2, 0)).toEqual(["tone", "review", "sources"]);
    expect(placedStage(["review", "sources", "tone"], 0, 2)).toEqual(["sources", "tone", "review"]);
    expect(placedStage(["review", "sources"], 5, 0)).toEqual(["review", "sources"]);
  });
});

describe("a stage's name and text", () => {
  test("a new name is a lowercase letter, then lowercase letters, digits and dashes, of at most 40 characters no stage holds", () => {
    expect(stageNameFault(wording, "tone-check", POLICY)).toBeNull();
    expect(stageNameFault(wording, "check2", POLICY)).toBeNull();
    expect(stageNameFault(wording, "Tone", POLICY)).toBe(wording("agents.error.stage_name", { max: "40" }));
    expect(stageNameFault(wording, "2nd-check", POLICY)).toBe(wording("agents.error.stage_name", { max: "40" }));
    expect(stageNameFault(wording, "a".repeat(41), POLICY)).toBe(wording("agents.error.stage_name", { max: "40" }));
    expect(stageNameFault(wording, "review", POLICY)).toBe(wording("agents.error.stage_name_taken"));

    for (const name of ["message", "arrived", "audit"]) {
      expect(stageNameFault(wording, name, POLICY)).toBe(wording("agents.error.stage_name_reserved"));
    }
  });

  test("a text is not empty and at most 4,000 characters", () => {
    expect(stageTextFault(wording, "Is it right?")).toBeNull();
    expect(stageTextFault(wording, "  ")).not.toBeNull();
    expect(stageTextFault(wording, "x".repeat(4_001))).not.toBeNull();
  });
});

describe("a supervisor's draft block", () => {
  test("follows the policy's chain until the chain differs from it, and sends nothing while nothing changed", () => {
    const form = stagesFormOf(view());

    expect(chainOwn(form, POLICY)).toBe(false);
    expect(stagesChange(view(), form)).toEqual({});

    form.stages = movedStage(withStage(form.stages, "sources"), "sources", -1);

    expect(chainOwn(form, POLICY)).toBe(true);
    expect(stagesChange(view(), form)).toEqual({ stages: ["sources", "review"] });
  });

  test("keeps a chain of its own that says what the policy's says, and takes it away once put back to the policy's", () => {
    const same = view({ source: "set" });
    const held = view({ source: "set", stages: [] });

    expect(chainOwn(stagesFormOf(same), POLICY)).toBe(true);
    expect(stagesChange(same, stagesFormOf(same))).toEqual({});

    const back = chainToPolicy(stagesFormOf(held), POLICY);

    expect(back).toMatchObject({ keepOwn: false, stages: ["review"] });
    expect(chainOwn(back, POLICY)).toBe(false);
    expect(stagesChange(held, back)).toEqual({ stages: null });
  });

  test("sends a stage added with its text before the chain that names it", () => {
    const form = withAddedStage(stagesFormOf(view()), "tone", "Does the tone fit?");

    expect(form.stages).toEqual(["review", "tone"]);
    expect(Object.keys(stagesChange(view(), form))).toEqual(["texts", "stages"]);
    expect(stagesChange(view(), form)).toEqual({ texts: { tone: "Does the tone fit?" }, stages: ["review", "tone"] });
  });

  test("sends a changed text, and takes the console's away once the policy's text stands again", () => {
    const form = stagesFormOf(view());

    form.texts[0]!.text = "Did it use the brain's terms?";

    expect(stageTextSet(form.texts[0]!)).toBe(true);
    expect(stageTextSet(form.texts[1]!)).toBe(false);
    expect(stagesChange(view(), form)).toEqual({ texts: { review: "Did it use the brain's terms?" } });

    const set = view({ texts: view().texts.map((one) => (one.name === "review" ? { ...one, text: "Did it use the brain's terms?", source: "set" as const } : one)) });
    const back = stageToPolicy(stagesFormOf(set), "review");

    expect(back.texts[0]).toMatchObject({ text: "Did it address everyone rightly?", source: "default" });
    expect(stagesChange(set, back)).toEqual({ removed: ["review"] });
  });

  test("deletes a stage the console added: the chain sent without it before its text is taken away, a stage of the policy's never", () => {
    const set = view({
      source: "set",
      stages: ["review", "tone"],
      texts: [...view().texts, { name: "tone", text: "Does the tone fit?", source: "set", policyText: null }]
    });
    const gone = withoutAddedStage(stagesFormOf(set), "tone");

    expect(gone.texts.map((one) => one.name)).toEqual(["review", "sources"]);
    expect(gone.stages).toEqual(["review"]);
    expect(Object.keys(stagesChange(set, gone))).toEqual(["stages", "removed"]);
    expect(stagesChange(set, gone)).toEqual({ stages: ["review"], removed: ["tone"] });
    expect(withoutAddedStage(stagesFormOf(set), "review")).toEqual(stagesFormOf(set));
  });

  test("holds no change once a value is changed back, however it was changed", () => {
    const set = view({ source: "set", stages: ["sources", "review"], texts: view().texts.map((one) => (one.name === "review" ? { ...one, text: "Did it use the brain's terms?", source: "set" as const } : one)) });
    const opened = stagesHeld(stagesFormOf(set), POLICY);

    // A text put back to the policy's and typed again.
    const retyped = stageToPolicy(stagesFormOf(set), "review");

    expect(stagesHeld(retyped, POLICY)).not.toEqual(opened);
    retyped.texts[0]!.text = "Did it use the brain's terms?";
    expect(stagesHeld(retyped, POLICY)).toEqual(opened);
    expect(stagesChange(set, retyped)).toEqual({});

    // A chain put back to the policy's and ordered again.
    const back = chainToPolicy(stagesFormOf(set), POLICY);

    expect(stagesHeld(back, POLICY)).not.toEqual(opened);

    const reordered = { ...back, stages: movedStage(withStage(back.stages, "sources"), "sources", -1) };

    expect(stagesHeld(reordered, POLICY)).toEqual(opened);
    expect(stagesChange(set, reordered)).toEqual({});
  });
});
