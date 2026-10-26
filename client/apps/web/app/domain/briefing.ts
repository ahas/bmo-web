import { BRIEFING_FRESH_MS, BRIEFING_SHOWN_MS } from "#shared/config";
import { TAP_FFT, tapOf } from "bmo-ui/app/domain/sound-tap";
import { useIsland } from "bmo-ui/app/domain/island";

import { useBotEvents } from "./events";
import { briefingSoundUrl, playAlone } from "./player";

import type { Playing } from "./player";
import type { Tap } from "bmo-ui/app/domain/sound-tap";
import type { BotEvent } from "#shared/types";
import type { Translate } from "#shared/wording";
import type { Ref } from "vue";

// A voice briefing heard on the voice engine's stream and played in the console (docs/web.md, 「Messages」, the
// briefing's player): a summary that ended done and is to play by itself. It stands as a small player of its own
// while it plays, one tab of the browser plays it, and stop-listening ends it and every one waiting behind it here.

export interface HeardBriefing {
  id: number;
  chatId: number;
  // The line it speaks, none while it awaits one.
  messageId: number | null;
  // When it ended, in epoch milliseconds.
  endedAt: number;
  // The title the engine gave it, none where it gave none.
  title: string | null;
}

/** A briefing that plays by itself, as the engine says it ended: a summary, done, whose `plays` holds. */
export function briefingOfEvent(event: BotEvent): HeardBriefing | null {
  if (event.type !== "voice-briefing" || event.phase !== "ended") return null;

  const voice = event.voice;

  if (voice.kind !== "summary" || voice.state !== "done" || !voice.plays || !voice.spoken) return null;

  return { id: voice.id, chatId: voice.chatId, messageId: voice.messageId, endedAt: voice.finishedAt ?? event.at, title: voice.title };
}

// Whether it is still news. The stream hands back what it holds when it opens, and a briefing heard more than two
// minutes after it ended — a tab opened afterwards, a laptop waking — stands in the player waiting for a press
// rather than speaking over whatever the reader is doing now.
export function fresh(heard: HeardBriefing, now: number): boolean {
  return now - heard.endedAt <= BRIEFING_FRESH_MS;
}

// The key a briefing is known by, so the same briefing heard twice is one.
export function briefingKey(id: number): string {
  return `briefing:${id}`;
}

// Where a briefing's sound stands. Loading is the moment before the browser has said anything;
// blocked is a browser that refused to start a sound nobody pressed for, which waits for a press.
export type BriefingPhase = "loading" | "playing" | "paused" | "blocked";

// The briefing the player stands for while it plays: the sound itself, its title, how far it has played, and its
// presses.
export interface BriefingShown {
  key: string;
  // Where pressing the visualiser goes: the line it speaks, in its room.
  to: string;
  title: string | null;
  phase: BriefingPhase;
  // Starting or carrying on the sound, pausing it, and stop-listening, which ends it and every one waiting behind it.
  play: () => void;
  pause: () => void;
  stop: () => void;
  // How far the sound has played this moment and how long it is, in seconds; null while its length is not known.
  position: () => { at: number; length: number } | null;
  // The sound's spectrum this moment, written into the array; false where the browser gives none.
  levels: (into: Uint8Array<ArrayBuffer>) => boolean;
}

export const BRIEFING_STATE = "bmo-briefing";

export function briefingState(): Ref<BriefingShown | null> {
  return useState<BriefingShown | null>(BRIEFING_STATE, () => null);
}

// How many bars the visualiser stands, and which bins of the tapped spectrum each one reads: a
// voice lives in the first twenty or so, and each bar takes a band of them, wider as they climb, the
// way an ear hears pitch.
export const BRIEFING_FFT = TAP_FFT;
const BAR_BANDS: Array<[number, number]> = [
  [1, 3],
  [3, 5],
  [5, 8],
  [8, 12],
  [12, 20]
];

export const BRIEFING_BARS = BAR_BANDS.length;

