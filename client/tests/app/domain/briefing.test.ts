import { describe, expect, test } from "bun:test";

// The briefing's player as it hears the voice engine (docs/web.md, 「Messages」, the briefing's player): only a
// summary that ended done and is to play by itself plays, one heard late stands waiting for a press, a briefing is
// played once, and stop-listening ends the one playing and all that wait behind it.


const { BriefingDesk, briefingOfEvent, fresh } = await import("../../../apps/web/app/domain/briefing");

import type { BriefingShown, BriefingSound, DeskDeps, SoundHandlers } from "../../../apps/web/app/domain/briefing";
import type { BotEvent, VoiceBriefing } from "../../../apps/web/shared/types";

const NOW = 1_800_000_000_000;

const voice = (over: Partial<VoiceBriefing> = {}): VoiceBriefing => ({
  id: 7, chatId: 42, messageId: 548, kind: "summary", title: "a title", state: "done", durationMs: 9_000, plays: true,
  voiceMessageId: null, spoken: true, finishedAt: NOW - 1_000, ...over
});
const ended = (over: Partial<VoiceBriefing> = {}): BotEvent => ({ id: 1, at: NOW, type: "voice-briefing", chatId: 42, messageId: 548, phase: "ended", voice: voice(over) });

class StandInSound implements BriefingSound {
  paused = true;
  played = 0;

  constructor(readonly src: string, readonly on: SoundHandlers) {}

  async play(): Promise<void> {
    this.played += 1;
    this.paused = false;
    this.on.playing();
  }

  pause(): void {
    this.paused = true;
  }

  release(): void {}

  position(): { at: number; length: number } | null {
    return { at: 3, length: 9 };
  }

  levels(): boolean {
    return false;
  }
}

function desk(): { desk: InstanceType<typeof BriefingDesk>; shown: () => BriefingShown | null; sounds: StandInSound[] } {
  let shown: BriefingShown | null = null;
  const sounds: StandInSound[] = [];
  const heard = new Set<string>();
  const deps: DeskDeps = {
    t: (key: string) => key,
    shown: { read: () => shown, write: (next) => (shown = next) },
    sound: (src, on) => {
      const sound = new StandInSound(src, on);

      sounds.push(sound);
      return sound;
    },
    src: (id) => `/api/briefings/${id}/sound`,
    players: () => [],
    channel: () => null,
    log: { has: (key) => heard.has(key), add: (key) => void heard.add(key) },
    tab: "tab-a",
    rank: () => 0,
    now: () => NOW,
    wait: async () => undefined,
    failed: () => undefined
  };

  return { desk: new BriefingDesk(deps), shown: () => shown, sounds };
}

describe("what plays by itself", () => {
  test("is a summary that ended done and is to play by itself", () => {
    expect(briefingOfEvent(ended())).toEqual({ id: 7, chatId: 42, messageId: 548, endedAt: NOW - 1_000, title: "a title" });
    expect(briefingOfEvent(ended({ kind: "full" }))).toBeNull();
    expect(briefingOfEvent(ended({ plays: false }))).toBeNull();
    expect(briefingOfEvent(ended({ state: "failed" }))).toBeNull();
    expect(briefingOfEvent({ id: 1, at: NOW, type: "voice-briefing", chatId: 42, messageId: 548, phase: "created", voice: voice() })).toBeNull();
  });

  test("is news for two minutes after it ended", () => {
    expect(fresh({ id: 7, chatId: 42, messageId: 548, endedAt: NOW - 119_000, title: null }, NOW)).toBe(true);
    expect(fresh({ id: 7, chatId: 42, messageId: 548, endedAt: NOW - 121_000, title: null }, NOW)).toBe(false);
  });
});

describe("the player", () => {
  test("plays a fresh one at once, from its sound, leading to its line", async () => {
    const held = desk();

    await held.desk.hear({ id: 7, chatId: 42, messageId: 548, endedAt: NOW - 1_000, title: null });
    expect(held.sounds[0]?.src).toBe("/api/briefings/7/sound");
    expect(held.sounds[0]?.played).toBe(1);
    expect(held.shown()?.to).toBe("/rooms/42?at=548");
    expect(held.shown()?.phase).toBe("playing");
  });

  test("leaves one heard long after it ended to its line", async () => {
    const held = desk();

    await held.desk.hear({ id: 11, chatId: 42, messageId: 552, endedAt: NOW - 3_600_000, title: null });
    expect(held.sounds.length).toBe(0);
    expect(held.shown()).toBeNull();
  });

  test("stands one heard late waiting for a press, and plays a briefing once", async () => {
    const held = desk();

    await held.desk.hear({ id: 8, chatId: 42, messageId: 549, endedAt: NOW - 300_000, title: null });
    expect(held.sounds[0]?.played).toBe(0);
    expect(held.shown()?.phase).toBe("paused");

    await held.desk.hear({ id: 8, chatId: 42, messageId: 549, endedAt: NOW - 300_000, title: null });
    expect(held.sounds.length).toBe(1);
  });

  test("ends the one playing and every one waiting on stop-listening", async () => {
    const held = desk();

    await held.desk.hear({ id: 9, chatId: 42, messageId: 550, endedAt: NOW - 1_000, title: null });
    await held.desk.hear({ id: 10, chatId: 42, messageId: 551, endedAt: NOW - 1_000, title: null });
    expect(held.desk.queued()).toEqual(["briefing:10"]);

    held.shown()?.stop();
    await Promise.resolve();
    expect(held.shown()).toBeNull();
    expect(held.desk.queued()).toEqual([]);
  });
});
