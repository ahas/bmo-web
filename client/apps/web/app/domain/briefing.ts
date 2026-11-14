import { BRIEFING_SHOWN_MS } from "#shared/config";
import { TAP_FFT, tapOf } from "bmo-ui/app/domain/sound-tap";
import { useIsland } from "bmo-ui/app/domain/island";

import { useBotEvents } from "./events";
import { followPageSound, pagePlayers, pageSoundPlaying } from "./page-sound";
import { briefingSoundUrl, playAlone } from "./player";
import { appUrl } from "./urls";

import type { Playing } from "./player";
import type { Tap } from "bmo-ui/app/domain/sound-tap";
import type { BotEvent, ExactMessageId } from "#shared/types";
import type { Translate } from "#shared/wording";
import type { Ref } from "vue";

// A voice briefing heard on the voice engine's stream and played in the console (docs/web.md, 「Messages」, the
// briefing's player): a summary that ended done and is to play by itself. It stands as a small player of its own
// while it plays, one tab of the browser plays it, and stop-listening ends it and every one waiting behind it here.
// The engine stopping a room's briefings, or every room's, silences that room's here as well.

export interface HeardBriefing {
  id: number;
  chatId: number;
  // The line it speaks, none while it awaits one.
  messageId: ExactMessageId | null;
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

// The engine's stop of a room's briefings, or of every room's where `chatId` is null, at the engine's own moment.
export interface BriefingStop {
  chatId: number | null;
  at: number;
}

/** The stop the engine told, as the player falls silent on it. */
export function briefingStopOfEvent(event: BotEvent): BriefingStop | null {
  return event.type === "voice-briefings-stopped" ? { chatId: event.stoppedRoom, at: event.at } : null;
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
  // A pause that came before the end, the reader's or another player's; the pause a sound makes as it ends is none.
  paused: () => void;
  ended: () => void;
  // The reader moved the sound to another place.
  moved: () => void;
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

// How long a briefing played to its end stays in the player before it goes (docs/web.md, 「Messages」, the briefing's
// player).
export const BRIEFING_SETTLE_MS = 1_500;

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
      if (typeof at === "number" && now - at <= BRIEFING_SHOWN_MS) {
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
  // Whether the page itself is playing a sound of its own, which a briefing that comes by itself waits behind.
  pagePlaying: () => boolean;
  channel: (hear: (word: ClaimWord) => void) => ClaimChannel | null;
  log: HeardLog;
  tab: string;
  rank: () => number;
  now: () => number;
  wait: (ms: number) => Promise<void>;
  failed: (error: unknown, fallback: string) => void;
}

// One sound the desk plays through the player: where it comes from and where a press on the player leads while it
// plays. A briefing comes to the player and starts by itself, unless the page's own sound or the browser holds it;
// the trial voice is asked for at a press.
interface Playable {
  key: string;
  // The room it is a briefing of; none for the trial voice, which no stop reaches.
  chatId: number | null;
  src: string;
  to: string;
  title: string | null;
}

// The trial voice the settings play: its key, which no briefing can have.
export const BRIEFING_TRIAL_KEY = "trial";

interface Current {
  playable: Playable;
  sound: BriefingSound;
  over: boolean;
  // Whether the reader paused it or moved it along while it played, which keeps it in the player at its end.
  touched: boolean;
  // Whether it waits for the page's own sound to stop before it starts.
  held: boolean;
}

interface Waiting {
  playable: Playable;
  // Whether it came by itself, or was asked for at a press. One asked for at a press is never held.
  byItself: boolean;
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
  private waiting: Waiting[] = [];
  private readonly pending = new Map<string, Pending>();
  // Claims another tab made before this one heard the briefing itself. The tabs hear it moments
  // apart, and a claim dropped for arriving first would leave this tab deciding on its own claim
  // alone while the other decided on both.
  private readonly early = new Map<string, Claim[]>();
  private readonly channel: ClaimChannel | null;
  // The latest stop of every room's briefings, and of each room's, by the engine's moment: a briefing that ended at
  // or before the stop covering its room never comes to the player.
  private everyRoomStoppedAt = Number.NEGATIVE_INFINITY;
  private readonly roomStoppedAt = new Map<number, number>();

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

    if (this.stopped(heard) || this.deps.log.has(key) || this.current?.playable.key === key || this.pending.has(key) || this.waiting.some((one) => one.playable.key === key)) {
      return;
    }

    // A stop that came while the tabs agreed which of them plays it reaches it too.
    if (!(await this.claim(key)) || this.deps.log.has(key) || this.stopped(heard)) {
      return;
    }

    this.deps.log.add(key, this.deps.now());
    this.channel?.post({ kind: "taken", key, tab: this.deps.tab });
    this.line(
      {
        key,
        chatId: heard.chatId,
        src: this.deps.src(heard.id),
        to: heard.messageId === null ? `/rooms/${heard.chatId}` : `/rooms/${heard.chatId}?at=${heard.messageId}`,
        title: heard.title
      },
      true
    );
  }

  // The trial voice, brought to the same player at a press (docs/web.md, 「Settings」, the voice briefing section),
  // where it plays as a briefing does: no other tab claims it or hears of it, nothing keeps it, and it stands once
  // however often it is pressed while it stands or waits.
  trial(src: string, to: string): void {
    if (this.current?.playable.key === BRIEFING_TRIAL_KEY || this.waiting.some((one) => one.playable.key === BRIEFING_TRIAL_KEY)) return;

    this.line({ key: BRIEFING_TRIAL_KEY, chatId: null, src, to, title: null }, false);
  }

  // The engine stopped a room's briefings, or every room's (docs/web.md, 「Messages」, the briefing's player): the one
  // of that room standing in the player ends, those of it waiting go, and none of it that ended at or before the stop
  // comes afterwards. What else waits plays on after the breath it would have taken anyway.
  silence(stop: BriefingStop): void {
    if (stop.chatId === null) {
      this.everyRoomStoppedAt = Math.max(this.everyRoomStoppedAt, stop.at);
    } else {
      this.roomStoppedAt.set(stop.chatId, Math.max(this.roomStoppedAt.get(stop.chatId) ?? Number.NEGATIVE_INFINITY, stop.at));
    }

    this.forgetOldStops();

    const reaches = (playable: Playable): boolean => playable.chatId !== null && (stop.chatId === null || stop.chatId === playable.chatId);

    this.waiting = this.waiting.filter((one) => !reaches(one.playable));

    if (this.current !== null && reaches(this.current.playable)) {
      this.finish(this.current.playable.key);
    }
  }

  // Whether a stop of its room or of every room came at or after it ended.
  private stopped(heard: HeardBriefing): boolean {
    return heard.endedAt <= Math.max(this.everyRoomStoppedAt, this.roomStoppedAt.get(heard.chatId) ?? Number.NEGATIVE_INFINITY);
  }

  // A room's stop older than a briefing can be and still play reaches nothing more: one that ended before it is
  // left to its line already.
  private forgetOldStops(): void {
    const now = this.deps.now();

    for (const [chatId, at] of this.roomStoppedAt) {
      if (now - at > BRIEFING_SHOWN_MS) this.roomStoppedAt.delete(chatId);
    }
  }

  // Played now, or behind the one playing and those already waiting.
  private line(playable: Playable, byItself: boolean): void {
    if (this.current !== null || this.waiting.length > 0) {
      this.waiting.push({ playable, byItself });

      return;
    }

    this.start(playable, byItself);
  }

  // The keys of the briefings waiting behind the one playing, in the order they will play.
  queued(): string[] {
    return this.waiting.map((one) => one.playable.key);
  }

  // The page's own sound has stopped — or the reader left the page and it went with them — so a briefing that
  // waited behind it plays now.
  resume(): void {
    const current = this.current;

    if (current === null || !current.held || current.over || this.deps.pagePlaying()) {
      return;
    }

    void this.play(current);
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

  private start(playable: Playable, byItself: boolean): void {
    const { key } = playable;
    // A briefing that comes by itself waits while the page plays a sound of its own (docs/web.md, 「Messages」, the
    // briefing's player); one asked for at a press does not.
    const held = byItself && this.deps.pagePlaying();
    // The handlers reach the briefing they belong to, which is made once its sound is.
    let current!: Current;
    const sound = this.deps.sound(playable.src, {
      playing: () => {
        this.move(current, "playing");
        playAlone(current.sound, this.deps.players());
      },
      paused: () => {
        current.touched = true;
        this.move(current, "paused");
      },
      ended: () => void this.settle(current),
      moved: () => {
        current.touched = true;
      },
      failed: () => this.fail(current, null)
    });

    current = { playable, sound, over: false, touched: false, held };
    this.current = current;

    this.deps.shown.write({
      key,
      to: playable.to,
      title: playable.title,
      phase: held ? "paused" : "loading",
      play: () => void this.play(current),
      pause: () => current.sound.pause(),
      stop: () => this.stop(current),
      levels: (into) => current.sound.levels(into),
      position: () => current.sound.position()
    });

    // The sound starts by itself as it comes (docs/web.md, 「Messages」, the briefing's player): a briefing is meant to
    // be heard, not waited for, unless the page's own sound stands in the way; that one is played by `resume` once it
    // stops. A browser that will not start a sound nobody pressed for moves it to `blocked`, where the player's own
    // press starts it.
    if (!held) {
      void this.play(current);
    }
  }

  // Played to its end: gone after a moment unless the reader paused or moved it along, or played it again meanwhile;
  // one the reader touched stays at its end, waiting for a press or the close mark.
  private async settle(current: Current): Promise<void> {
    this.move(current, "paused");

    if (current.touched) return;

    await this.deps.wait(BRIEFING_SETTLE_MS);

    if (current.over || current.touched || !current.sound.paused) return;

    this.finish(current.playable.key);
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

    current.held = false;

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
      this.start(upcoming.playable, upcoming.byItself);
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
  // A sound ending pauses itself on the way; only a pause before the end is one.
  element.addEventListener("pause", () => {
    if (!element.ended) on.paused();
  }, options);
  element.addEventListener("ended", () => on.ended(), options);
  element.addEventListener("seeking", () => on.moved(), options);
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

// The desk of the layout hearing the briefings, for as long as it stands, so the settings can play the trial voice
// through the same player.
let openDesk: (() => BriefingDesk) | null = null;

// The trial voice: about a minute of the chat agent's voice, shipped with the console as a file.
const TRIAL_FILE = "/briefing-trial.ogg";

/** The trial voice played through the player; a press on the player while it plays leads to `to`. */
export function playTrialBriefing(to: string): void {
  openDesk?.().trial(appUrl(TRIAL_FILE), to);
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
      players: pagePlayers,
      pagePlaying: pageSoundPlaying,
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

      return;
    }

    const stop = briefingStopOfEvent(event);

    if (stop !== null) {
      made().silence(stop);
    }
  });

  // A briefing waits behind the page's own sound; it plays when that sound stops, or when the reader leaves the
  // page and takes it along.
  const stopFollowingPageSound = followPageSound(() => desk?.resume());

  openDesk = made;
  onScopeDispose(() => {
    stopFollowingPageSound();

    if (openDesk === made) openDesk = null;

    desk?.close();
  });
}