// Each bar's height, from nought to one, out of the spectrum the sound gave.
export function barsOf(bins: Uint8Array): number[] {
  return BAR_BANDS.map(([from, to]) => {
    let sum = 0;

    for (let bin = from; bin < to; bin += 1) {
      sum += bins[bin] ?? 0;
    }

    return sum / (to - from) / 255;
  });
}

// The bars moving on their own, for a sound whose spectrum the browser does not give: each sways at
// a pace of its own, so the row reads as a voice rather than a wave passing along it.
export function swayingBars(seconds: number): number[] {
  return Array.from({ length: BRIEFING_BARS }, (_, bar) => {
    const pace = 5 + bar * 1.7;

    return 0.45 + 0.3 * Math.sin(seconds * pace + bar * 1.3) + 0.15 * Math.sin(seconds * pace * 2.3 + bar);
  });
}

// How much larger the whole player stands at the loudest the bars can read, and the size it stands
// at for one row of bars. It follows the square of their mean: a voice reads loud on every bar at
// once, so the mean moves little between syllables, and the square is what makes those moves show,
// while a pause still brings it back to its own size.
export const BRIEFING_SWELL = 0.1;

export function swellOf(bars: number[]): number {
  if (bars.length === 0) {
    return 1;
  }

  const loudness = bars.reduce((sum, bar) => sum + Math.min(1, Math.max(0, bar)), 0) / bars.length;

  return 1 + BRIEFING_SWELL * loudness * loudness;
}

// What a sound tells the desk as it goes.
export interface SoundHandlers {
  playing: () => void;
  paused: () => void;
  ended: () => void;
  failed: () => void;
}

// The sound a briefing plays through: an element of the page in a browser, a stand-in in a test.
export interface BriefingSound extends Playing {
  play: () => Promise<void>;
  release: () => void;
  levels: (into: Uint8Array<ArrayBuffer>) => boolean;
  position: () => { at: number; length: number } | null;
}

// What the tabs of one browser say to each other to agree which of them plays. Every tab hears the
// same briefing on its own stream at nearly the same moment, so each says it would play it and
// waits a moment; the one every tab ranks first plays and says it has, and the rest stand down.
export type ClaimWord = { kind: "claim"; key: string; tab: string; rank: number } | { kind: "taken"; key: string; tab: string };

export interface Claim {
  tab: string;
  // Lower plays first: the tab being looked at, then one merely shown, then one hidden.
  rank: number;
}

export interface ClaimChannel {
  post: (word: ClaimWord) => void;
  close: () => void;
}

// How long a tab waits for the others' claims before it decides.
export const CLAIM_MS = 300;

// How many briefings' early claims a tab keeps.
const EARLY_KEPT = 8;

// The breath between one briefing ending and the next one waiting behind it starting.
export const BRIEFING_PAUSE_MS = 600;

// The tab every tab ranks first, decided the same way in each of them.
export function claimWinner(claims: Claim[]): string | null {
  const [first] = [...claims].sort((one, two) => one.rank - two.rank || (one.tab < two.tab ? -1 : one.tab > two.tab ? 1 : 0));

  return first?.tab ?? null;
}

export function claimWordOf(data: unknown): ClaimWord | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }

  const said = data as Record<string, unknown>;

  if (typeof said.key !== "string" || typeof said.tab !== "string") {
    return null;
  }

  if (said.kind === "taken") {
    return { kind: "taken", key: said.key, tab: said.tab };
  }

  return said.kind === "claim" && typeof said.rank === "number" ? { kind: "claim", key: said.key, tab: said.tab, rank: said.rank } : null;
}

// The briefings this browser has already played or seen stopped, which a stream opening again
// hands back and which are not played twice. It is shared by the browser's tabs.
export interface HeardLog {
  has: (key: string) => boolean;
  add: (key: string, at: number) => void;
}

