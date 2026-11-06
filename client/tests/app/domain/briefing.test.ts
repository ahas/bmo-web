import { describe, expect, test } from "bun:test";

// The briefing's player as it hears the voice engine (docs/web.md, 「Messages」, the briefing's player): only a
// summary that ended done and is to come to the player comes, and it starts by itself as it comes; a browser that
// refuses a sound nobody pressed for leaves it waiting for one press. One played to its end goes after a moment
// unless the reader touched it, a briefing is played once, and stop-listening ends the one playing and all that wait
// behind it.


const { BRIEFING_TRIAL_KEY, BriefingDesk, briefingOfEvent } = await import("../../../apps/web/app/domain/briefing");

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

// A sound the browser refuses to start until a press, as a browser that will not play a sound nobody pressed for does:
// the play it did not ask for is refused, and the one a press makes is taken.
class RefusingSound extends StandInSound {
  private refusals = 0;

  override async play(): Promise<void> {
    if (this.refusals > 0) return await super.play();

    this.refusals += 1;
    throw Object.assign(new Error("a sound nobody pressed for"), { name: "NotAllowedError" });
  }
}

type Desk = InstanceType<typeof BriefingDesk>;

function depsOf(
  shown: () => BriefingShown | null,
  write: (next: BriefingShown | null) => void,
  sound: (src: string, on: SoundHandlers) => BriefingSound,
  heard = new Set<string>(),
  pagePlaying: () => boolean = () => false
): DeskDeps {
  return {
    t: (key: string) => key,
    shown: { read: shown, write },
    sound,
    src: (id) => `/api/briefings/${id}/sound`,
    players: () => [],
    pagePlaying,
    channel: () => null,
    log: { has: (key) => heard.has(key), add: (key) => void heard.add(key) },
    tab: "tab-a",
    rank: () => 0,
    now: () => NOW,
    wait: async () => undefined,
    failed: () => undefined
  };
}

function desk(): { desk: Desk; shown: () => BriefingShown | null; sounds: StandInSound[] } {
  let shown: BriefingShown | null = null;
  const sounds: StandInSound[] = [];
  const deps = depsOf(() => shown, (next) => (shown = next), (src, on) => {
    const sound = new StandInSound(src, on);

    sounds.push(sound);
    return sound;
  });

  return { desk: new BriefingDesk(deps), shown: () => shown, sounds };
}

function refusingDesk(): { desk: Desk; shown: () => BriefingShown | null } {
  let shown: BriefingShown | null = null;
  const deps = depsOf(() => shown, (next) => (shown = next), (src, on) => new RefusingSound(src, on));

  return { desk: new BriefingDesk(deps), shown: () => shown };
}

describe("what plays by itself", () => {
  test("is a summary that ended done and is to play by itself", () => {
    expect(briefingOfEvent(ended())).toEqual({ id: 7, chatId: 42, messageId: 548, endedAt: NOW - 1_000, title: "a title" });
    expect(briefingOfEvent(ended({ kind: "full" }))).toBeNull();
    expect(briefingOfEvent(ended({ plays: false }))).toBeNull();
    expect(briefingOfEvent(ended({ state: "failed" }))).toBeNull();
    expect(briefingOfEvent({ id: 1, at: NOW, type: "voice-briefing", chatId: 42, messageId: 548, phase: "created", voice: voice() })).toBeNull();
  });
});

describe("the trial voice", () => {
  test("comes to the player playing by itself, leading back where it was tried, and once however often it is pressed", async () => {
    const held = desk();

    held.desk.trial("/briefing-trial.ogg", "/rooms/1?settings=briefing");
    held.desk.trial("/briefing-trial.ogg", "/rooms/1?settings=briefing");

    expect(held.sounds.map((one) => one.src)).toEqual(["/briefing-trial.ogg"]);
    expect(held.sounds[0]?.played).toBe(1);
    expect(held.shown()?.key).toBe(BRIEFING_TRIAL_KEY);
    expect(held.shown()?.phase).toBe("playing");
    expect(held.shown()?.to).toBe("/rooms/1?settings=briefing");
  });
});

function pageDesk(): { desk: Desk; shown: () => BriefingShown | null; sounds: StandInSound[]; page: (playing: boolean) => void } {
  let shown: BriefingShown | null = null;
  let playing = false;
  const sounds: StandInSound[] = [];
  const deps = depsOf(
    () => shown,
    (next) => (shown = next),
    (src, on) => {
      const sound = new StandInSound(src, on);

      sounds.push(sound);
      return sound;
    },
    new Set(),
    () => playing
  );

  return { desk: new BriefingDesk(deps), shown: () => shown, sounds, page: (next) => (playing = next) };
}

