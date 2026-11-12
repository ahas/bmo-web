import { EVENT_FIRST_RETRY_MS, EVENT_RETRY_MS, RESTART_GRACE_MS, STREAM_KEEPALIVE_MS, STREAM_SILENCE_MS } from "#shared/config";
import { TURN_ENDED } from "#shared/types";
import { otherAnswererOf, defaultAnswererName } from "./agents";
import { askWhetherLoginEnded } from "./login-end";
import { toUnixSeconds } from "bmo-ui/app/domain/time";
import { appUrl } from "./urls";
import { agencyEvent, jobEvent, voiceEvent } from "./unit-events";

import type { BotEvent, BotEventType, ChatTurn, Judgement, LiveSnapshot, RunProgress, TurnReceived, TurnSpeaker } from "#shared/types";
import type { InjectionKey, Ref } from "vue";

export interface RunState {
  messageId: number | null;
  startedAt: number;
  // What this turn was handed. Null while the bot has said nothing of it, which is the only
  // honest answer: a count is never worked out from what else the screen happens to hold.
  received: TurnReceived | null;
  // What the turn last said of itself: which phase it is in and what its stream has counted.
  // Null until the first word of it arrives, which is where every run begins.
  progress: RunProgress | null;
  // Who is answering, as the receiver named the turn; absent where it named nobody. Whether it is the default answerer's
  // or another supervisor's is read off it as the turn is shown (`otherAnswererOf`).
  speaker?: TurnSpeaker;
  // The question the turn's draft process is on, as its start told it: absent until the first question starts, and
  // again once the process has ended.
  draft?: DraftStep;
  // Set on the state the chat agent's row holds while it only listens in a group room's open window: no turn
  // runs, so nothing was handed and nothing is in progress (docs/web.md, 「The listening row」). It
  // carries when that window closes, in unix seconds on this screen's clock, which the line counts
  // down to.
  listening?: { closesAt: number };
  // The message the turn's ending said it sent, on a turn standing through its ending: the answer its block gives
  // its place to (docs/web.md, 「The answer is the turn's own line」). Absent on a turn still going and on one that
  // ended any other way.
  answer?: number;
}

// A question of the draft process as the running line reads it, from the event that tells it starting (the
// receiver's docs/drafting.md, 「The round log」): its place in the process from 1, how many questions the process
// asks, and its name.
export interface DraftStep {
  number: number;
  count: number;
  question: string;
}

export interface RoomRun {
  // The turns going in the room, one to a speaker, in the order they began.
  runs: Readonly<Ref<RunState[]>>;
  // Why the last run left no message. A run that answered says nothing: its answer is the answer.
  outcome: Ref<RoomOutcome | null>;
}

// Why a turn ended with nothing to read: the key of the reason, and whose turn it was where it was not the default
// answerer's. Absent for the default answerer, as on the turn itself.
export interface RoomOutcome {
  key: string;
  speaker?: TurnSpeaker;
}

export interface RoomRunHandlers {
  // A judgement the bot has just recorded, before the archive page carrying it is asked for.
  onJudgement: (judgement: Judgement) => void;
  // The run ended, one way or another; whatever it produced is in the archive now. What it answers
  // with is the read that brings that in, and the block waits on it before giving its place up.
  onSettled: () => void | Promise<void>;
  // Whether the answer a turn sent stands in the room's feed. A turn that ended by sending its answer stands its
  // block until this holds, rather than only until the ending's read is in; without it, that read is the end.
  answered?: (run: RunState) => boolean;
  // The whole picture of what is running anywhere, as the bot publishes it. It belongs to no
  // room, so it is handed over before the room's own filter — and it rides this stream rather
  // than a second one, since a browser holds only a handful of them open at once.
  onLive?: (picture: LiveSnapshot) => void;
}

// How long the wait between tries may grow to. The bot is on this same machine and a try costs
// one cheap local request, so the ceiling is low: what it buys is how long a screen can sit
// behind a bot that has already come back, since until the stream is open again nothing is
// pushed and the screen is reading on its own slower clock.
const RETRY_CAP_MS = 15_000;

// How long the try after this many drops in a row waits. The first comes at once, near enough —
// a restart is over in a second or two, and a break the owner never needed to see is what a
// longer first wait shows them. Each try after it waits a step longer than the one before, up to
// the ceiling, so a bot that stays down is not asked in a flood.
export function retryDelay(attempts: number): number {
  if (attempts <= 1) {
    return EVENT_FIRST_RETRY_MS;
  }

  return Math.min(EVENT_RETRY_MS * (attempts - 1), RETRY_CAP_MS);
}

// How long a read waits before it goes. A stream that comes back hands over everything that
// happened while it was down at once, and a busy room says several things in a breath; the wait
// makes one read of a burst instead of one read for each thing in it.
const SETTLE_MS = 500;

// The ways a turn ends, which the server reading a listener's presence counts the same way.
export { TURN_ENDED };

// What the one stream says of itself. Connected is the bot being on the other end of it, which
// is a stricter thing than an open socket: false before the first stream has carried the bot's
// own word as well as after one drops. Dropped is the other fact, and it is what the screen says
// out loud — the moment before the first stream has spoken is not a loss, and nothing is said
// about it. Restarting is the break the bot announced before it went: while it lasts the screen
// says the bot is coming back rather than that it is lost, and dropped stays false.
export interface BotStream {
  connected: Readonly<Ref<boolean>>;
  dropped: Readonly<Ref<boolean>>;
  restarting: Readonly<Ref<boolean>>;
}

interface StreamState {
  connected: Ref<boolean>;
  dropped: Ref<boolean>;
  restarting: Ref<boolean>;
  // How many times the stream has opened again after a drop. The first open is the page load,
  // which has read everything it shows already; every one after it stands for a gap.
  reopens: Ref<number>;
}