// The log as it is kept, read back with what can no longer be played dropped from it.
export function keptHeard(raw: string | null, now: number): Record<string, number> {
  let read: unknown;

  try {
    read = raw === null ? {} : JSON.parse(raw);
  } catch {
    read = {};
  }

  const kept: Record<string, number> = {};

  if (typeof read === "object" && read !== null) {
    for (const [key, at] of Object.entries(read)) {
      if (typeof at === "number" && now - at <= 2 * BRIEFING_FRESH_MS) {
        kept[key] = at;
      }
    }
  }

  return kept;
}

export interface DeskDeps {
  t: Translate;
  // The player's state: what stands while a briefing plays, and nothing otherwise.
  shown: { read: () => BriefingShown | null; write: (shown: BriefingShown | null) => void };
  sound: (src: string, handlers: SoundHandlers) => BriefingSound;
  src: (id: number) => string;
  // The screen's own players, which a briefing starting pauses.
  players: () => Iterable<Playing>;
  channel: (hear: (word: ClaimWord) => void) => ClaimChannel | null;
  log: HeardLog;
  tab: string;
  rank: () => number;
  now: () => number;
  wait: (ms: number) => Promise<void>;
  failed: (error: unknown, fallback: string) => void;
}

// One sound the desk plays through the player: where it comes from, where a press on the player leads while it
// plays, and whether it starts by itself or waits for a press.
interface Playable {
  key: string;
  src: string;
  to: string;
  title: string | null;
  starts: boolean;
}

interface Current {
  playable: Playable;
  sound: BriefingSound;
  over: boolean;
}

interface Pending {
  claims: Claim[];
  yielded: boolean;
}

// A browser that would not start a sound nobody pressed for. Any other refusal is a failure.
function refusedUnasked(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === "NotAllowedError";
}

// A play the page itself cut short — a pause arriving before the sound had started — which is a
// pause rather than a failure.
function cutShort(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === "AbortError";
}

// What plays the briefings of one tab. One plays at a time: a new one waits behind the one playing
// and plays once it has ended, after a short pause (docs/web.md, 「Messages」, the briefing's player).
export class BriefingDesk {
  private current: Current | null = null;
  // What this tab took while another was playing in the order it came.
  private waiting: Playable[] = [];
  private readonly pending = new Map<string, Pending>();
  // Claims another tab made before this one heard the briefing itself. The tabs hear it moments
  // apart, and a claim dropped for arriving first would leave this tab deciding on its own claim
  // alone while the other decided on both.
  private readonly early = new Map<string, Claim[]>();
  private readonly channel: ClaimChannel | null;

  constructor(private readonly deps: DeskDeps) {
    this.channel = deps.channel((word) => this.word(word));
  }

  // The key of the briefing this tab is playing, if any.
  playing(): string | null {
    return this.current?.playable.key ?? null;
  }

  async hear(heard: HeardBriefing): Promise<void> {
    const key = briefingKey(heard.id);

    // One that ended long before the tab heard of it — handed back by a stream opening again — is left to its line.
    if (this.deps.now() - heard.endedAt > BRIEFING_SHOWN_MS) return;

    if (this.deps.log.has(key) || this.current?.playable.key === key || this.pending.has(key) || this.waiting.some((one) => one.key === key)) {
      return;
    }

    if (!(await this.claim(key)) || this.deps.log.has(key)) {
      return;
    }

    this.deps.log.add(key, this.deps.now());
    this.channel?.post({ kind: "taken", key, tab: this.deps.tab });
    this.line({
      key,
      src: this.deps.src(heard.id),
      to: heard.messageId === null ? `/rooms/${heard.chatId}` : `/rooms/${heard.chatId}?at=${heard.messageId}`,
      title: heard.title,
      starts: fresh(heard, this.deps.now())
    });
  }

  // Played now, or behind the one playing and those already waiting.
  private line(playable: Playable): void {
    if (this.current !== null || this.waiting.length > 0) {
      this.waiting.push(playable);

      return;
    }

    this.start(playable);
  }

  // The keys of the briefings waiting behind the one playing, in the order they will play.
  queued(): string[] {
    return this.waiting.map((one) => one.key);
  }