describe("the page's own sound", () => {
  test("a briefing that comes while the page plays waits, and plays when the page's sound stops", async () => {
    const held = pageDesk();

    held.page(true);
    await held.desk.hear({ id: 7, chatId: 42, messageId: 548, endedAt: NOW - 1_000, title: null });

    // It is in the player, waiting for the page's sound rather than dropped, and nothing was started.
    expect(held.sounds.length).toBe(1);
    expect(held.sounds[0]?.played).toBe(0);
    expect(held.shown()?.key).toBe("briefing:7");
    expect(held.shown()?.phase).toBe("paused");

    held.page(false);
    held.desk.resume();
    await Promise.resolve();

    expect(held.sounds[0]?.played).toBe(1);
    expect(held.shown()?.phase).toBe("playing");
  });

  test("a briefing behind one already waiting plays as the page's sound stops", async () => {
    const held = pageDesk();

    held.page(true);
    await held.desk.hear({ id: 7, chatId: 42, messageId: 548, endedAt: NOW - 1_000, title: null });
    await held.desk.hear({ id: 8, chatId: 42, messageId: 549, endedAt: NOW - 1_000, title: null });
    expect(held.desk.queued()).toEqual(["briefing:8"]);

    held.page(false);
    held.desk.resume();
    await Promise.resolve();

    expect(held.sounds[0]?.played).toBe(1);
    expect(held.desk.queued()).toEqual(["briefing:8"]);
  });

  test("a press plays the waiting briefing though the page's sound goes on", async () => {
    const held = pageDesk();

    held.page(true);
    await held.desk.hear({ id: 7, chatId: 42, messageId: 548, endedAt: NOW - 1_000, title: null });

    held.shown()?.play();
    await Promise.resolve();

    expect(held.sounds[0]?.played).toBe(1);
    expect(held.shown()?.phase).toBe("playing");
  });

  test("the trial voice plays at its press though the page plays", () => {
    const held = pageDesk();

    held.page(true);
    held.desk.trial("/briefing-trial.ogg", "/rooms/1?settings=briefing");

    expect(held.sounds[0]?.played).toBe(1);
    expect(held.shown()?.phase).toBe("playing");
  });
});

describe("the player", () => {
  test("plays by itself as it comes, from its sound, leading to its line", async () => {
    const held = desk();

    await held.desk.hear({ id: 7, chatId: 42, messageId: 548, endedAt: NOW - 1_000, title: null });

    expect(held.sounds[0]?.src).toBe("/api/briefings/7/sound");
    expect(held.sounds[0]?.played).toBe(1);
    expect(held.shown()?.to).toBe("/rooms/42?at=548");
    expect(held.shown()?.phase).toBe("playing");
  });

  test("waits for one press where the browser refuses a sound nobody pressed for, and that press starts it", async () => {
    const held = refusingDesk();

    await held.desk.hear({ id: 7, chatId: 42, messageId: 548, endedAt: NOW - 1_000, title: null });
    await Promise.resolve();

    expect(held.shown()?.phase).toBe("blocked");

    // The press is the gesture the browser asked for, and the same play is taken.
    held.shown()?.play();
    await Promise.resolve();

    expect(held.shown()?.phase).toBe("playing");
  });

  test("goes a moment after it played to its end, and stays where the reader paused or moved it", async () => {
    const played = desk();

    await played.desk.hear({ id: 7, chatId: 42, messageId: 548, endedAt: NOW - 1_000, title: null });
    played.sounds[0]!.paused = true;
    played.sounds[0]!.on.ended();
    await Promise.resolve();
    await Promise.resolve();
    expect(played.shown()).toBeNull();

    const touched = desk();

    await touched.desk.hear({ id: 8, chatId: 42, messageId: 549, endedAt: NOW - 1_000, title: null });
    touched.sounds[0]!.on.moved();
    touched.sounds[0]!.paused = true;
    touched.sounds[0]!.on.ended();
    await Promise.resolve();
    await Promise.resolve();
    expect(touched.shown()?.key).toBe("briefing:8");
    expect(touched.shown()?.phase).toBe("paused");
  });

  test("leaves one heard long after it ended to its line", async () => {
    const held = desk();

    await held.desk.hear({ id: 11, chatId: 42, messageId: 552, endedAt: NOW - 3_600_000, title: null });
    expect(held.sounds.length).toBe(0);
    expect(held.shown()).toBeNull();
  });

  test("plays one heard late by itself, and plays a briefing once", async () => {
    const held = desk();

    await held.desk.hear({ id: 8, chatId: 42, messageId: 549, endedAt: NOW - 300_000, title: null });
    expect(held.sounds[0]?.played).toBe(1);
    expect(held.shown()?.phase).toBe("playing");

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
