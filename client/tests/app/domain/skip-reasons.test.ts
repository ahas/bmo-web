import { describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../../support/globals";

import { nextTick, ref, watch } from "vue";

import { wording } from "../../../apps/web/shared/wording";

import type { JudgementMark, SkipReason } from "../../../apps/web/shared/types";
import type { RoomOutcome } from "../../../apps/web/app/domain/events";

// Why a silent turn sent nothing, on the line under it (docs/web.md, 「A turn the chat agent chose not to answer」):
// the newer of two turns over one message speaks for both, a turn naming no reason says so in the pack's words, each
// verdict is asked about once for the screen's life, and the passing reason asks only for a silent turn's and keeps
// no answer that came after another passing reason took its place.

const globals: Record<string, unknown> = globalThis;

globalsRestoredAfter(["ref", "watch", "$fetch"]);
globals.ref = ref;
globals.watch = watch;

const asks: { url: string; query: Record<string, unknown> }[] = [];
let latest: () => Promise<unknown> = async () => ({ latest: { id: 9, reason: { kind: "named", text: "ko:newest" } } });

globals.$fetch = async (url: string, options: { query: Record<string, unknown> }) => {
  asks.push({ url, query: options.query });

  if (url.endsWith("/skip-reasons/latest")) return await latest();

  return { reasons: Object.fromEntries(String(options.query.ids).split(",").map((id) => [id, { kind: "named", text: `ko:${id}` }])) };
};

const { newestSkipped, skipReasonLine, useLatestSkipReason, useSkipReasons } = await import("../../../apps/web/app/domain/skip-reasons");
const { SKIPPED_OUTCOME } = await import("../../../apps/web/app/domain/events");

const mark = (id: number, stage: string, createdAt: number): JudgementMark => ({ id, chatId: -1, messageId: "5", stage, verdict: "SKIP", createdAt });

const settle = async (): Promise<void> => {
  for (let round = 0; round < 5; round += 1) await nextTick();
};

describe("a silent turn's reason line", () => {
  test("stands the newest silent turn's reason, and says so where it named none", () => {
    expect(newestSkipped([mark(1, "skipped", 10), mark(3, "skipped", 30), mark(4, "chat", 40), mark(2, "skipped", 20)])?.id).toBe(3);
    expect(newestSkipped([mark(4, "chat", 40)])).toBeNull();
    expect(skipReasonLine(wording, { kind: "named", text: "words" })).toBe(wording("room.status.outcome_skipped_reason", { reason: "words" }));
    expect(skipReasonLine(wording, { kind: "unnamed" })).toBe(wording("room.status.outcome_skipped_reason_none"));
  });

  test("asks about each silent turn once, in the reader's language, for the time its verdicts were written in", async () => {
    asks.length = 0;

    const marks = ref<JudgementMark[]>([mark(1, "skipped", 100), mark(2, "chat", 150), mark(3, "skipped", 200)]);
    const reasons = useSkipReasons(-1, () => "ko", () => marks.value);

    await settle();
    marks.value = [...marks.value, mark(4, "skipped", 300)];
    await settle();

    expect(asks.map((one) => one.query)).toEqual([
      { ids: "1,3", from: 100, to: 200, language: "ko" },
      { ids: "4", from: 300, to: 300, language: "ko" }
    ]);
    expect([...reasons.value.entries()]).toEqual([
      [1, { kind: "named", text: "ko:1" }],
      [3, { kind: "named", text: "ko:3" }],
      [4, { kind: "named", text: "ko:4" }]
    ]);
  });

  test("of the passing reason is asked for a silent turn's alone, and an answer overtaken is dropped", async () => {
    asks.length = 0;

    const outcome = ref<RoomOutcome | null>({ key: "room.status.outcome_run_failed" });
    const reason = useLatestSkipReason(-1, () => "ko", () => outcome.value);

    await settle();
    expect(asks).toEqual([]);

    let answerNow: (value: unknown) => void = () => undefined;

    latest = async () => await new Promise((done) => (answerNow = done));
    outcome.value = { key: SKIPPED_OUTCOME };
    await settle();
    outcome.value = null;
    await settle();
    answerNow({ latest: { id: 9, reason: { kind: "unnamed" } } });
    await settle();

    expect(asks.map((one) => one.query)).toEqual([{ language: "ko" }]);
    expect(reason.value).toBeNull();

    latest = async () => ({ latest: { id: 9, reason: { kind: "unnamed" } } });
    outcome.value = { key: SKIPPED_OUTCOME };
    await settle();

    expect(reason.value).toEqual<SkipReason>({ kind: "unnamed" });
  });
});