// One stream for the whole tab, opened for the first screen that asks and closed when the last
// of them goes. Every screen reads the same connection: a browser holds only a handful open to
// one origin, and each of these is a second one held from this app to the bot besides.
const listeners = new Set<(event: BotEvent) => void>();
// The console's own words that carry nothing but that something moved: the deployment, and the testbed's queue.
const CONSOLE_WORDS = ["deploy", "testbed"] as const;

type ConsoleWord = (typeof CONSOLE_WORDS)[number];

// What hears each of those words, and that the stream opened.
const wordListeners = new Map<ConsoleWord, Set<() => void>>(CONSOLE_WORDS.map((word) => [word, new Set()]));

function hearWord(word: ConsoleWord): void {
  for (const listener of wordListeners.get(word) ?? []) {
    listener();
  }
}

// How many screens hold the stream, bot news and the console's words alike.
function holders(): number {
  return [...wordListeners.values()].reduce((sum, heard) => sum + heard.size, listeners.size);
}

let source: EventSource | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
let attempts = 0;
// Where the stream resumes from, and which run of the bot that number counts. The pair outlives
// a drop, so what came while the stream was down arrives once the next one opens rather than
// being lost. The bot's ids start again from the first one every time it starts, so a cursor
// held across a restart points at a place in a run that has ended: the bot names its run in the
// stream's first frame, and a name that is not the one this cursor was taken against drops the
// cursor. Without that the ids of the new run all read as already seen and every one of them is
// thrown away — a stream that is connected and carrying nothing, which no clock would cover
// because no screen would know it had gone deaf.
let lastId = 0;
let run: string | null = null;
// The same pair for bmo-job's stream, which the relay carries beside the receiver's: its numbers count its own
// run, so they are kept apart from the receiver's. The agency numbers its events by nothing and keeps no cursor.
let jobLastId = 0;
let jobRun: string | null = null;
// Whether a stream has been open at all, which is what tells a first open from a reopen.
let opened = false;
// Whether the bot said it was stopping before the stream went, and the clock after which a
// restart that has not spoken reads as a break after all.
let stopAnnounced = false;
let grace: ReturnType<typeof setTimeout> | null = null;
let state: StreamState | null = null;
// Whether anything at all has come on the stream since the silence watch last looked, and how many
// of its looks in a row found nothing. The app this page reads writes a keepalive every few
// seconds whatever the bot is doing, so a stream that stays quiet through several of them is a
// connection that died without closing — a laptop waking, a phone changing networks — which the
// browser would otherwise hold open, connected and deaf, for minutes.
let heard = false;
let quietLooks = 0;
let silence: ReturnType<typeof setInterval> | null = null;
const SILENT_LOOKS = STREAM_SILENCE_MS / STREAM_KEEPALIVE_MS;

// What every room is doing right now, kept for the tab rather than for the screen showing one
// room (docs/web.md, 「Room screen」). A room's screen is taken down the moment another room is
// opened, and the bot says a turn began once: a screen built afresh on coming back would have
// nothing to read the turn off until the bot's next picture. This record is moved by every notice
// and picture whichever room is on screen, so a room's screen opens onto its turns as they stand.
// The record itself moves from the stream's first event, whether or not any screen has asked for it
// yet; what a screen reads is a ref over it, made the first time one asks.
let turnsNow: ReadonlyMap<number, RunState[]> = new Map();
// The turns the stream said were over, which the bot's picture may still hold (`stepEndedTurns`).
let endedNow: ReadonlyMap<string, number> = new Map();
let roomTurnsHeld: Ref<ReadonlyMap<number, RunState[]>> | null = null;
// The bot's last picture of what is running, for the same reason.
let pictured: LiveSnapshot | null = null;

function roomTurns(): Ref<ReadonlyMap<number, RunState[]>> {
  roomTurnsHeld ??= shallowRef<ReadonlyMap<number, RunState[]>>(turnsNow);

  return roomTurnsHeld;
}

function setTurns(next: ReadonlyMap<number, RunState[]>): void {
  turnsNow = next;

  if (roomTurnsHeld !== null) {
    roomTurnsHeld.value = next;
  }
}

// One event to every screen, and then to the tab's own record. The record moves last so a screen
// hearing a turn end still finds the turn as it stood, which is the block it keeps standing.
function hand(event: BotEvent): void {
  for (const listener of listeners) {
    listener(event);
  }

  const next = stepRoomTurns(turnsNow, event, endedNow);

  endedNow = stepEndedTurns(endedNow, event);

  if (next !== turnsNow) {
    setTurns(next);
  }

  if (event.type === "live" && event.live !== undefined) {
    pictured = event.live;
  }
}

// The state is made on first use rather than where it stands: the module is read by the tests
// too, and there is no Vue there to make a ref with.
function streamState(): StreamState {
  state ??= { connected: ref(false), dropped: ref(false), restarting: ref(false), reopens: ref(0) };

  return state;
}

function endRestart(): void {
  stopAnnounced = false;

  if (grace !== null) {
    clearTimeout(grace);
    grace = null;
  }

  streamState().restarting.value = false;
}