  close(): void {
    this.waiting = [];

    if (this.current !== null) {
      this.finish(this.current.playable.key);
    }

    this.channel?.close();
  }

  private async claim(key: string): Promise<boolean> {
    if (this.channel === null) {
      return true;
    }

    const mine: Claim = { tab: this.deps.tab, rank: this.deps.rank() };
    const pending: Pending = { claims: [mine, ...(this.early.get(key) ?? [])], yielded: false };

    this.early.delete(key);
    this.pending.set(key, pending);
    this.channel.post({ kind: "claim", key, ...mine });
    await this.deps.wait(CLAIM_MS);
    this.pending.delete(key);

    return !pending.yielded && claimWinner(pending.claims) === this.deps.tab;
  }

  private word(word: ClaimWord): void {
    const pending = this.pending.get(word.key);

    if (word.kind === "taken") {
      if (pending !== undefined) {
        pending.yielded = true;
      }

      return;
    }

    const claim: Claim = { tab: word.tab, rank: word.rank };

    if (pending !== undefined) {
      pending.claims.push(claim);
    } else if (this.current?.playable.key === word.key) {
      // A tab that heard it after this one had already taken it.
      this.channel?.post({ kind: "taken", key: word.key, tab: this.deps.tab });
    } else {
      this.keepEarly(word.key, claim);
    }
  }

  // Kept for the few that can still be heard: a briefing this tab never hears leaves its claims
  // here, and the oldest go once there are more than a handful.
  private keepEarly(key: string, claim: Claim): void {
    this.early.set(key, [...(this.early.get(key) ?? []), claim]);

    for (const old of this.early.keys()) {
      if (this.early.size <= EARLY_KEPT) {
        break;
      }

      this.early.delete(old);
    }
  }

  private start(playable: Playable): void {
    const { key } = playable;
    // The handlers reach the briefing they belong to, which is made once its sound is.
    let current!: Current;
    const sound = this.deps.sound(playable.src, {
      playing: () => {
        this.move(current, "playing");
        playAlone(current.sound, this.deps.players());
      },
      paused: () => this.move(current, "paused"),
      ended: () => this.finish(key),
      failed: () => this.fail(current, null)
    });

    current = { playable, sound, over: false };
    this.current = current;

    this.deps.shown.write({
      key,
      to: playable.to,
      title: playable.title,
      phase: playable.starts ? "loading" : "paused",
      play: () => void this.play(current),
      pause: () => current.sound.pause(),
      stop: () => this.stop(current),
      levels: (into) => current.sound.levels(into),
      position: () => current.sound.position()
    });

    if (playable.starts) void this.play(current);
  }

  private move(current: Current, phase: BriefingPhase): void {
    const shown = this.deps.shown.read();

    if (current.over || shown?.key !== current.playable.key) {
      return;
    }

    this.deps.shown.write({ ...shown, phase });
  }

  private async play(current: Current): Promise<void> {
    if (current.over) {
      return;
    }

    try {
      await current.sound.play();
    } catch (error) {
      if (current.over || cutShort(error)) {
        return;
      }

      if (refusedUnasked(error)) {
        this.move(current, "blocked");
      } else {
        this.fail(current, error);
      }
    }
  }

  private stop(current: Current): void {
    if (current.over) {
      return;
    }

    // stop-listening is a stop to listening: what waits behind it goes too.
    this.waiting = [];
    this.finish(current.playable.key);
  }

  private fail(current: Current, error: unknown): void {
    if (current.over) {
      return;
    }

    this.finish(current.playable.key);
    this.deps.failed(error, this.deps.t("briefing.error.play_failed"));
  }

  private finish(key: string): void {
    const current = this.current;

    if (current === null || current.playable.key !== key) {
      return;
    }

    current.over = true;
    this.current = null;
    current.sound.pause();
    current.sound.release();
    this.deps.shown.write(null);
    void this.next();
  }

