import { describe, expect, test } from "bun:test";

import "../../support/nitro";

const { lineBriefing } = await import("../../../apps/web/server/utils/archive");

import type { VoiceBriefing } from "../../../apps/web/shared/types";

// Where a line's briefing chip stands, as the voice engine's briefings of its room say (docs/web.md, the room
// screen's chip): the newest full reading of the line decides it.
const reading = (over: Partial<VoiceBriefing>): VoiceBriefing => ({
  id: 1, chatId: 42, messageId: 548, kind: "full", title: null, state: "done", durationMs: 9_000, plays: false,
  voiceMessageId: null, spoken: true, finishedAt: 1, ...over
});

describe("a line's briefing", () => {
  test("stands as never asked for, being made, there, failed or stopped", () => {
    expect(lineBriefing([], 548).state).toBe("idle");
    expect(lineBriefing([reading({ kind: "summary" })], 548).state).toBe("idle");
    expect(lineBriefing([reading({ state: "waiting", id: 3 })], 548)).toMatchObject({ state: "making", briefingId: 3 });
    expect(lineBriefing([reading({ state: "failed", id: 4 })], 548)).toMatchObject({ state: "failed", briefingId: 4 });
    expect(lineBriefing([reading({ id: 5 })], 548)).toMatchObject({ state: "ready", source: "kept", briefingId: 5 });
    expect(lineBriefing([reading({ state: "stopped", id: 7 })], 548)).toMatchObject({ state: "stopped", source: null, briefingId: 7 });
  });

  test("an old reading the engine did not speak plays the voice message the room heard it as", () => {
    expect(lineBriefing([reading({ id: 6, spoken: false, voiceMessageId: 900 })], 548)).toMatchObject({ state: "ready", source: "voice", voiceMessageId: 900 });
  });

  test("the newest reading of the line is the one that counts", () => {
    expect(lineBriefing([reading({ id: 9, state: "waiting" }), reading({ id: 8 })], 548).state).toBe("making");
  });
});