// A frame's data read as the object it carries, or null where it carries none.
function fieldsOf(data: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(data);

    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function open(): void {
  const stream = streamState();

  const asked =
    `?after=${lastId}${run === null ? "" : `&run=${encodeURIComponent(run)}`}` +
    `&jobAfter=${jobLastId}${jobRun === null ? "" : `&jobRun=${encodeURIComponent(jobRun)}`}`;

  source = new EventSource(`${appUrl("/api/events")}${asked}`);
  heard = false;
  quietLooks = 0;
  silence ??= setInterval(look, STREAM_KEEPALIVE_MS);

  source.addEventListener("run", (message) => {
    heard = true;

    let named: { run?: unknown };

    try {
      named = JSON.parse((message as MessageEvent<string>).data) as { run?: unknown };
    } catch {
      return;
    }

    if (typeof named.run !== "string") {
      return;
    }

    // A run this cursor cannot be read against. Everything the new one has is new.
    if (run !== null && named.run !== run) {
      lastId = 0;
    }

    run = named.run;

    // The bot spoke, so this is a connection and not merely an open socket. The app answers a
    // request for the stream whether or not the bot is behind it — it opens, relays nothing and
    // closes — so an open on its own says only that this app is up. Counting one of those as a
    // connection would reset the backoff on every attempt and make every failed try look like a
    // stream come back, which costs every screen a full read for nothing.
    attempts = 0;
    stream.connected.value = true;
    stream.dropped.value = false;
    endRestart();

    if (opened) {
      stream.reopens.value += 1;
    }

    opened = true;
  });

  // The picture as it stands the moment this stream opened. The bot's own events say what
  // changed, and a screen that was not there for the change — one that opened in the middle of a
  // turn, or whose stream was down long enough for that change to fall out of the bot's ring —
  // has nothing to read the turn off. It carries no id and never moves the cursor: the cursor
  // counts the bot's numbered events, and this frame is not one of them. What it does carry is
  // handed to the same listeners the live event goes to, so every screen reads the picture in
  // one place rather than growing a second reader for it.
  source.addEventListener("live", (message) => {
    heard = true;

    let live: LiveSnapshot;

    try {
      live = JSON.parse((message as MessageEvent<string>).data) as LiveSnapshot;
    } catch {
      return;
    }

    hand({ id: 0, at: live.at, type: "live", chatId: 0, messageId: null, live });
  });

  source.addEventListener("bot", (message) => {
    heard = true;

    let event: BotEvent;

    try {
      event = JSON.parse((message as MessageEvent<string>).data) as BotEvent;
    } catch {
      return;
    }

    if (event.id <= lastId) {
      return;
    }

    lastId = event.id;
    hand(event);
  });

  // bmo-job's run, named first on its stream as the receiver's is. A run its cursor cannot be read against
  // drops the cursor, and everything that run has is new.
  source.addEventListener("job-run", (message) => {
    heard = true;

    const named = fieldsOf((message as MessageEvent<string>).data)?.run;

    if (typeof named !== "string") {
      return;
    }

    if (jobRun !== null && named !== jobRun) {
      jobLastId = 0;
    }

    jobRun = named;
  });

  // One of bmo-job's events, read as the console's: the TODO moving, a work order, an item's talk.
  source.addEventListener("job", (message) => {
    heard = true;

    const fields = fieldsOf((message as MessageEvent<string>).data);
    const event = fields === null ? null : jobEvent(fields);
    const id = typeof fields?.id === "number" ? fields.id : null;

    if (id === null || id <= jobLastId) {
      return;
    }

    jobLastId = id;

    if (event !== null) {
      hand(event);
    }
  });

  // One of the voice engine's briefings taken in, ended, or naming its line, which no cursor counts.
  source.addEventListener("voice", (message) => {
    heard = true;

    const fields = fieldsOf((message as MessageEvent<string>).data);
    const event = fields === null ? null : voiceEvent(fields);

    if (event !== null) {
      hand(event);
    }
  });

  // One of the agency's turns going out or ending, which no cursor counts.
  source.addEventListener("agency", (message) => {
    heard = true;

    const fields = fieldsOf((message as MessageEvent<string>).data);
    const event = fields === null ? null : agencyEvent(fields);

    if (event !== null) {
      hand(event);
    }
  });

  // The stream has opened. What the deployment did and how the testbed's queue moved while it was closed was
  // never said on it, and the stream that opens after bmo-web's own restart is the first to hear of either
  // (docs/web.md, 「Deployment in the title bar」 and the TODO panel's section).
  source.addEventListener("open", () => {
    for (const word of CONSOLE_WORDS) {
      hearWord(word);
    }
  });

  // The console's word that the account read a room, in this tab or another. It is this app's own, so no cursor
  // counts it.
  source.addEventListener("room-read", (message) => {
    heard = true;

    const chatId = fieldsOf((message as MessageEvent<string>).data)?.chatId;

    if (typeof chatId === "number") {
      hand({ id: 0, at: Math.floor(Date.now() / 1000), type: "room-read", chatId, messageId: null });
    }
  });

  // The console's word that a document's talk moved: the owner's words written, or the chat agent's turn ended.
  // It is this app's own, so no cursor counts it.
  source.addEventListener("document-talk", (message) => {
    heard = true;

    const document = fieldsOf((message as MessageEvent<string>).data)?.document;

    if (typeof document === "string") {
      hand({ id: 0, at: Math.floor(Date.now() / 1000), type: "document-talk", chatId: 0, messageId: null, document });
    }
  });

  // The console's word that a document's translation moved, the translator's own handed on. It is this app's own,
  // so no cursor counts it.
  source.addEventListener("document-translation", (message) => {
    heard = true;

    const document = fieldsOf((message as MessageEvent<string>).data)?.document;

    if (typeof document === "string") {
      hand({ id: 0, at: Math.floor(Date.now() / 1000), type: "document-translation", chatId: 0, messageId: null, document });
    }
  });

  // The console's words that the deployment moved and that the testbed's queue changed. They carry nothing; a
  // listener reads again.
  for (const word of CONSOLE_WORDS) {
    source.addEventListener(word, () => {
      heard = true;
      hearWord(word);
    });
  }


  // The bot is stopping on purpose and the stream is about to end. Nothing changes on the screen
  // yet: what this decides is how the end reads when it comes.
  source.addEventListener("stopping", () => {
    heard = true;
    stopAnnounced = true;
  });

  // The app's own word that the stream is still there. It carries nothing else.
  source.addEventListener("keep", () => {
    heard = true;
  });

  // The browser reopens on its own with the address it was given, which no longer says where
  // to resume from, so the stream is closed here and opened again with a new one.
  source.addEventListener("error", lost);
}

// One look of the silence watch. Between a drop and the next try nothing is expected, so only an
// open stream is looked at; one quiet through too many looks in a row is lost the way a stream
// the browser reported broken is, and says so on the console, since nothing else would.
function look(): void {
  if (source === null) {
    return;
  }

  if (heard) {
    heard = false;
    quietLooks = 0;

    return;
  }

  quietLooks += 1;

  if (quietLooks >= SILENT_LOOKS) {
    console.warn(`bot stream: nothing heard for ${STREAM_SILENCE_MS / 1000}s, so it is taken for lost and opened again`);
    lost();
  }
}

// The stream is gone, whether the browser said so or it went quiet. It is let go of and a new one
// is tried after the wait this many drops in a row has earned. A browser says nothing of why a
// stream broke, so the tab asks whether its login still stands: a stream refused for the login takes
// the tab to the login screen, which closes it, rather than being tried again on the clock.
function lost(): void {
  const stream = streamState();

  void askWhetherLoginEnded();

  heard = false;
  quietLooks = 0;
  stream.connected.value = false;

  if (stopAnnounced) {
    // A restart the bot announced: the screen says so, and says it only for as long as a
    // restart can take. The clock is started once, by the first break after the word, so the
    // tries that fail while the bot is still down do not keep pushing it back.
    stream.restarting.value = true;
    stream.dropped.value = false;
    grace ??= setTimeout(() => {
      grace = null;
      stopAnnounced = false;
      stream.restarting.value = false;
      stream.dropped.value = true;
    }, RESTART_GRACE_MS);
  } else {
    // A stream that never spoke has lost nothing, so a failed first open is said nowhere.
    stream.dropped.value = opened;
  }

  source?.close();
  source = null;
  attempts += 1;
  retry = setTimeout(open, retryDelay(attempts));
}

// Nobody is left to hear it. The next screen to ask opens a stream of its own, and that one is
// a first open rather than a reopen: it brings nothing back to anybody who was listening.
function close(): void {
  const stream = streamState();

  source?.close();
  source = null;

  if (silence !== null) {
    clearInterval(silence);
    silence = null;
  }

  if (retry !== null) {
    clearTimeout(retry);
    retry = null;
  }

  attempts = 0;
  opened = false;
  endRestart();
  stream.connected.value = false;
  stream.dropped.value = false;

  // Nothing moves the record while no stream is open, so it is let go of, the endings it kept with it; the next
  // stream opens with the bot's picture, which stands it again.
  setTurns(new Map());
  endedNow = new Map();
  pictured = null;
}

// The bot's live stream. It carries the session cookie on its own, and it reopens itself
// after a drop, asking only for what came after the last event it saw. Whether the bot is
// there at all is the health route's answer, not this one's: a stream that opened proves
// only that this app answered.
export function useBotEvents(onEvent: (event: BotEvent) => void): BotStream {
  if (import.meta.server) {
    // Nothing is held open while the page is drawn on the server, and a stream that has never
    // opened is neither connected nor lost.
    return { connected: ref(false), dropped: ref(false), restarting: ref(false) };
  }

  const stream = streamState();

  onMounted(() => {
    listeners.add(onEvent);

    if (holders() === 1) {
      open();
    }
  });

  onScopeDispose(() => {
    listeners.delete(onEvent);

    if (holders() === 0) {
      close();
    }
  });

  return { connected: readonly(stream.connected), dropped: readonly(stream.dropped), restarting: readonly(stream.restarting) };
}

// Why a screen would read again: the bot said something, the stream came back after a drop, or
// the screen's own clock came round.
export type RefreshCause = "event" | "reopen" | "clock";

export interface RefreshQuestion {
  cause: RefreshCause;
  // What arrived, on an event's own turn; null for the other two causes.
  type: BotEventType | null;
  // The news this screen reads back on.
  on: readonly BotEventType[];
  connected: boolean;
  busy: boolean;
}

// Whether that cause makes this screen read. The news is read as it arrives; a stream that has
// come back reads everything back once, since nothing that moved while it was down was ever
// announced; and the clock is what the screen falls back to for exactly as long as the stream
// is down. A screen that is busy — a row in the air, an order on its way, a change of its own
// not yet answered — reads on none of them, because what the hand is holding is not written over.
export function shouldRefresh(question: RefreshQuestion): boolean {
  if (question.busy) {
    return false;
  }

  if (question.cause === "event") {
    return question.type !== null && question.on.includes(question.type);
  }

  return question.cause === "reopen" || !question.connected;
}

export interface LiveRefreshOptions {
  // The bot's news this screen reads back on.
  on: readonly BotEventType[];
  // Which of those events are this screen's at all. A screen that stands for one room takes
  // only that room's news.
  where?: (event: BotEvent) => boolean;
  // Screens whose source has no complete event feed can name a fallback interval. Omitting it
  // leaves the screen on the stream alone, with one catch-up read whenever the stream reopens.
  everyMs?: number;
  // Whether the screen is holding something a read must not walk over.
  busy?: () => boolean;
}

// A screen that keeps up with the bot. What it shows is read again when the bot says the thing
// it shows has moved, once more whenever the stream comes back from a drop, and, where one was
// explicitly requested, on its own clock while the stream is down.
export function useLiveRefresh(run: (cause: RefreshCause, event: BotEvent | null) => void, options: LiveRefreshOptions): void {
  if (import.meta.server) {
    return;
  }

  const stream = streamState();
  const busy = computed<boolean>(() => options.busy?.() ?? false);

  let waiting: ReturnType<typeof setTimeout> | null = null;
  // A read the screen was too busy for. It is not dropped — nothing else would ask for it — so
  // it is taken up the moment the hand lets go.
  let owed = false;
  // Why the read is owed, and what arrived to owe it. A screen that can read one thing rather
  // than everything needs both: the cause says whether the news was complete, and the news says
  // what to read. Several things in one wait leave the last of them here, which is the right one
  // to keep — a screen catching up on that one reaches everything before it on the way.
  let why: RefreshCause = "clock";
  let what: BotEvent | null = null;

  function schedule(cause: RefreshCause, event: BotEvent | null): void {
    owed = false;
    why = cause;
    what = event;

    if (waiting !== null) {
      return;
    }

    waiting = setTimeout(() => {
      waiting = null;

      if (busy.value) {
        owed = true;

        return;
      }

      run(why, what);
    }, SETTLE_MS);
  }

  function ask(cause: RefreshCause, type: BotEventType | null, event: BotEvent | null = null): void {
    const question: RefreshQuestion = {
      cause,
      type,
      on: options.on,
      connected: stream.connected.value,
      busy: busy.value
    };

    if (shouldRefresh(question)) {
      schedule(cause, event);

      return;
    }

    if (busy.value && shouldRefresh({ ...question, busy: false })) {
      owed = true;
    }
  }

  useBotEvents((event) => {
    if (options.where !== undefined && !options.where(event)) {
      return;
    }

    ask("event", event.type, event);
  });

  watch(stream.reopens, () => ask("reopen", null));

  watch(busy, (held) => {
    if (!held && owed) {
      schedule(why, what);
    }
  });

  const clock = options.everyMs === undefined
    ? null
    : setInterval(() => ask("clock", null), options.everyMs);

  onScopeDispose(() => {
    if (clock !== null) {
      clearInterval(clock);
    }

    if (waiting !== null) {
      clearTimeout(waiting);
    }
  });
}

export interface ReadFailureOptions {
  // Whether the screen's last read failed.
  failed: () => boolean;
  // Whether a read of the screen's is on its way now.
  reading: () => boolean;
  // Reads what the screen shows again.
  reread: () => void;
}

export interface ReadFailure {
  // A failure the screen says, with its reason: one met while the bot was not restarting, or one
  // the first read after the bot came back met again.
  shown: Readonly<Ref<boolean>>;
  // A failure met while the bot restarts. The screen keeps what it last read and says only that
  // it is reconnecting, until the read the bot's return brings has settled.
  reconnecting: Readonly<Ref<boolean>>;
  // Whether a screen this one stands inside already says it is reconnecting, so the line is said
  // once for the whole screen rather than once for every part of it that reads.
  saidAround: Readonly<Ref<boolean>>;
}

const READ_FAILURE: InjectionKey<ReadFailure> = Symbol("read-failure");

// How a screen's read failure reads. A deployment takes the bot and this app down for seconds, and
// a read that lands in them failed only because the restart the bot announced is going on: that
// is not news, and the read after the stream comes back answers it without a press.
export function useReadFailure(options: ReadFailureOptions): ReadFailure {
  const stream = useBotEvents(() => undefined);
  const around = inject(READ_FAILURE, null);
  const failed = computed<boolean>(() => options.failed());
  // The read the bot's return brought, not yet settled.
  const awaiting = ref(false);

  watch(stream.restarting, (restarting, before) => {
    // A restart ends on the new run naming itself, or on its wait running out with nobody back,
    // which is a break after all and says the failure as it stands.
    if (restarting || !before || !stream.connected.value || !failed.value) {
      return;
    }

    awaiting.value = true;

    if (!options.reading()) {
      options.reread();
    }

    // A screen that started no read has nothing to wait for.
    void nextTick(() => {
      if (!options.reading()) {
        awaiting.value = false;
      }
    });
  });

  watch(() => options.reading(), (reading, before) => {
    if (before && !reading) {
      awaiting.value = false;
    }
  });

  const reconnecting = computed<boolean>(() => failed.value && (stream.restarting.value || awaiting.value));
  const shown = computed<boolean>(() => failed.value && !reconnecting.value);
  const saidAround = computed<boolean>(() => around !== null && (around.saidAround.value || around.reconnecting.value));
  const failure: ReadFailure = { shown, reconnecting, saidAround };

  provide(READ_FAILURE, failure);

  return failure;
}

// Each ending's key into the language pack; the room puts the words on the screen. A skip that
// read a message of the room is kept in the conversation as a line under that message and is not
// said here as well; only a skip that read nothing of the room, and so names no message, passes
// through here.
export const SKIPPED_OUTCOME = "room.status.outcome_skipped";
const SILENT_OUTCOMES: Record<string, string> = {
  skipped: SKIPPED_OUTCOME,
  "run-failed": "room.status.outcome_run_failed",
  "run-stopped": "room.status.outcome_run_stopped",
  // The commonest silent ending of the lot: the turn read what was said and judged that the
  // person is still typing, so it said nothing and left the room to finish.
  waited: "room.status.outcome_waited"
};
// How a draft process that ended other than by sending or skipping is said once its turn has ended: a text the
// checks withheld, and a ceiling that passed, whether what stood went out or nothing did. A plain skip is said as any
// turn that held its peace.
const DRAFT_OUTCOMES: Record<string, string> = {
  withheld: "room.status.outcome_draft_withheld",
  "ceiling-skip": "room.status.outcome_draft_ceiling_skip",
  "ceiling-message": "room.status.outcome_draft_ceiling_message"
};
export { otherAnswererOf };

// Which turn of a room a run is: its speaker's name, which every event of the turn carries. A room two agents answer
// holds a turn of each at once, and each begins, moves and ends by this key alone; whose the name is plays no part.
export function runKey(speaker: TurnSpeaker | null | undefined): string {
  return speaker === undefined || speaker === null ? "" : `speaker:${speaker.name}`;
}

// The turns this room's picture holds right now, one to a speaker. A round that hands over to the
// next one registers that one before it lets go of its own, so for a moment two stand for the
// same speaker; the newer is the one that is still going.
// Where a turn stands by the picture: waiting where the picture names the Job it waits on, and what
// the events last said otherwise — save a wait the picture no longer holds, which is over.
export function pictureProgress(turn: Pick<ChatTurn, "waiting">, progress: RunProgress | null): RunProgress | null {
  if (turn.waiting !== undefined && turn.waiting !== null) {
    return { ...emptyRunProgress, phase: "waiting", waitingFor: turn.waiting };
  }

  return progress?.phase === "waiting" ? null : progress;
}

// A progress with nothing in it yet, which a picture-only state fills in.
const emptyRunProgress: RunProgress = {
  phase: "thinking",
  tool: null,
  thinkingTokens: null,
  contextTokens: null,
  cacheReadTokens: null,
  requestId: null,
  spent: null,
  writtenTokens: null,
  actions: [],
  droppedActions: 0,
  droppedContext: 0,
  said: []
};

// A room's turns with one speaker's put in where it stood, or after the others where it is new.
function putTurn(runs: readonly RunState[], state: RunState): RunState[] {
  const key = runKey(state.speaker);

  return runs.some((run) => runKey(run.speaker) === key)
    ? runs.map((run) => (runKey(run.speaker) === key ? state : run))
    : [...runs, state];
}

function withRoom(rooms: ReadonlyMap<number, RunState[]>, chatId: number, runs: RunState[]): ReadonlyMap<number, RunState[]> {
  const next = new Map(rooms);

  if (runs.length === 0) {
    next.delete(chatId);
  } else {
    next.set(chatId, runs);
  }

  return next;
}

// The bot's picture standing the whole record: a turn it holds stands from where the turn itself
// began, keeping what the events last said of it, and a turn it has let go of is over. The message a
// turn reads last is the picture's where it names one, since a message pushed into the round moves
// it on with no event of its own, and the turn's start is not the only screen that needs it.
function picturedTurns(rooms: ReadonlyMap<number, RunState[]>, turns: ChatTurn[], ended: ReadonlyMap<string, number>): ReadonlyMap<number, RunState[]> {
  const next = new Map<number, RunState[]>();

  for (const turn of turns) {
    const over = ended.get(endedKey(turn.chatId, turn.speaker));

    // A turn its speaker's ending in this room already closed, which the picture holds until its round lets go.
    if (over !== undefined && turn.since <= over) continue;

    const key = runKey(turn.speaker);
    const was = rooms.get(turn.chatId)?.find((run) => runKey(run.speaker) === key);
    const received: TurnReceived = { messages: turn.messages, instructions: turn.instructions };
    // A turn the picture says waits for its engine reads as waiting, and stops reading so once it
    // says it does not, so a screen opened mid-wait shows the wait as one that watched it begin.
    const progress = pictureProgress(turn, was?.progress ?? null);
    const messageId = turn.messageId === undefined ? was?.messageId ?? null : turn.messageId;
    const speaker = turn.speaker ?? undefined;
    const state: RunState = was === undefined
      ? { messageId, startedAt: turn.since, received, progress, ...(speaker === undefined ? {} : { speaker }) }
      : { ...was, messageId, received, progress };

    next.set(turn.chatId, putTurn(next.get(turn.chatId) ?? [], state));
  }

  return next;
}

// The tab's record of every room's turns after one event. A turn is in flight from the moment the
// session is handed something to read until the bot says it sent, skipped, waited or failed, and
// it is read from two places that say the same thing: the events that begin and end it, and the
// bot's own picture, which is what a tab has when it was not there for the beginning. A room two supervisors
// answer can have a turn of each going at once, one to a speaker. An event
// that moves nothing hands the same record back.
export function stepRoomTurns(rooms: ReadonlyMap<number, RunState[]>, event: BotEvent, ended: ReadonlyMap<string, number> = new Map()): ReadonlyMap<number, RunState[]> {
  if (event.type === "live") {
    // A bot that says nothing about its turns leaves the record to the events alone.
    const turns = event.live?.turns;

    return turns === undefined ? rooms : picturedTurns(rooms, turns, ended);
  }

  const held = rooms.get(event.chatId) ?? [];
  const key = runKey(event.speaker);
  const was = held.find((run) => runKey(run.speaker) === key);

  if (event.type === "run-started") {
    const speaker = event.speaker ?? undefined;

    return withRoom(rooms, event.chatId, putTurn(held, {
      messageId: event.messageId,
      startedAt: toUnixSeconds(event.at),
      received: event.received ?? was?.received ?? null,
      progress: null,
      ...(speaker === undefined ? {} : { speaker })
    }));
  }

  // What the turn is doing right now. It replaces the last picture rather than adding to it: it is
  // only where the turn stands at this second.
  if (event.type === "run-progress") {
    if (was === undefined || event.progress === undefined) return rooms;

    // The lines the round wrote as it worked stand until a picture brings lines of its own: a later question of
    // the draft process opens a fresh picture, which has written none yet (docs/web.md, the room screen's progress
    // lines).
    const said = (event.progress.said ?? []).length > 0 ? event.progress.said : was.progress?.said;

    return withRoom(rooms, event.chatId, putTurn(held, { ...was, progress: said === undefined ? event.progress : { ...event.progress, said } }));
  }

  // A question of the draft process starting: the chat agent's turn is now on it. The process's end leaves the line as
  // any turn's again until the turn itself ends. The rows written as questions are answered move nothing, so a
  // round that waits after its first question's start stands on it with no row to come. A draft event reaches the
  // turn of the speaker it names.
  if (event.type === "draft") {
    if (was === undefined) return rooms;

    if (event.kind === "end") {
      const { draft: _ended, ...rest } = was;

      return was.draft === undefined ? rooms : withRoom(rooms, event.chatId, putTurn(held, rest));
    }

    if (event.kind !== "start" || typeof event.number !== "number" || typeof event.count !== "number") return rooms;

    const step: DraftStep = { number: event.number, count: event.count, question: event.question ?? "" };

    return withRoom(rooms, event.chatId, putTurn(held, { ...was, draft: step }));
  }

  // A turn ends four ways and nothing else closes one. The room's own archive and the queue move
  // while a run is still going, and neither of them is news about the run.
  if (TURN_ENDED.includes(event.type) && was !== undefined) {
    return withRoom(rooms, event.chatId, held.filter((run) => runKey(run.speaker) !== key));
  }

  return rooms;
}

// One speaker's turns in one room, as the marks of turns already over are kept.
function endedKey(chatId: number, speaker: TurnSpeaker | null | undefined): string {
  return `${chatId} ${runKey(speaker)}`;
}

// The turns the stream said were over, by room and speaker, each with the moment it said so, after one event
// (docs/web.md, 「A turn the bot said is over stays over」). The bot keeps a round in its picture until the round lets
// go of the room, which is after its answer went out — the voice briefing's summary of a notice asked of the same
// session, a fold, the round's own bookkeeping — so a picture taken in between still holds the turn the events
// closed, and the record would take it back and stand its block again under the answer. A turn of the picture that
// began no later than the mark is that turn. The speaker's next start lets the mark go, and so does a picture holding
// no turn of that speaker in that room, the round having let go. An event that moves nothing hands the same marks
// back.
export function stepEndedTurns(ended: ReadonlyMap<string, number>, event: BotEvent): ReadonlyMap<string, number> {
  if (event.type === "live") {
    const turns = event.live?.turns;

    if (turns === undefined || ended.size === 0) return ended;

    const held = new Set(turns.map((turn) => endedKey(turn.chatId, turn.speaker)));
    const kept = new Map([...ended].filter(([key]) => held.has(key)));

    return kept.size === ended.size ? ended : kept;
  }

  const key = endedKey(event.chatId, event.speaker);

  if (event.type === "run-started") {
    if (!ended.has(key)) return ended;

    const next = new Map(ended);

    next.delete(key);

    return next;
  }

  return TURN_ENDED.includes(event.type) ? new Map(ended).set(key, toUnixSeconds(event.at)) : ended;
}

// How long the reason for a silent run stays on the screen.
const OUTCOME_LIFETIME_MS = 20_000;
// How long a turn that sent its answer stands its block past the ending's read while the answer is not yet in the
// room's feed. The bot files the answer before it says the turn sent it, so that read brings it in the ordinary run
// of things; this is only how long a read that failed, or an answer filed out of sight, holds the block.
export const ANSWER_WAIT_MS = 15_000;

// What one room is doing right now, read off the tab's record of every room's turns, so a screen
// opened onto a room — coming back from another, as much as arriving mid-turn — stands the turns
// already going there. A room two supervisors answer can have a turn of each going at once, and each stands as
// its own block.
export function useRoomRun(chatId: number, handlers: RoomRunHandlers): RoomRun {
  const record = roomTurns();
  const outcome = ref<RoomOutcome | null>(null);

  let fading: ReturnType<typeof setTimeout> | null = null;
  // How the chat agent's draft process ended, where it is said when its turn ends.
  let drafted: string | null = null;

  // A turn that has ended and whose answer the room is still reading. The block stands through it:
  // taking it away at the ending would leave the conversation short by the block's own height
  // until the read came back, so the feed would shrink and grow again and a reader at the bottom
  // would be jerked twice for one answer. The count is what tells one ending from the next — a run
  // that starts while an earlier one is still being read owns the block from that moment, and the
  // earlier read no longer has anything to clear. Both are kept per speaker.
  const endings = new Map<string, number>();
  const settling = ref<RunState[]>([]);
  // The speakers whose turn sent its answer and whose block stands until that answer is in the room's feed, each
  // with the clock that lets it go should the answer never come.
  const awaiting = shallowRef<ReadonlyMap<string, ReturnType<typeof setTimeout> | null>>(new Map());

  // The turns going here, after the blocks still standing through their ending. A speaker whose
  // next turn has begun stands as that turn.
  const runs = computed<RunState[]>(() => {
    const going = record.value.get(chatId) ?? [];
    const speaking = new Set(going.map((run) => runKey(run.speaker)));

    return [...settling.value.filter((run) => !speaking.has(runKey(run.speaker))), ...going];
  });

  function unsettle(key: string): void {
    settling.value = settling.value.filter((run) => runKey(run.speaker) !== key);
    stopAwaiting(key);
  }

  function stopAwaiting(key: string): void {
    if (!awaiting.value.has(key)) return;

    const clock = awaiting.value.get(key);

    if (clock !== null && clock !== undefined) clearTimeout(clock);

    const next = new Map(awaiting.value);

    next.delete(key);
    awaiting.value = next;
  }

  function holdFor(key: string, clock: ReturnType<typeof setTimeout> | null): void {
    const before = awaiting.value.get(key);

    if (before !== null && before !== undefined) clearTimeout(before);

    awaiting.value = new Map(awaiting.value).set(key, clock);
  }

  // A block waiting on its answer gives its place up once the answer is in the feed, in the update after the one
  // the answer arrived in: the answer has then already taken the block's place, so what stands after the block —
  // the listening row — comes once the answer stands, never in the same update as it.
  if (handlers.answered !== undefined) {
    const answered = handlers.answered;

    watch(
      () => settling.value.filter((run) => awaiting.value.has(runKey(run.speaker)) && answered(run)).map((run) => runKey(run.speaker)),
      (keys) => keys.forEach(unsettle),
      { flush: "post" }
    );
  }

  // What else is running anywhere, as the bot last pictured it, for a screen that was not standing
  // when the picture came.
  if (pictured !== null) {
    handlers.onLive?.(pictured);
  }

  function announce(event: BotEvent): void {
    const kept = event.type === "skipped" && event.messageId !== null;
    const speaker = otherAnswererOf(event.speaker);
    const label = (speaker === undefined ? drafted : null) ?? (kept ? undefined : SILENT_OUTCOMES[event.type]);

    if (speaker === undefined) drafted = null;

    outcome.value = label === undefined ? null : { key: label, ...(speaker === undefined ? {} : { speaker }) };

    if (fading !== null) {
      clearTimeout(fading);
      fading = null;
    }

    if (label !== undefined) {
      fading = setTimeout(() => {
        outcome.value = null;
      }, OUTCOME_LIFETIME_MS);
    }
  }

  useBotEvents((event) => {
    if (event.type === "live") {
      if (event.live !== undefined) {
        handlers.onLive?.(event.live);
      }

      return;
    }

    if (event.chatId !== chatId) {
      return;
    }

    const key = runKey(event.speaker);

    if (event.type === "draft") {
      if (event.kind === "end") drafted = DRAFT_OUTCOMES[event.outcome ?? ""] ?? null;

      return;
    }

    if (event.type === "run-started") {
      endings.set(key, (endings.get(key) ?? 0) + 1);
      unsettle(key);
      outcome.value = null;

      if (otherAnswererOf(event.speaker) === undefined) drafted = null;

      return;
    }

    if (event.type === "judgement") {
      if (event.messageId !== null && event.stage !== undefined && event.verdict !== undefined) {
        handlers.onJudgement({
          // The live row stands in for the archived one until the page carrying it arrives,
          // and its id is the event's so it can never be taken for a row of the archive.
          id: -event.id,
          chatId: event.chatId,
          messageId: event.messageId,
          stage: event.stage,
          verdict: event.verdict,
          detail: event.detail ?? null,
          createdAt: toUnixSeconds(event.at),
          ...(event.lines === undefined || event.lines.length === 0 ? {} : { lines: event.lines })
        });
      }

      return;
    }

    if (!TURN_ENDED.includes(event.type)) {
      return;
    }

    const ending = (endings.get(key) ?? 0) + 1;
    // The record has not yet heard this ending, so it still holds the turn as it stood. A turn that sent stands
    // naming the message it sent, which is the answer its block waits on.
    const held = record.value.get(chatId)?.find((run) => runKey(run.speaker) === key);
    const last = held !== undefined && event.type === "sent" && event.messageId !== null ? { ...held, answer: event.messageId } : held;

    endings.set(key, ending);

    if (last !== undefined) {
      settling.value = [...settling.value.filter((run) => runKey(run.speaker) !== key), last];
    }

    // A turn that sent its answer stands its block until that answer is in the feed, by whichever read brings it.
    const answers = event.type === "sent" && last !== undefined && handlers.answered !== undefined;

    if (answers) {
      holdFor(key, null);
    } else {
      stopAwaiting(key);
    }

    announce(event);

    // A read that failed is still a read that is over: the block has waited as long as there was
    // anything to wait for, and standing on because the archive would not answer would leave a
    // turn that ended hours ago saying it was still going. A turn that sent waits a little longer for its
    // answer, and no longer than that.
    void Promise.resolve(handlers.onSettled()).catch(() => undefined).finally(() => {
      if (endings.get(key) !== ending || !settling.value.some((run) => runKey(run.speaker) === key)) {
        return;
      }

      if (answers && last !== undefined && awaiting.value.has(key) && handlers.answered?.(last) !== true) {
        holdFor(key, setTimeout(() => {
          if (endings.get(key) === ending) unsettle(key);
        }, ANSWER_WAIT_MS));

        return;
      }

      unsettle(key);
    });
  });

  onScopeDispose(() => {
    if (fading !== null) {
      clearTimeout(fading);
    }

    for (const clock of awaiting.value.values()) {
      if (clock !== null) clearTimeout(clock);
    }
  });

  return { runs, outcome };
}

// A turn of the chat agent's going right now, in whichever room, with what its stream last said.
export interface ChatTurnProgress {
  chatId: number;
  progress: RunProgress | null;
}

// The bot's picture of what is running: the one the tab already holds, at once, and each one after
// it as it comes, so a screen opened while the stream was already open has it before the bot next
// moves.
export function useLivePicture(onPicture: (picture: LiveSnapshot) => void): void {
  if (pictured !== null) {
    onPicture(pictured);
  }

  useBotEvents((event) => {
    if (event.type === "live" && event.live !== undefined) {
      onPicture(event.live);
    }
  });
}

// The default answerer's own turn in each room that has one, out of the tab's record of every room's turns. Another
// supervisor's turn is not the default answerer's, so it is passed over here. The stream is held
// for as long as the screen asking stands, since nothing moves the record while no stream is open.
export function useBmoTurns(): Readonly<Ref<ReadonlyMap<number, RunState>>> {
  const record = roomTurns();

  useBotEvents(() => undefined);

  return computed(() => {
    const own = new Map<number, RunState>();

    for (const [chatId, runs] of record.value) {
      const run = runs.find((held) => otherAnswererOf(held.speaker) === undefined);

      if (run !== undefined) {
        own.set(chatId, run);
      }
    }

    return own;
  });
}

// Every turn of the chat agent's that is going, in the order the rooms began answering.
export function useChatTurns(): Readonly<Ref<ChatTurnProgress[]>> {
  const own = useBmoTurns();

  return computed(() => [...own.value].map(([chatId, run]) => ({ chatId, progress: run.progress })));
}

// The supervisors whose turn runs now in any room: each turn's speaker by its name, and a turn naming none under the
// default answerer's.
export function useSupervisorsAnswering(): Readonly<Ref<ReadonlySet<string>>> {
  const record = roomTurns();

  useBotEvents(() => undefined);

  return computed(() => new Set([...record.value.values()].flatMap((runs) => runs.map((run) => otherAnswererOf(run.speaker)?.name ?? defaultAnswererName()))));
}


// One of the console's words on the tab's one stream: called on that word and each time the stream opens or
// opens again.
function useConsoleWord(word: ConsoleWord, onChange: () => void): void {
  if (import.meta.server) {
    return;
  }

  const hearing = wordListeners.get(word)!;

  onMounted(() => {
    hearing.add(onChange);

    if (holders() === 1) {
      open();
    }
  });

  onScopeDispose(() => {
    hearing.delete(onChange);

    if (holders() === 0) {
      close();
    }
  });
}

// The console's word that the deployment moved (docs/web.md, 「Deployment in the title bar」).
export function useDeployEvents(onChange: () => void): void {
  useConsoleWord("deploy", onChange);
}

// The console's word that the testbed's queue changed (docs/web.md, the TODO panel's section).
export function useTestbedEvents(onChange: () => void): void {
  useConsoleWord("testbed", onChange);
}