  // The briefing waiting first, played after a breath, unless something else has started meanwhile.
  private async next(): Promise<void> {
    if (this.waiting.length === 0) {
      return;
    }

    await this.deps.wait(BRIEFING_PAUSE_MS);

    const upcoming = this.current === null ? this.waiting.shift() : undefined;

    if (upcoming !== undefined) {
      this.start(upcoming);
    }
  }
}

// The page's own element for a briefing's sound. It is one of the page's players, so a voice
// message started on the room screen pauses it as it pauses any other; it is marked as the
// briefing's, so the briefing starting does not pause itself. The tap is taken once it plays,
// since the copy of a sound that has not started carries nothing to read.
function elementSound(src: string, on: SoundHandlers): BriefingSound {
  const element = document.createElement("audio");
  const listening = new AbortController();
  const options = { signal: listening.signal };
  let tap: Tap | null = null;

  element.dataset.player = "";
  element.dataset.briefing = "";
  element.hidden = true;
  element.preload = "auto";
  element.src = src;
  element.addEventListener(
    "playing",
    () => {
      tap ??= tapOf(element);
      on.playing();
    },
    options
  );
  element.addEventListener("pause", () => on.paused(), options);
  element.addEventListener("ended", () => on.ended(), options);
  element.addEventListener("error", () => on.failed(), options);
  document.body.append(element);

  return {
    get paused() {
      return element.paused;
    },
    play: () => element.play(),
    pause: () => element.pause(),
    levels: (into) => tap?.levels(into) ?? false,
    position: () => (Number.isFinite(element.duration) && element.duration > 0 ? { at: element.currentTime, length: element.duration } : null),
    release: () => {
      listening.abort();
      tap?.release();
      tap = null;
      element.removeAttribute("src");
      element.load();
      element.remove();
    }
  };
}

const CHANNEL = "bmo-briefing";
const HEARD_KEY = "bmo-briefings-heard";

function storedLog(): HeardLog {
  const read = (): Record<string, number> => {
    try {
      return keptHeard(localStorage.getItem(HEARD_KEY), Date.now());
    } catch {
      return {};
    }
  };

  return {
    has: (key) => key in read(),
    add: (key, at) => {
      try {
        localStorage.setItem(HEARD_KEY, JSON.stringify({ ...read(), [key]: at }));
      } catch {
        // A browser that keeps nothing plays a briefing at most once per tab, which is still once.
      }
    }
  };
}

function browserChannel(hear: (word: ClaimWord) => void): ClaimChannel | null {
  if (typeof BroadcastChannel === "undefined") {
    return null;
  }

  const channel = new BroadcastChannel(CHANNEL);

  channel.onmessage = (message: MessageEvent<unknown>) => {
    const word = claimWordOf(message.data);

    if (word !== null) {
      hear(word);
    }
  };

  return { post: (word) => channel.postMessage(word), close: () => channel.close() };
}

function tabRank(): number {
  if (document.visibilityState !== "visible") {
    return 2;
  }

  return document.hasFocus() ? 0 : 1;
}

// The console's briefings, heard for as long as the layout that calls this stands.
export function useBriefings(t: Translate): void {
  if (import.meta.server) {
    return;
  }

  const state = briefingState();
  const island = useIsland(t);
  let desk: BriefingDesk | null = null;

  const made = (): BriefingDesk =>
    (desk ??= new BriefingDesk({
      t,
      shown: { read: () => state.value, write: (next) => (state.value = next) },
      sound: elementSound,
      src: briefingSoundUrl,
      players: () => document.querySelectorAll<HTMLMediaElement>("[data-player]:not([data-briefing])"),
      channel: browserChannel,
      log: storedLog(),
      tab: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      rank: tabRank,
      now: Date.now,
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      failed: (error, fallback) => void island.fail(error, fallback)
    }));

  useBotEvents((event) => {
    const heard = briefingOfEvent(event);

    if (heard !== null) {
      void made().hear(heard);
    }
  });
  onScopeDispose(() => desk?.close());
}
