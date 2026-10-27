import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { jobLineView } from "../../../apps/web/app/domain/job-line";

import type { JobLine } from "../../../apps/web/shared/types";
import { UNIT } from "../../support/ids";
import KO from "../../fixtures/app/domain/job-line.test.ko.json";

const job = (over: Partial<JobLine>): JobLine => ({
  run: UNIT,
  todoId: 1082,
  title: KO.line_13,
  purpose: null,
  startedAt: 1_000,
  finishedAt: null,
  tools: 1234,
  models: [],
  ...over
});

describe("what a worker's job line reads", () => {
  test("a running job ticks its clock, counts its tools and adds every model's written tokens", () => {
    const view = jobLineView(wording, job({
      models: [
        { model: "claude-opus-5", inputTokens: 2, outputTokens: 40_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 300 },
        { model: "claude-haiku-4-5", inputTokens: 1, outputTokens: 5_000, cacheReadTokens: null, cacheWriteTokens: null }
      ]
    }), 1_000 + 3_725);

    expect(view).toMatchObject({ running: true, todoId: 1082, title: KO.line_31, time: wording("agents.label.job_running", { time: "01:02:05" }), tools: KO.line_31_2, written: "45K" });
    // Each model short, as the work view's head names it, and whole for its tooltip.
    expect(view.models.map((model) => [model.model, model.whole, model.total, model.tally.tokens])).toEqual([
      ["CC/CO5", "claude-opus-5", KO.line_33, 1_040_302],
      ["CC/CH45", "claude-haiku-4-5", KO.line_34, 5_001]
    ]);
  });

  test("a finished job says how long it took, and a job nothing measured reads a dash", () => {
    const view = jobLineView(wording, job({ todoId: null, title: null, purpose: KO.line_39, finishedAt: 1_000 + 90 }), 99_999);

    expect(view).toMatchObject({ running: false, title: KO.line_41, time: KO.line_41_2, written: "—", models: [] });
  });
});
