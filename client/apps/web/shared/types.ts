// The shapes the console's server and its screens share. A shape another unit answers with is written here
// as that unit's document states it, since the console reads every unit over HTTP and imports none of their
// code (docs/boundary.md, 「Calls the console makes」). Each screen's group adds the shapes it reads.

import type { FallbackRouteMode, PushKind } from "./config";
import type { DeployEnding, DeployStage, DeployStep, DeployStepAhead, DeployStepUnderWay } from "./deploy-progress";

// bmo-job's shapes (bmo-job's `docs/api.md`).

/** What the deployment's hold says of itself, for every screen and every fact that shows it. */
// A machine's hardware as the monitor screen reads it, stated once in the module that holds it.
export type {
  BoardView, ChipView, ClusterView, CoreView, CpuView, DieView, FanView, GpuView, HardwareCpuLimitChanged, HardwareTrackingChanged,
  HardwareView, HistoryBand, HistoryRange, HistorySpan, LiveRange, MachineHardware, MemoryView, MonitorNode, PartView, SensorView,
  ServicesView, StorageKind, StorageView, VolumeView
} from "./hardware";

export interface DeployHold {
  /** When the hold was taken, in seconds. */
  since: number;
  /** When the deployment gives up waiting and lets it go, in seconds. */
  until: number;
  /** The commits that wait to go live, with their items. */
  commits: { commit: string; todoId: number | null }[];
  /**
   * What those commits take away that a process loaded before them may still name; null where it could
   * not be read.
   */
  breaks: string[] | null;
  /** The jobs at work it waits for, one line each with why, as of its last look; null where they could not be read. */
  waitingOn: string[] | null;
  /** The items of the jobs it waits for, as of its last look; null where they could not be read. */
  waitingFor: number[] | null;
  /** The jobs at work it does not wait for, one line each with why, as of its last look. */
  passing: string[];
}

/** What a job waits on: a unit by its name, or a process by its id. */
export type WaitTarget = { kind: "unit"; name: string } | { kind: "pid"; pid: number };

/** A stopped work order's place in its worker's queue. */
export interface WorkQueuePlace {
  // Its turn to be resumed, a turn it is passing to what stands behind it, or set aside.
  turn: "resume" | "passed" | "held";
  // Why it has not been resumed yet, in the judgement's own words.
  why: string;
}

/** A stopped work order's stand. */
export interface WorkOrderStop {
  // The first line of what the order stopped for.
  reason: string | null;
  // Null where the order is not first in its worker's queue, or still holds its checkout.
  place: WorkQueuePlace | null;
  failures: number;
}

/** What a task ran on, and whether that changed from what it was planned on. */
export interface RanOn {
  provider: string;
  model: string;
  changed: boolean;
}

// The agency's shapes (the agency's `docs/api.md`).

/** The providers an agent runs on, one name to each provider the agency carries. */
export const agentProviderNames = ["claude-code", "codex", "openrouter", "registered", "deepseek"] as const;

export type AgentProviderName = (typeof agentProviderNames)[number];

/** What a turn's record says it wrote: a note, a memory, a rule, a TODO row or a watch. */
export type TurnRecordKind = "note" | "memory" | "rule" | "todo-add" | "todo-append" | "watch";

export interface TurnRecord {
  kind: TurnRecordKind;
  // What was written, as the call handed it over. Empty where the call carried it some way the reading
  // does not follow.
  text: string;
  // The note, the memory or the TODO row the record landed in, where the call's own answer named it.
  id: number | null;
  // Whether the call set something that wakes the agent: a watch, or a memory written with an event or with
  // a check of its own.
  wakes: boolean;
}

// The shapes of units not yet split, which no screen of this console reads while they are not.

/** The emotion a voice briefing is spoken with, as the voice unit names it. */
export type BriefingEmotion = string;
/** A machine's standing and every node's reading, as the node unit gives them. */
/** The share of a stretch some or all tasks stood stalled, in percent, over 10, 60 and 300 seconds. */
export interface PressureLine {
  avg10: number;
  avg60: number;
  avg300: number;
}

export interface Pressure {
  some: PressureLine;
  // Null for a resource the kernel keeps no `full` line for.
  full: PressureLine | null;
}

export interface MachineReading {
  /** When it was read, in milliseconds. */
  at: number;
  load1: number;
  threads: number;
  memTotalGb: number;
  memAvailableGb: number;
  swapTotalGb: number;
  swapFreeGb: number;
  // The free space of the disk the caller named, for a writer that is not the root user; null where
  // none was named or it could not be read.
  diskFreeGb: number | null;
  // Null where the kernel keeps no pressure figures.
  memory: Pressure | null;
  cpu: Pressure | null;
}

/** One process worth naming: a browser, or one holding enough memory to matter. */
export interface MachineProcess {
  pid: number;
  name: string;
  /** Resident memory and swap together, in megabytes. */
  megabytes: number;
  browser: boolean;
  /** The agent place its environment names, by the place's own name; null for none. */
  place: string | null;
}

/** The machines work goes round, as the readings show them (the agency's docs/work-nodes.md, 「The rotation」). */
export interface NodesReading {
  machines: { name: string; label: string; node: string | null; jobs: number; runs: number; room: MachineStanding }[];
  // The machine the next heavy run goes to, by its label; null where no node takes runs.
  nextRun: string | null;
}

/** What one job, or one agent with no job open, holds of the machine. */
export interface MachineHolder {
  // The agent place the processes name: a worker's name for a job's, the agent's own otherwise.
  place: string;
  jobId: number | null;
  todoId: number | null;
  megabytes: number;
  browsers: number;
}

export interface MachineStanding {
  // Null where the machine could not be read, which holds nothing.
  reading: MachineReading | null;
  jobs: number;
  browserJobs: number;
  browsers: number;
  // Every launch limit met, in a few words each; empty where the machine has room.
  held: string[];
  // Whose memory, largest first.
  holders: MachineHolder[];
  // The five largest processes, with the place each names.
  largest: Pick<MachineProcess, "pid" | "name" | "megabytes" | "place">[];
  // The testbed's queue: who holds the machine's turn for heavy commands, and who waits behind it;
  // absent from a standing a bot that does not read the testbed wrote.
  testbed?: TestbedStanding;
  // The narrow lane's queue beside it (the testbed's docs/testbed.md, 「The lanes」); absent from a standing a bot
  // that does not read the lanes wrote.
  narrow?: TestbedStanding;
}

/** One entry of the testbed's queue, with the job its place names where one is open. */
export interface TestbedEntry extends TurnEntry {
  jobId: number | null;
  todoId: number | null;
}

export interface TestbedStanding {
  holder: TestbedEntry | null;
  waiting: TestbedEntry[];
}

/** One entry of the testbed's queue for heavy commands. */
export interface TurnEntry {
  // The agent place of the job that started it, where one did.
  place: string | null;
  checkout: string;
  command: string;
  // When it asked for the turn, and when the turn came, in milliseconds.
  asked: number;
  since?: number;
  pid: number;
  // A place kept for a job coming back after its wait ran out.
  kept?: boolean;
  // A caller at the front of the line.
  front?: boolean;
  // A caller standing next, behind the front.
  next?: boolean;
}


export interface RoomSummary {
  chatId: number;
  title: string;
  messageCount: number;
  lastMessageAt: number | null;
  // Whether the room stands in the pinned order the receiver keeps.
  pinned: boolean;
  // Whether the room was made for companions and names who answers in it (the agency's docs/companions.md): it
  // takes words alone, and its TODO panel shows the items filed in it. Absent on every other room.
  madeForCompanions?: true;
  // The companions among those who answer in it, by agent name, where it was made for companions.
  companions?: string[];
}

// A place in a room's line: when the message was sent, and of those sent in one second the order
// the archive took them in.
export interface ReadPlace {
  sentAt: number;
  order: number;
}

// How far the signed-in reader has read a room: how many of its messages they have not read, the
// first of them, which the room opens at, and the place read to that the count runs from — null
// where the archive keeps no marks (docs/web.md, 「Sidebar」). It is the answer to a room marked read too.
export interface RoomRead {
  unread: number;
  firstUnread: number | null;
  readTo: ReadPlace | null;
}

// A room as the room list hands it to the signed-in reader, with how far they have read it.
export interface ListedRoom extends RoomSummary, RoomRead {}

// Whose picture a stored file is. A room and a person can carry the same number, so the kind
// stands beside it wherever one is asked for.
export type AvatarKind = "room" | "person";

// One subject's profile picture, as the console asks for it. The address carries the moment the
// picture was received, so a browser keeps what it holds until the picture itself changes.
export interface AvatarRef {
  kind: AvatarKind;
  id: number;
  url: string;
}

export interface MessageAttachment {
  id: number;
  kind: "audio" | "video" | "document" | "sticker";
  name: string;
  bytes: number | null;
  type: string | null;
  available: boolean;
  // The shape a video stands in, where Telegram said what it was.
  shape?: VideoShape;
}

export interface VideoShape {
  width: number;
  height: number;
}

export interface TelegramExpression {
  offset: number;
  length: number;
  attachment: MessageAttachment;
}

// What a reply shows of the message it answers: who said it, what it said, and what it carried — a
// kept picture, and the first file it kept — so the quote can stand a small preview of it. A message
// the archive does not hold has no speaker, no words and nothing carried.
export interface ReplyQuote {
  messageId: number;
  senderName: string | null;
  text: string;
  pictured?: boolean;
  attachment?: MessageAttachment | null;
}

export interface ArchivedMessage {
  chatId: number;
  messageId: number;
  senderId: number | null;
  senderName: string;
  sentAt: number;
  text: string;
  imagePath: string | null;
  replyToMessageId: number | null;
  // The answered message as a reply shows it, when this message is a reply.
  replyQuote?: ReplyQuote | null;
  attachments?: MessageAttachment[];
  expressions?: TelegramExpression[];
  // Whether an agent sent this message, the chat agent or a companion, as the server reads it off the archive;
  // a screen draws an agent's answer by it rather than by any name. Absent where the server did not
  // say, which a screen reads as a person's words.
  agent?: boolean;
  // Whether the bot sent this message as the service rather than as the chat agent — a system notice, which a
  // screen stands as a system line rather than an answer. Absent where the server did not say.
  notice?: boolean;
  // How long the room waited for this answer, in whole seconds, on messages an agent answered with.
  // Null for everything anybody else said, and for an answer the archive holds no measurement
  // of.
  answerSeconds?: number | null;
  // The round of the chat agent's session this message answered in, on a message it sent in one.
  round?: string | null;
  // The album a picture went out in, named by the number of the album's first picture, on every
  // picture of a send of several; null on everything else.
  album?: number | null;
  // What that round cost, on the last message the round sent and on no other.
  spend?: RoundSpend | null;
  // Where what the turn did is kept, on that same last message: the room opens it from here and
  // the lines themselves are read out of the log when it does.
  actions?: TurnActionsRef | null;
  // The voice briefing that speaks this line, where one was asked for it.
  briefing?: MessageBriefing | null;
  // On a voice briefing that speaks a line standing in the room, that line: the room stands the
  // voice on it rather than as a row of its own.
  briefs?: number | null;
  // On a summary whose round has not sent its line yet: the room stands it as no row until the
  // round ends, on the line it is tied to or as its own row where the round sent none.
  awaitsLine?: boolean;
}

// A line's full reading (docs/web.md, the room screen's chips): nothing made yet, being made, there to play, or failed
// to be made. Once it is there, where its sound is served from — the voice message it went out as,
// for a line read out before readings were kept, or the reading kept on the line — and that sound.
export interface MessageBriefing {
  state: "idle" | "making" | "ready" | "failed";
  source: "voice" | "kept" | null;
  voiceMessageId: number | null;
  sound: MessageAttachment | null;
}

// A finished turn's own actions, as a message points at them: the agent whose log holds the run,
// the run its lines stand under, and how many documents it was handed and calls it made — enough for
// the room to stand a chip for each without reading a single line of the log — beside what the
// round wrote down, which is carried whole.
export interface TurnActionsRef {
  agent: string;
  run: string;
  documents: number;
  // The reference documents the turn went on holding from earlier in its session, which went as a
  // one-line mark: listed with the rest, but not counted among what it was handed.
  held: number;
  tools: number;
  records: TurnRecord[];
}

// What a run, or a set of runs, reported spending: each kind added over the runs that reported
// it, and how many runs did and did not report. A run that reported nothing adds nothing to the
// kinds; it is counted as unmeasured instead, so its share is never read as nought.
export interface SpendFigure {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  measured: number;
  unmeasured: number;
}

// What one answer cost: every run of the round that produced it, added up, and the runs
// themselves in the order they ran; and how full the answering session's context window stood once
// the last of its runs that reported it ended, as a share of it, or null where none did.
export interface RoundSpend extends SpendFigure {
  roads: TurnRoad[];
  context: number | null;
}

/**
 * One road a gate run walked on its way to a verdict: the provider and model it asked, how that
 * road ended, and how long it held the turn. A stage that asked the local model, waited out its share and
 * was answered by the Claude line carries two of these, in the order they were walked.
 */
export interface JudgementRoad {
  id: number;
  provider: string;
  model: string;
  outcome: string;
  ms: number;
  // What the road's run spent, where the record carries it; a road written before the figures
  // were kept, or one whose run read none, has none.
  tokens?: TokenSplit | null;
}

// One run a chat turn made, the turn's own included: which stage it was, the road it took and what
// it spent.
export interface TurnRoad extends JudgementRoad {
  stage: string;
}

export interface Judgement {
  id: number;
  chatId: number;
  messageId: number | null;
  stage: string;
  verdict: string;
  detail: string | null;
  createdAt: number;
  // How long the stage took, where the record carries it. A judgement announced by the live
  // stream carries neither this nor its roads: both are read from the archive.
  ms?: number | null;
  roads?: JudgementRoad[];
  // The round of the chat agent's session the decision was made in, where the record names one.
  round?: string | null;
  // What opened that round and what its gates were offered, where bmo-server read any.
  opening?: RoundOpening;
}

// One quiet instruction a round settled, without its text (docs/web.md, the room screen's judgements). Its sort is the
// word its producer named it by, and none where it named none.
export interface TurnInstruction {
  id: number;
  sort: string | null;
  summary: string;
  createdAt: number;
}

// One gate's row of the offers record: how many candidates its libraries held, how many it was
// asked about, what each rule kept, and the rules a candidate could be kept by where fewer than all
// of them could.
export interface GateOfferRecord {
  stage: string;
  held: number;
  asked: number;
  kept: { item: number; keyword: number; person: number };
  capped: number;
  rules: string[] | null;
}

// What one round settled and was offered, as bmo-server reads it.
export interface RoundOpening {
  instructions: TurnInstruction[];
  offers: GateOfferRecord[];
}

// The four kinds of token a run reports, as a window's rows add them up. Null is not nought: it
// says the rows this was read from were written before the kinds were kept apart, and nothing at
// all is known about how the traffic divided.
export interface TokenSplit {
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
}

export interface ControlStatus {
  reachable: boolean;
  slow?: boolean;
  // The owner's own private chat, as the bot names it. A screen knows whose room it is
  // standing in by this, and nothing but this; a bot that does not answer leaves it null.
  ownerChatId: number | null;
}

// One of the things an item's runs spent their time on, with the figures added up across every
// run of that item: a phase of the run, a tool it called, a co-worker it opened. The kind is
// what keeps the two levels apart — the phases divide the whole of the item's time between them
// and everything else happened inside one of them — so nothing may add a phase to a tool.
//
// The name is the CLI's own and is read out through the span vocabulary rather than shown as it
// stands. What a job spent is no length of time and is not one of these; it is read where an
// item's cost is read.
export interface TodoSpan {
  kind: "phase" | "tool" | "agent";
  name: string;
  seconds: number;
  // How many calls the seconds are added over — a tool called two hundred times is one of
  // these — and the tokens whoever stated them stated, which for a Claude Workflow branch is its own
  // figure and for everything else is nothing measured.
  times: number;
  tokens: number | null;
}

// A text rendered in a reader's language: the language it is in, as a language tag such as `ko`, and the text.
export interface TextRendering {
  language: string;
  text: string;
}

// One piece of work the owner is owed, as the archive's todos table holds it. The instruction
// is the owner's words and the chat agent's reply verbatim, which is why an item is worth keeping at all.
export interface TodoItem {
  id: number;
  title: string;
  instruction: string;
  // The organized instruction the chat agent keeps for the item's jobs, in the original a job reads, and a rendering
  // of it in a reader's language, carrying the language it is in. The brief is null until a job of the item is
  // launched or the chat agent rewrites it, and the rendering null where none is held.
  brief: string | null;
  briefRendering: TextRendering | null;
  requester: string;
  requesterId: number | null;
  chatId: number | null;
  approved: boolean;
  done: boolean;
  // Whether a job of this item is under way, read from the run itself: the item has a job row
  // that has not finished. The state line is a word somebody typed, so it is not asked.
  running: boolean;
  priority: number;
  status: string;
  model: string | null;
  // The provider and model the item's work last went out on, which `model` — `auto` above all — does
  // not say: a co-work item's own line as its order keeps it, any other item's latest run. Null until a
  // run of it has gone out (bmo-job's docs/work-orders.md 「The model a step ran on」).
  ranOn: RanOn | null;
  // Which worker is to do this work, and so which checkout it will be done in. It is an
  // assignment and not a record: the queue reads it to decide whose turn the item is, and the
  // job is launched on the worker it names. Null is unassigned, which is the built-in worker.
  worker: string | null;
  // Whether the job that runs this item fans out into branches. Off is what every item runs as
  // unless it is turned on, so a row that says nothing is one session.
  cowork: boolean;
  // How many times this item has been run. One run needs no saying; more than one is what makes
  // a row read as an attempt of this item rather than as a thing of its own.
  attempts: number;
  // How far the item's work order has come while a run of it is going — stage 2/3, building 1/4, design —
  // in the words the bot's board uses. Null on a row nothing is running for and on a one-session
  // job, which has nothing to count.
  progress: string | null;
  // Where the item's stopped work order stands — what it stopped for, its place at the head of its
  // worker's queue and why it is not resumed yet, the failures counted — as the bot left it on the
  // order. Null where no order of the item is stopped.
  stopped: WorkOrderStop | null;
  // What the item's work order is standing on while it holds its worker's checkout, in the words
  // the bot's runner wrote there. Null where no order of the item holds one or none is waiting.
  holding: string | null;
  // The long wait the job running this item marked for itself (the agency's docs/agent-control.md 「A job's own
  // mark on a long wait」): what it waits on, the one thing whose life says it goes on, and when it
  // expects to be done. Null where no job of the item carries a mark, or its target has gone.
  waiting: { what: string; target: WaitTarget; until: number } | null;
  // Whether a backlog deployment holding the queue is waiting for this item's job to end.
  deployWaits: boolean;
  // Held while a run of it still goes: the item reads as waiting to stop and stays in the queue until the
  // run has ended (bmo-job's docs/work-orders.md).
  holdPending: boolean;
  // Whether the item's work order is under way, a run of it going or not: what it has in flight —
  // a step waiting for a place included — is what a stop ends.
  orderActive: boolean;
  // How long the work took, in seconds: every job that carried the item added up, because an
  // attempt that failed is time the item cost. Null until a job of it has finished, and a job
  // still running counts as nothing rather than as a figure that grows while it is looked at.
  seconds: number | null;
  // What that time went to, longest first: the phases the item's runs were divided into and
  // everything that happened inside them, whole. Which of them a screen has room for is the
  // screen's own to decide, so nothing is left out on the way here.
  spans: TodoSpan[];
  // What the owner said when they approved it — a remark or a question of their own — and null
  // where they said nothing.
  note: string | null;
  // How the work was done, written by the job that did it as it closed the item, and what the
  // work left behind. Both null on an item nobody has finished, and on one finished before a
  // closing job was asked for its account.
  report: string | null;
  unfinished: string | null;
  // Whether that open matter still stands, and the one line saying what makes it no longer outstanding.
  // The note itself is never taken off the row: what is added is when it was resolved and why.
  unfinishedResolvedAt: number | null;
  unfinishedResolution: string | null;
  // When it was set aside, and the line saying why where one was given. Null on everything the
  // queue can still see.
  heldAt: number | null;
  heldReason: string | null;
  // Which kind of setting aside: the owner stopping the work mid-run (a stop), the owner winding it down to be
  // resumed (waiting to resume), the failure count (held for failures), or null for a plain hold.
  heldKind: "stop" | "pause" | "failure" | null;
  // The item this one was merged into — its number, its title and when — and null on a row never
  // merged. A merged row waits for that item and is finished with it; the link stays once it is.
  mergedInto: number | null;
  mergedAt: number | null;
  mergedIntoTitle: string | null;
  // The items merged into this one, in number order, with whether each is finished.
  mergedFrom: MergedTodo[];
  createdAt: number;
  doneAt: number | null;
}

// One item merged into another, as the item it was merged into lists it.
export interface MergedTodo {
  id: number;
  title: string;
  done: boolean;
}

// The three lists the panel stands on: what is approved and unfinished, in the owner's order;
// what a room has asked for and the owner has not approved; and what was lately finished, which stays
// in the table as the record of it.
export interface TodoBoard {
  queue: TodoItem[];
  pending: TodoItem[];
  // What the owner has set aside for now. It is out of the queue and out of the requests waiting on
  // them, and it is kept apart rather than mixed in, because the whole of setting one aside is
  // not seeing it.
  held: TodoItem[];
  // What is merged into another unfinished item and waits for it. Kept apart like what is set
  // aside, since its work is carried by the row it names.
  merged: TodoItem[];
  done: TodoItem[];
  // How many finished items there are behind the page in hand — every one of them where nothing
  // is being searched for, and the ones that match where something is. It is what tells the
  // panel there is more to fetch, and what lets it say how far through it has got.
  doneTotal: number;
  // Every item whose open matter is still standing, whether or not it is on the page in hand. It is the
  // list a new row's sources are picked from: a strand of work is often left in two notes at
  // once, and the row that takes it up comes out of both of them. A note already resolved is not
  // among them — it has been settled, and settling it again is a different act done on its own
  // row. The finished ones are paged, so this is asked for separately rather than found among
  // them.
  standingNotes: StandingNote[];
  // What the table's own columns hold, for the panel's conditions to be picked from: every worker
  // that does a row (an unassigned row being the built-in worker's), every room a request came from (null for one filed outside every room) and
  // every name a request was filed under. Read from the whole table and never narrowed, so a
  // condition that empties the list can still be changed to another.
  choices: TodoChoices;
  // How many rows the unfinished lists hold, whatever a search or a condition left of them.
  standing: TodoStanding;
  // Whether the owner has paused the auto-progression. It rides on the board because the panel
  // already asks for the board and the pause is a fact about this queue; it is read from the
  // archive like the rows are, so the screen says what is true whether the bot is up or not.
  paused: boolean;
  // A deployment holding the queue until no job is at work, apart from the owner's pause and let go by
  // another button: what it carries, what it takes away, whom it waits for and until when.
  deployHold: DeployHold | null;
}

export interface TodoStanding {
  queue: number;
  // The rows of the queue a run is going on for, a held one still ending included.
  running: number;
  pending: number;
  held: number;
  merged: number;
}

export interface TodoChoices {
  workers: string[];
  chats: (number | null)[];
  requesters: string[];
}

// One item that left an open matter nobody has settled: enough to pick it by and nothing else, since the
// note itself is read on the row it belongs to.
export interface StandingNote {
  id: number;
  title: string;
}

// Who settled a question a job put to the owner: their own answer, wherever they gave it, or the
// wait running out.
export type QuestionSettler = "owner" | "deadline";

// One question a job stopped to ask the owner, as the console reads it. The job is standing
// still while it is open, which is why the console shows it rather than leaving it to the chat.
export interface JobQuestion {
  id: number;
  // The item the asking job is a run of. A question is read back with its item afterwards.
  todoId: number;
  question: string;
  options: string[];
  // Which option the job would take by itself, counted from zero. The deadline settles on it.
  recommended: number;
  // The one line saying why the job would not decide this itself.
  why: string;
  askedAt: number;
  // When the question settles on the recommendation if nobody answers: the end of the countdown
  // while it runs, the end of the stop while they have stopped it.
  dueAt: number;
  chosen: number | null;
  // What the owner wrote instead of picking, where the options covered none of what they wanted.
  answer: string | null;
  // The seconds the countdown still had when they stopped it, or null while it runs.
  pausedLeft: number | null;
  settledAt: number | null;
  settledBy: QuestionSettler | null;
}

// One run that is going on right now, as the bot reports it. A gate runs inside the bot, so
// the bot's own memory is the whole truth of it; a runner, an editor and a job worker run in
// units of their own, and the bot asks the unit whether the run is still there.
/**
 * What a stop is aimed at, as every row of the picture names it (the agency's `docs/agent-control.md`
 * 「Stopping」). The kind decides the reach: a chat turn and a gate stand in the bot's own host and
 * are named by their execution, a runner, an editor and a job worker by their unit, and a work
 * order by its item.
 */
export type StopTargetKind = "execution" | "unit" | "item";

export interface StopTarget {
  kind: StopTargetKind;
  id: string;
}

export interface LiveRun {
  id: number;
  kind: LiveRunKind;
  agent: string;
  chatId: number | null;
  messageId: number | null;
  startedAt: number;
  // The unit this run stands in, and what a stop from the board names. Null for a gate.
  unit: string | null;
  // The ceiling this run is held to, null where it has none; a search has none.
  capSeconds: number | null;
  // A search run alone: basic, thorough or exhaustive.
  depth: string | null;
  // Actual worker provider/model once started; requested model until then.
  mode?: AgentMode | null;
  model: string | null;
  // Who set this run off: the console, or the chat whose session launched it. Null for a gate,
  // and for a run whose launcher was the chat it belongs to.
  startedBy: string | null;
  // A worker run alone: which TODO item it is a run of. The item is the only number shown for a
  // run; one with no item behind it carries none.
  todoId: number | null;
  // A worker run with no item alone: why it was launched, as its launcher wrote it, which a screen
  // shows where an item's number would stand. Absent or null for every other run.
  purpose?: string | null;
  // How far the work order this run is a step of has come — stage 2/3, building 1/4, design — in the
  // bot's own words. Null for a run that is no step of an order under way.
  progress: string | null;
  // Which step of a series its opener planned this run is — a batch of a room's person-book run —
  // and how many the series has. Absent or null for a run that is no step of one.
  step?: { step: number; steps: number } | null;
  // A worker run alone: standing still on a pane confirmation put to the owner, or on a question it
  // asked them. Absent or null for a run that waits on nobody.
  waiting?: "confirmation" | "question" | null;
  // What a stop on this row is aimed at. The bot names it per row, so no screen works one out from
  // the row's shape; null where there is nothing to aim at, and absent from a picture a bot drew
  // before it carried one.
  stop?: StopTarget | null;
}

export type LiveRunKind = "gate" | "runner" | "worker";

// A chat whose context is being folded up. The fold opens no row and writes no ending, so the
// bot's own picture is the only place it can be read while it is happening.
export interface ChatCompaction {
  chatId: number;
  since: number;
}

// What a turn was handed to read: the room's own messages, and the quiet instructions put in
// front of them. A figure the bot did not supply is not made up from anything else on screen.
export interface TurnReceived {
  messages: number;
  instructions: number;
}

// A chat answering a round right now. Like a fold it opens no row and writes no ending, so the
// bot's own picture is the only place it can be read while it is going on — which is what lets a
// screen that arrives in the middle of a turn, or comes back from a dropped stream, show it.
// Who answers a turn, where it is not the chat agent: a companion, by the number its words stand under in the
// room and its name. The chat agent's own turns name nobody.
export interface TurnSpeaker {
  id: number | null;
  name: string;
}

export interface ChatTurn extends TurnReceived {
  chatId: number;
  since: number;
  // The newest message the round carries, which it reads last and which its gates and answer judge;
  // null for a round carrying none, absent from a bot that does not say.
  messageId?: number | null;
  // A companion's turn names its speaker, so a room two agents answer holds a turn of each at once.
  speaker?: TurnSpeaker;
  // The Job the turn waits on for its engine, while it waits; null or absent once it runs.
  waiting?: EngineHold | null;
  // The chat agent answering stands in no unit, so its stop is named by the execution the turn's run opened.
  stop?: StopTarget | null;
}

// The Job a turn waits on: its number, and the item it is a run of, where it is one.
export interface EngineHold {
  jobId: number;
  todoId: number | null;
}

// A message the bot has put into its room's queue for the chat agent which no turn of its has taken yet, the
// newest of each room alone; it is waiting to be judged.
export interface QueuedMessage {
  chatId: number;
  messageId: number;
  since: number;
}

export interface LiveSnapshot {
  at: number;
  // The runs going beside the chat. Absent from the receiver's picture, since no unit serves them
  // (docs/boundary.md, 「Gaps the console meets」).
  runs?: LiveRun[];
  compacting: ChatCompaction[];
  turns: ChatTurn[];
  // Absent from a bot that does not say.
  queued?: QueuedMessage[];
}

export type BotEventType =
  | "avatars-updated"
  | "queued"
  | "run-started"
  | "judgement"
  | "sent"
  | "skipped"
  | "run-failed"
  // The round ended because somebody stopped the run: nothing failed and nothing is reported as a
  // breakdown.
  | "run-stopped"
  // The round ended by waiting for more of what someone is still typing: nothing was said and
  // nothing failed.
  | "waited"
  | "live"
  // What the session's own turn is doing right now, as its stream says it.
  | "run-progress"
  // The TODO changed. What it holds now is read from the archive, so the event says only that.
  | "todo"
  | "work-order"
  // The talk about one item moved: the owner said something, or the chat agent's turn on it ended.
  | "todo-talk"
  // The talk about one document in the document viewer moved, the same way.
  | "document-talk"
  // The talk under one code review moved, the same way.
  | "code-review-talk"
  // A code review was made, or a TODO row was filed out of one.
  | "code-review"
  // A part of a document's translation was written, or a translation stopped without one.
  | "document-translation"
  // A room's session was closed and a new one opened with a summary of it, because re-writing
  // the old context cost more than starting over.
  | "session-replaced"
  // A room's answer came off a lesser model than the one it was launched on, because the
  // account's safeguard refused that model on the session's context.
  | "downgraded"
  // A message arrived in a room and was archived. What the room now holds is read from the
  // archive, so the event says only which room and which message.
  | "message"
  // A room's window was opened, moved on or shut. How long it has left is read from the archive.
  | "window"
  // A node's state moved or the node list changed. What it holds is read from the archive.
  | "nodes"
  // The Laya server's health moved. What it holds is read from the archive.
  | "laya"
  // A voice briefing was put in a room. The message is the voice message, by which the console
  // serves its sound (the voice unit's docs/voice-briefing.md).
  | "briefing"
  // A room's registration was removed with its whole record. It names the room, which no screen
  // shows again.
  | "room-removed"
  // An agent's turn went out or ended, as the agency publishes it: any agent's, a worker's among them, which
  // the receiver's turns say nothing of.
  | "agency-turn";

// The ways a turn ends: the bot answered, it held its peace, its run failed, somebody stopped it,
// or it did nothing but wait for the rest of what someone is typing. Whatever a turn moves — a
// session's context, a usage window, the archive of a room — stands still again by the time one
// arrives.
export const TURN_ENDED: readonly BotEventType[] = ["sent", "skipped", "run-failed", "run-stopped", "waited"];

// What a listener needs of a briefing beyond the message it went out as.
export interface BriefingNews {
  text: string;
  // How long the sound runs, where it could be read off the file.
  seconds: number | null;
  // When it went out, in epoch milliseconds.
  sentAt: number;
  // The emotion it was spoken with, where one was named. The island draws no face and ignores it.
  emotion?: BriefingEmotion;
  // The face it shows, as the face's own entry answered for its emotion. The island draws no face and ignores it.
  expression?: string;
  // What a summary is about, in one line, which a listener shows in place of the words.
  title?: string;
  // Whether a listener plays it by itself; one that does not say is played.
  autoplay?: boolean;
}

interface BotEventFields {
  id: number;
  at: number;
  type: BotEventType;
  chatId: number;
  messageId: number | null;
  stage?: string;
  verdict?: string;
  detail?: string | null;
  // A live event belongs to no room and carries the whole picture rather than a change to it.
  live?: LiveSnapshot;
  // A run-started event alone: what the turn was handed, as it stood when the round opened.
  received?: TurnReceived;
  // A run-started event and the ending of the same turn: who is answering, where it is not the chat agent, so
  // the ending closes that speaker's turn and not another one going in the same room.
  speaker?: TurnSpeaker;
  // A run-progress event alone: where the turn is and what its stream has counted so far.
  progress?: RunProgress;
  // A sent event alone: the round the answer went out in, which every message of that answer names.
  round?: string;
  // A briefing event alone.
  briefing?: BriefingNews;
}

export interface WorkOrderProgress {
  status: "draft" | "active" | "paused" | "done";
  phase: "planning" | "research" | "synthesis" | "implementation" | "finalization";
  stage: number;
  updatedAt: number;
  tasks: Array<{
    id: string;
    state: "pending" | "running" | "done" | "failed" | "skipped";
    attempt: number;
    jobId: number | null;
    model: string;
    error: string | null;
  }>;
}

export type BotEvent = BotEventFields & ({
  type: "work-order";
  todoId: number;
  workOrder: WorkOrderProgress;
  document?: never;
} | {
  type: "todo-talk";
  todoId: number;
  workOrder?: never;
  document?: never;
} | {
  type: "document-talk" | "document-translation";
  // The document's name, its root and its path inside that root.
  document: string;
  todoId?: never;
  workOrder?: never;
} | {
  type: "code-review-talk" | "code-review";
  // The review's number.
  review: number;
  todoId?: never;
  workOrder?: never;
  document?: never;
} | {
  type: "agency-turn";
  // Whether the turn went out or ended, the session it is a turn of and the run it went out as.
  phase: "started" | "ended";
  session: string;
  run: string;
  todoId?: never;
  workOrder?: never;
  document?: never;
  review?: never;
} | {
  type: Exclude<BotEventType, "work-order" | "todo-talk" | "document-talk" | "document-translation" | "code-review-talk" | "code-review" | "agency-turn">;
  todoId?: never;
  workOrder?: never;
  document?: never;
  review?: never;
});

// What a running turn says of itself. Only what the stream actually carries: the output count
// is absent because the stream's own is a placeholder until the run ends.
// One thing a running turn has done, as the bot publishes it: what it was handed before it began,
// and each tool it has called since. The kind and the name are the log line's own, so the room's
// block reads them with the same look the agent's own page reads a line with.
export interface TurnAction {
  kind: "context" | "tool";
  name: string | null;
  // How a call shows its tool, where the log line it was read off says it; a call read off the bot's live
  // picture says nothing, and is shown by its name and its tool's declared icon.
  tool?: AgentLogTool | null;
  text: string;
  // How a call ended, once its result came back, and null while it is still out. On what was
  // handed over, whether a reference document went in full or as an already-loaded mark.
  state: "succeeded" | "failed" | AgentLogContextState | null;
}

export interface RunProgress {
  phase: "thinking" | "writing" | "tool" | "waiting";
  tool: string | null;
  thinkingTokens: number | null;
  contextTokens: number | null;
  cacheReadTokens: number | null;
  // The message the last request answered with.
  requestId: string | null;
  // What the turn's requests have reported so far, each added once; null before the first.
  spent: { inputTokens: number; cacheReadTokens: number; cacheWriteTokens: number } | null;
  // An estimate, from their length, of the tokens the turn's answer and tool calls have taken.
  writtenTokens: number | null;
  // What the turn has done so far, oldest first and bounded, with how many fell off the front.
  actions: TurnAction[];
  droppedActions: number;
  droppedContext: number;
  // The Job the turn waits on, in the waiting phase alone.
  waitingFor?: EngineHold | null;
}

// One gate run as the archive kept it: the verdict is what it ended with, and no detail is
// read here — the live status screen shows nothing anyone said.
export interface GateRunRecord {
  id: number;
  agent: string;
  chatId: number;
  messageId: number | null;
  verdict: string;
  ms: number | null;
  at: number;
}

export interface RunnerRecord {
  id: number;
  agent: string;
  // The systemd unit the run ran in, which is the name its log lines are kept under.
  unit: string;
  chatId: number;
  depth: string | null;
  capSeconds: number | null;
  startedAt: number;
  finishedAt: number | null;
  outcome: string | null;
}

export interface JobRecord {
  id: number;
  // The systemd unit the job ran in, which is the name its log lines are kept under.
  unit: string;
  chatId: number;
  model: string | null;
  launchedAt: number;
  finishedAt: number | null;
  outcome: string | null;
  ok: boolean | null;
  // The TODO item this run belongs to — the only number the screen shows for it — and which
  // attempt of that item it was. Null and 0 for a job nobody filed an item for.
  todoId: number | null;
  attempt: number;
  // Why a job with no item was launched, as its launcher wrote it; null for a run of an item and
  // for a row written before launches had to say.
  purpose: string | null;
  // The worker that ran it, which is the name its log is kept under and the screen it belongs
  // to. A row from before there was more than one worker carries the built-in worker's name.
  worker: string;
}

// What the live status screen is answered with: the bot's picture of now, and the archive's
// record of what came before. A bot that does not answer leaves the first half empty.
export interface ExecutionHistory {
  id: string;
  root?: string;
  workKey?: string;
  model?: string | null;
  attempt?: number;
  nativeState?: string;
  sharedPane?: boolean;
  parent: string | null;
  provider: string;
  line: string;
  state: string;
  exitCode: number | null;
}
// A standing watch the chat agent set on itself: what it waits for and how its checks have gone. A check
// watch is held by a runner whose unit the row names; a timer is held by no run.
export interface WatchView {
  id: number;
  kind: "condition" | "timer";
  chatId: number;
  // The short name a line shows the watch by, and the note the whole of what it promised. A watch
  // carrying no name is shown by the head of its note instead, which is what a null means.
  name: string | null;
  note: string;
  condition: string | null;
  dueAt: number | null;
  deadlineAt: number;
  intervalSeconds: number | null;
  lastCheckedAt: number | null;
  lastExit: number | null;
  unit: string | null;
  // The memory it serves, or null for a watch nothing closing a memory will end. An archive copied
  // before the column reads it as null.
  memoryId: number | null;
  // The run holding this watch, as a stop names it. A timer and a check between two runs are held
  // by nobody and name nothing.
  stop?: StopTarget | null;
}

export interface StatusView {
  executions?: ExecutionHistory[];
  watches?: WatchView[];
  reachable: boolean;
  slow?: boolean;
  live: LiveRun[];
  compacting: ChatCompaction[];
  liveAt: number | null;
  gates: GateRunRecord[];
  runners: RunnerRecord[];
  jobs: JobRecord[];
  // The machine's room as the bot last read it; null before it has.
  machine?: MachineStanding | null;
  // The machines work goes round, with what each was given (the agency's docs/work-nodes.md); null before the bot
  // has read them.
  nodes?: NodesReading | null;
}

export interface AccountUser {
  name: string;
}

// The sorts of thing a `context` line carries, as its name: which of the things put in front of a
// turn before it ran this one was. The writer settles it — a picker's library and a standing entry
// each answer for their own — and a sort this list does not know still reads as what it is.
// What a line says became of what it records, in the writer's own words.
// How a reference document went in, on its `context` line: its full text with that turn, or a
// one-line mark for a version the session already held.
export type AgentLogContextState = "attached" | "held";

// One line of what an agent did, as whoever read that run's stream wrote it down. The bot
// writes it and this app only reads it.
// The tool a line is about, as its chip shows it.
export interface AgentLogTool {
  name: string;
  icon: string | null;
}

export interface PushDevice {
  endpoint: string;
  kinds: PushKind[];
  createdAt: number;
  lastSentAt: number | null;
}

// What the console can say about push before a browser has been asked anything: whether this
// machine holds keys at all, the public half a browser needs to subscribe, and the devices
// already subscribed under this account.
export interface PushState {
  configured: boolean;
  publicKey: string | null;
  devices: PushDevice[];
}

// What one notification carries. It is a nudge to open the console rather than the thing
// itself: a line to read at a glance and where to go for the rest of it.
export interface PushPayload {
  // The kind of news, or `test` for the account screen's test ring, which no device can refuse.
  kind: PushKind | "test";
  title: string;
  body: string;
  // Where pressing it goes, as a path inside the console.
  url: string;
  // What this notification is about, so a second one about the same thing replaces it on the
  // screen instead of standing beside it.
  tag: string;
}

// Every provider the bot carries, as the bot names them.
export type AgentMode = AgentProviderName;

// The agency screens' shapes, as the agency, bmo-job and the receiver answer them (each one's `docs/api.md` or `docs/boundary-api.md`).

// What one run of an agent spent, named by the run its log lines are kept under. A turn of the chat agent's
// chat carries its whole round — the roads of every run of it and their sum — and any other run
// carries its own reading with no roads. A run nothing was recorded for has no spend.
export interface TurnFigures {
  run: string;
  roads: TurnRoad[];
  spend: SpendFigure | null;
}

export interface AgentSummary {
  name: string;
  kind: string;
  // What it is for, which decides the bundles its turns are given (the agency's docs/agent-roles.md); null where
  // its row names none, absent where the archive holds no such column yet.
  role?: string | null;
  // How the one runner carries a conversational agent (the agency's docs/agents.md, 「One runner」): one session
  // across its rooms or one in each, its window's turns or its settings' pieces, and whether it answers
  // every room that names nobody. The scope and shape are null and the answering false on every other
  // row.
  sessionScope: "agent" | "room" | null;
  turnShape: "window" | "pieces" | null;
  defaultAnswerer: boolean;
  // The model and provider the agent is configured to begin on, as the bot resolves its work key
  // against the shared tier settings. Null where the agent has no work key or the settings refuse
  // it, and null or absent when the list was read from the archive while the bot was not
  // answering. lastMode and lastModel below remain what actually answered.
  model: string | null;
  configuredMode?: AgentMode | null;
  // What the provider and the model it begins on are called, each as it answers for itself: the
  // provider's label, and a registration's where the model is one. Absent or null where the bot did
  // not say, and a screen then names them its own way.
  configuredLabel?: string | null;
  modelLabel?: string | null;
  lastMode: AgentMode | null;
  lastModel: string | null;
  lastEffort: string | null;
  // What the catalogue calls this agent, the other names the owner calls it by, and the mark a
  // screen puts on it. All three are the archive's, so a screen never keeps a list of its own.
  label: string | null;
  aliases: string | null;
  icon: string | null;
  // Where a worker's jobs run. Null for every other kind of agent.
  cwd: string | null;
  // Whether a worker's directory is a git checkout; one that is not runs ordinary jobs only.
  // Absent for every other kind of agent.
  checkout?: boolean;
  // What a worker's job prompts open with, and the one line its standing dev server runs. Null for
  // every other kind, and absent when the list came from an archive that has not got the columns.
  preamble?: string | null;
  devCommand?: string | null;
  // Whether the bot writes this row on every start. A built-in agent is part of the machine; one
  // the owner added is theirs to change and to remove.
  builtin: boolean;
  chatId: number | null;
  // The room sessions a designated agent holds, each with the moment its log last took a line there;
  // absent for an agent that holds none.
  sessions?: { chatId: number; lastAt: number | null }[];
  runs: number;
  lastRunAt: number | null;
  lastKeepaliveAt: number | null;
  // What this session was carrying when it last answered. Only a session that keeps one has it.
  contextTokens: number | null;
  // Whether the owner has stopped this agent's keepalive. A stopped agent still answers
  // everything asked of it; what is off is the ping that holds its prefix warm.
  keepaliveStopped: boolean;
  // When a worker's keepalive was turned off until its next job, in seconds, or null.
  keepalivePausedAt: number | null;
  // Whether a worker's session is dropped when a run of it falls to a lesser model. Present for a
  // worker only; one read from an archive that has not got the column reads as on.
  downgradeHeal?: boolean;
  // A base worker's two support settings, and a support worker's base and number
  // (the agency's docs/worker-slots.md). Present for a worker only.
  supportCount?: number;
  supportKeepalive?: number;
  supportOf?: string | null;
  supportSlot?: number | null;
  // The node a worker's checkout stands on, its directory being a path there; null for this machine
  // (the agency's docs/work-nodes.md). Present for a worker only.
  node?: string | null;
  // The one provider a worker is pinned to, null where it follows the worker key's road. Present
  // for a worker only.
  pinnedProvider?: AgentMode | null;
  // The one model of that provider the worker is pinned to — a registration — or null where the pin
  // is the provider alone. Present for a worker only.
  pinnedModel?: string | null;
  // The agent's own thinking and effort over its tier (the agency's docs/model-tiers.md, 「An agent's own thinking
  // and effort」). Null for an agent no choice of its own reaches — a gate, a support worker — and
  // absent where the list was read from the archive while the bot was not answering.
  reasoning?: AgentReasoningView | null;
  // The gates the agent's turn passes, each with the agent's own switch (the gate unit's docs/gates.md, 「Each
  // agent's own gates」). Null for an agent that answers in no room, and absent where the list was
  // read from the archive while the bot was not answering.
  gates?: AgentGateView[] | null;
}

// One gate an agent's turn passes, in the first part of the turn it stands in.
export interface AgentGateView {
  part: "pre" | "post";
  key: string;
  on: boolean;
}

// What an agent's row names of its own thinking and effort, each null where its tier and its line
// decide, and what of it reaches the provider and model it begins on, as that provider answers: null
// where it begins on none.
export interface AgentReasoningView {
  thinking: boolean | null;
  effort: string | null;
  reaches: { thinking: boolean; levels: string[] } | null;
}


// One job of a worker's as the foot of its screen reads it, the way the CLI's own status line does:
// which item it is, how long it went, how many tools it called and what each model it used spent.
export interface JobLine {
  run: string;
  todoId: number | null;
  title: string | null;
  // Why a job with no item was launched, as its launcher wrote it.
  purpose: string | null;
  startedAt: number;
  // Null while the job runs.
  finishedAt: number | null;
  tools: number;
  // One entry a model, read off the usage rows of a finished job and off the session record of a
  // running one. Empty where neither has anything to say.
  models: Array<TokenSplit & { model: string }>;
}

// A job's prompt as a person reads it (the agency's docs/worker-language.md, 「A job's prompt」): its Korean
// reading, and the English its worker was handed where that says something else.
export interface JobPrompt {
  text: string;
  english: string | null;
}

// One line of a tally, whichever way the rows were grouped. The plain total counts every row
// there is; the kinds cover only the rows carrying them, and the two unsplit figures — how many
// rows carry none and what those carry — say how much of the line they do not cover, so a figure
// worked out from the kinds is never shown without saying what it leaves out.
export interface UsageTally extends TokenSplit {
  tokens: number;
  runs: number;
  unsplitRuns: number;
  unsplitTokens: number;
}

// What one agent's sessions carry now, as the agency counts it for the agent's jobs.
export interface AgentContext {
  agent: string;
  contextTokens: number;
}

// What one agent has cost over a window, counted from the rows the bot writes as each of its
// runs answers. Every run carries the name of the agent that made it, so this is a real sum per
// agent — and an agent with no row at all is simply absent, which is not the same as nought.
export interface AgentTokenUsage extends UsageTally {
  agent: string;
}

// The slot the chat runs on now, as the agency names it (docs/web.md, 「Usage in the title bar」): the provider its
// road answers on, under the label the agency gives it, and the login it walks to where the provider holds logins,
// with how many it holds, which is what says whether naming one tells anything apart. Its two windows are the
// agency's headline pick of the slot's own; a window it states no reading for is null.
export interface ActiveUsage {
  provider: string;
  label: string;
  account: string | null;
  accountName: string | null;
  logins: number;
  session: HeadlineWindow | null;
  week: HeadlineWindow | null;
}

// One registered account and what it has left: its own session and weekly windows and no other account's, null
// where the agency states none, and whether the chat runs on it now.
export interface AccountUsage {
  id: string;
  name: string;
  provider: string;
  label: string;
  inUse: boolean;
  session: HeadlineWindow | null;
  week: HeadlineWindow | null;
}

export interface UsageView {
  // Null where the agency names no slot.
  active: ActiveUsage | null;
  // In the order the agency lists them.
  accounts: AccountUsage[];
  // What each worker's jobs have spent over the week, only where the agency carries a figure.
  agents: AgentTokenUsage[];
  contexts: AgentContext[];
}

// Every answer that depends on the bot's control API says whether the bot answered at all,
// so the view can go read-only instead of showing an error, and — where it did not — whether it
// took the call and was too busy to answer in time rather than being gone (`slow`).
// One role an agent may hold, with the bundles it gives, as the bot declares them.
export interface RoleView {
  name: string;
  label: string;
  bundles: { name: string; label: string }[];
}

export interface AgentList {
  reachable: boolean;
  slow?: boolean;
  agents: AgentSummary[];
  // Every role an agent may hold, in the order the bot lists them; empty while it is not answering.
  roles: RoleView[];
  // The gate order, which is the code's own and stands whether the bot answers or not. Empty only
  // before the first read has come back.
  // The gate order is the gate unit's, which is not split yet; null while no unit answers it.
  gateOrder: GatePartView[] | null;
}

// The kinds of line an agent's log holds, in the words the writer stores. A `context` line is
// what a turn was handed before it ran, and its name says which sort of thing that was.
export type AgentLogKind =
  | "start"
  | "thinking"
  | "text"
  | "tool"
  | "tool-result"
  | "prompt"
  | "context"
  | "note"
  | "end";

export type AgentLogState = "requested" | "running" | "succeeded" | "failed" | "unverified" | "unavailable" | AgentLogContextState;

export type AgentLogContext =
  | "room"
  | "memory"
  | "person"
  | "document"
  | "rule"
  | "situation"
  | "knowledge"
  | "archive";

export interface AgentLogLine {
  id: number;
  agent: string;
  // Which single run of that agent the line belongs to, so the screen knows where one run
  // ends and the next begins.
  run: string;
  chatId: number | null;
  at: number;
  kind: AgentLogKind;
  // The tool a call or its result is about; an MCP tool keeps its own name, as its road wrote it.
  name: string | null;
  // How a call or its result shows the tool: the tool's own name — an MCP tool's without its server
  // — and the icon the tool declares, or null for the one icon every other tool takes. Null on a line
  // about no tool.
  tool: AgentLogTool | null;
  // The Task call this line came out of, so a co-worker's branch reads on its own.
  parent: string | null;
  // The tool_use id: a call carries its own, a result carries the id of the call it answers.
  ref: string | null;
  // How the run itself said that line ended: a call requested, a result succeeded or failed. Null
  // on a line whose writer said nothing of the sort.
  state: AgentLogState | null;
  // Whether the line was cut at the per-line cap.
  truncated: boolean;
  text: string;
  // What a result changed, file by file, where a job's record holds it: a file tool's one file, or
  // every file a shell command changed. Empty on every other line.
  patches: AgentLogPatch[];
  // Files a shell command changed that the provider counted but did not record.
  patchesMore: number;
}

// One run of changed lines as the provider recorded it: where it starts and how long it is on
// either side, and its lines, each led by "+", "-" or a space.
export interface AgentLogHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

// What was done to one file. An edit carries its hunks and no type; a write says whether it
// created the file or replaced it, and a created or deleted file comes as its content with no
// hunks. `by` says whether a file tool made the change or a shell command did, which is what the
// terminal heads it by.
export interface AgentLogPatch {
  filePath: string;
  type: "create" | "update" | "delete" | null;
  by: "tool" | "command";
  hunks: AgentLogHunk[];
  content: string | null;
  // The change is bigger than the screen is sent; the result is read the ordinary way instead.
  tooLarge: boolean;
}

export interface AgentLogPage {
  lines: AgentLogLine[];
  // Whether another page waits on the side this one was read towards: older lines for the page
  // a screen opens on, newer lines for a page read forward from a moment in the log.
  hasMore: boolean;
  // Only a page read from a moment says this, since it alone has a log on both sides of it.
  hasOlder?: boolean;
  // A page no unit serves: the log across an agent's runs, which the agency reads only by run.
  unavailable?: true;
}

export interface WorkerChanged {
  ok: true;
}

// One model OpenRouter offers, as a chooser needs it: which model, what it is called, how much
// it can be told, and whether it costs anything.
export interface OpenRouterModel {
  id: string;
  name: string;
  contextLength: number | null;
  free: boolean;
}

// One model the installed Codex CLI offers. The executable is the catalogue; the console keeps
// no model list of its own, and the reasoning levels here are the ones that exact build accepts.
export interface CodexModel {
  id: string;
  name: string;
  description: string;
  contextLength: number | null;
  defaultReasoningEffort: string;
  supportedReasoningEfforts: string[];
}

// One provider whose models answer a request with no tools, and whether it can answer on this
// machine.
export interface OwnLlmServiceView {
  name: AgentMode;
  label: string;
  shortLabel: string;
  present: boolean;
}

// What one work key asks one own LLM service for.
export interface OwnLlmSettingsView {
  provider: AgentMode;
  model: string;
  thinking: boolean;
  answerTokens: number;
}

// One provider as a work key's chooser offers it: the name the route stores, the label the owner
// reads, and why it cannot be chosen for this key — this machine lacks what the provider needs,
// or the program behind it does not carry the key's line. Null where it can.
export interface OfferedProvider {
  name: Exclude<FallbackRouteMode, "auto">;
  label: string;
  reason: string | null;
}

// One agent provider in the owner's order, with its switch. Laya is a gate's road and never in it.
export interface OrderedProvider {
  name: AgentMode;
  label: string;
  reason: string | null;
  enabled: boolean;
}

// The sort of work a key is, in the agency's own words: `bmo` is the chat's work, its word on the wire.
export type FallbackKind = "bmo" | "worker" | "gate" | "editor";

// One piece of work and every choice of its road: the provider it begins on and each provider's
// model. The key is the agency's stable name for the work, not the primary provider's current model:
// changing a Claude launch line cannot silently move the Codex or OpenRouter choices attached to
// it. The line is the run line the key is carried on, which is what decides the providers offered.
export interface FallbackProfile {
  key: string;
  label: string;
  kind: FallbackKind;
  line: string;
  codexModel: string;
  codexEffort: string;
  defaultCodexModel: string;
  defaultCodexEffort: string;
  codexOverridden: boolean;
  claudeModel: string;
  // What the key asks each own LLM service for, one entry per service; a gate's is held to its floor.
  services: OwnLlmSettingsView[];
  // A gate's wait as the owner chose it, beside what the gate runs on — its tier's thinking and
  // answer room with that wait — and its defaults. Absent on every key that is not a gate.
  gateOptions?: GateOptionsView;
  noRoute: string | null;
  openrouterModel: string | null;
  routeMode: FallbackRouteMode;
  // The Claude account the key is pinned to, or null where it walks the account order.
  account: string | null;
  setAt: number | null;
  offered: OfferedProvider[];
}

// One gate's request options as a screen reads them.
export interface GateOptionsView {
  timeoutMs: number;
  // What the owner chose for the gate's Laya mode and tau, null where nothing, and whether the gate
  // has a Laya probe at all (the gate unit's docs/laya.md).
  layaMode: LayaMode | null;
  layaTau: number | null;
  layaProbe: boolean;
  // Whether the owner may switch the gate off, and whether it runs (the gate unit's docs/gates.md).
  switchable: boolean;
  enabled: boolean;
  // The LLM the gate asks while it stands on Laya and Laya gives no verdict: a provider's name, `none`,
  // or null for the provider its road would begin on (the gate unit's docs/laya.md).
  layaFallback: string | null;
  effective: { thinking: boolean; answerTokens: number; timeoutMs: number; layaMode: LayaMode; layaTau: number | null };
  defaults: { thinking: boolean; answerTokens: number; layaMode: LayaMode; layaTau: number | null };
}

// What the console may know about the ordered fallback. The OpenRouter secret is not here and
// never will be: the screen gets only whether it exists. `key` inside a profile is a route name,
// not that secret.
// One of a slot's two headline windows, as the bot picked it: its share and when it starts over.
export interface HeadlineWindow {
  name: string;
  utilization: number;
  resetsAt: number | null;
  durationMinutes: number | null;
  limitName: string | null;
}

// The agent serving now, as the bot answers it: the provider the road answers on, the login it
// walks to where the provider holds logins, and that slot's own session and weekly windows. The
// console picks no provider or login of its own.
export interface ActiveAgentView {
  provider: AgentMode;
  account: string | null;
  // The name the owner gave that login, or the provider's own label where it holds none.
  accountName: string;
  // How many logins the provider holds, which is what says whether naming one tells anything apart.
  accounts: number;
  session: HeadlineWindow | null;
  week: HeadlineWindow | null;
}

export interface FallbackView {
  active: ActiveAgentView;
  codexPresent: boolean;
  keyPresent: boolean;
  services: OwnLlmServiceView[];
  // When a stand-in began answering, and null while the primary provider is answering.
  since: number | null;
  // The owner's provider order as every walk follows it, each provider with the reason it cannot
  // answer on this machine right now, or null where it can.
  order: OrderedProvider[];
  orderIsDefault: boolean;
  // The Claude Code entry's own list: the accounts in the order it walks them. What the screen
  // learns of a credential is the path it is reached by — no token and no file body is here.
  accounts: ClaudeAccountView[];
  profiles: FallbackProfile[];
}

export interface FallbackChanged {
  ok: true;
}

// What the console may know about the warming round as a whole. Which agents are stopped one by
// one is on the agents list, since that is where the rows are.
export interface KeepaliveView {
  stopped: boolean;
}

export interface KeepaliveChanged {
  ok: true;
}

// Whether the voice briefing is on: off, no briefing is made on any road (the voice unit's docs/voice-briefing.md).
export interface VoiceBriefingView {
  on: boolean;
  // Whether a briefing plays by itself when it arrives (the voice unit's docs/voice-briefing.md, 「Playing by itself」).
  autoplay: boolean;
}

// What the bot answers when one runner is stopped from the live board. The row is closed by the
// runner itself once the signal reaches it, so this says only which unit was asked to end.
/**
 * What a stop answers with. The target is the one it reached, and the state says how far it got:
 * a run asked to stop is still winding up, a run confirmed is gone (`the agency's docs/agent-control.md`
 * 「Stopping」). `unit` and `agent` stand where the target was a unit and a row still named one,
 * which is what the board read back before targets had a kind of their own.
 */
export interface RunStopped {
  ok: true;
  target: StopTarget;
  state: "asked" | "confirmed";
  // How many runs this one stop reached: one for a run, an item's own count for an item.
  runs: number;
  unit?: string;
  agent?: string;
}

// What stopping everything answers with: what was asked, and what could not be — a run that ended
// between the reading and the asking is the ordinary way the second happens, and it never keeps
// the rest running.
export interface RunStopAll {
  ok: true;
  stopped: Omit<RunStopped, "ok">[];
  refused: { target: StopTarget; why: string }[];
}


// What a screen may know about a Claude account. It is the account's own row, its place in the
// order the Claude road walks, one fact about its login — whether it stands, is near its end or is
// gone — and where the road stands with it: whether the owner chose it to run on now, whether runs go
// out on it now, and how long a limit rest keeps it out of the walk.
//
// **The path is the whole of what is shown of a credential.** No token, no cookie and no part of a
// credential file's body is in this view, so nothing that renders it or carries it can put one on a
// screen: what the browser learns is where the login is kept and when it ends, which is exactly
// what the owner needs to sign it in again and nothing more.

export interface ClaudeAccountView {
  id: string;
  name: string;
  place: number;
  enabled: boolean;
  // How the credential is reached — a configuration directory, or the file a long-lived token sits
  // in — and the path it is reached by. Never the credential.
  credentialKind: ClaudeCredentialKind;
  credentialPath: string;
  login: LoginStanding;
  // When the login ends, in seconds, or null where it has no end to read — a login the CLI renews
  // for itself, or one whose file says nothing. Neither is a login that has ended.
  loginEndsAt: number | null;
  // Whether this is the account the owner chose to run on now, where the walk starts once the login in use
  // cannot answer.
  chosen: boolean;
  // Whether automatic runs go out on this account now: the head of the walk, which is the login in
  // use wherever it can answer. It differs from the chosen one where the chosen one is resting, its
  // login is gone, or the login in use is still being spent to its end.
  serving: boolean;
  // Until when, in seconds, a limit rest keeps this account out of the walk, or null where none does.
  restUntil: number | null;
}

/** How a login is standing: answering, near its end, or gone. */
export type LoginStanding = "standing" | "ending" | "gone";

// The agency holds more than one Claude login, and each of them is an account: a name the owner gives it, a
// place in the account order, an on/off, and where its credential is reached. The Claude Code
// entry of the provider order is the list of them, walked in that order, and everything a login
// owns — its sessions, its transcripts, its usage windows, its rest — belongs to the account
// rather than to the road.
//
// **What is kept is where a credential is, never a credential.** A row carries a path and
// nothing else: no token, no cookie and no part of a credential file's body crosses to the console.

// How a run reaches an account's login.
//
// - `directory` — the account names a configuration home of its own, and the CLI keeps that
//   login in that directory's `.credentials.json`. Two directories are two logins with nothing
//   shared.
// - `token` — the account names a file holding the long-lived token the CLI issues, handed to a
//   run as `CLAUDE_CODE_OAUTH_TOKEN`. Such a token stands for a year, carries no refresh of its
//   own and is inference-only, so it dies rather than lapsing.
export type ClaudeCredentialKind = "directory" | "token";

// The node unit's shapes, which the agency screens show of the machines their workers stand on.

// One node as a screen reads it (the node unit's docs/nodes.md, 「In the console」): where it is reached, where its
// credential is kept, and its last check in the words every list says it in. It holds no credential.
export interface NodeView {
  name: string;
  label: string;
  // The connection type, which the node's screen and the monitor show and the list does not.
  kind: NodeKind;
  // A jake node's agent, by the name its hub knows it by.
  agent: string | null;
  address: string;
  // The place the credential is kept: a key's path, or the environment file holding a hub's token.
  // Null where an ssh node offers whatever the account's own SSH configuration does.
  credential: string | null;
  // The one service the node is reserved for, or null where several may share it.
  role: string | null;
  state: NodeState;
  stateWord: string;
  tone: NodeTone;
  detail: string | null;
  checkedAt: number | null;
  connectedAt: number | null;
  // Whether the node is the machine reading the list, as that machine judges it (the node unit's docs/hardware.md,
  // 「Which machines」). Never true for a jake node, whose hub says nothing of where its agent runs.
  thisMachine: boolean;
  // Whether a worker's checkout may be placed on it: another machine reached over SSH whose role
  // allows jobs (the agency's docs/work-nodes.md, 「Which machines take work」).
  takesJobs: boolean;
}

// What a node's last check came to, in the words every list says it in (the node unit's docs/nodes.md, 「The state
// words」), read from the shared policy Rust reads them from too. The web console reads this file as
// herdr's labels do, so the lists cannot say a state differently. Nothing here touches the archive or
// the machine.

export const NODE_KINDS = ["ssh", "jake"] as const;

export type NodeKind = (typeof NODE_KINDS)[number];

export const NODE_STATES = ["connected", "disconnected", "auth", "hostkey", "unreachable", "error", "unknown"] as const;

export type NodeState = (typeof NODE_STATES)[number];

// How a state reads at a glance: reached, not reached, or not yet asked.
export type NodeTone = "good" | "bad" | "unknown";

// The gate unit's shapes, which the agency screens show of the gates.

export interface LayaHealthView extends LayaHealth {
  stateWord: string;
  tone: NodeTone;
  // The node of the node list the server's address stands on, where one does: its screen is the page
  // the state leads to.
  node: string | null;
}

// One gate that declares a Laya probe: the mode and tau it runs on, and its agreement with its LLM, or
// none where no pair is recorded yet.
export interface LayaGateView {
  stage: string;
  mode: LayaMode;
  tau: number | null;
  agreement: LayaAgreement | null;
  // The checkpoint the server named for this gate in its latest health check, where it named one:
  // what answers the gate on Laya (the gate unit's docs/laya.md, 「A gate whose provider is Laya」).
  checkpoint: string | null;
  // The modes the bot would refuse this gate, each with why (the gate unit's docs/laya.md, 「Mode and tau per gate」),
  // so the screen offers them greyed rather than letting a choice be turned away.
  refused: Partial<Record<LayaMode, LayaModeRefusal>>;
}

export interface LayaView {
  health: LayaHealthView;
  gates: LayaGateView[];
  // The modes in the words a screen shows them in, and the tau a gate may be given — the grid its
  // agreement is counted at, so every tau offered has a figure beside it.
  modes: { value: LayaMode; label: string }[];
  taus: readonly number[];
}

// What the archive keeps of Laya: the modes a gate may stand beside it in, the verdict record and the
// bounds on it (the gate unit's docs/laya.md, 「The verdict record」). The archive stores and sweeps these rows, so
// their shape stands with it; the Laya client is the gate base's (`laya.ts`).

// How a gate runs beside Laya (the gate unit's docs/laya.md, 「Modes」): alone, with Laya recorded beside it, with
// Laya settling what it is sure of, or with Laya settling only the gate's safe verdict.
export const layaModes = ["off", "shadow", "filter", "asymmetric"] as const;

export type LayaMode = (typeof layaModes)[number];

// How a call to Laya failed, as the record and the health row keep it.
export type LayaFailure = "unreachable" | "timeout" | "refused" | "bad-answer" | "too-large";

// Why the bot would not put a gate in a Laya mode, or null where it runs in it (the gate unit's docs/laya.md, 「Mode
// and tau per gate」): no probe to ask with, no safe verdict for asymmetric, or no checkpoint on the
// server for a mode in which Laya decides. `checkpoints` are the gates the last health check named.
export type LayaModeRefusal = "no-probe" | "no-safe-verdict" | "no-checkpoint";

export interface LayaAgreementAt {
  tau: number;
  // The share of pairs Laya would settle at this tau, and how often it agrees with the LLM on them.
  coverage: number | null;
  agreement: number | null;
  // For a gate with a safe verdict: how many pairs Laya called safe at this tau, and how often the LLM
  // called them safe too.
  safeCount: number | null;
  safeAgreement: number | null;
}

export interface LayaAgreement {
  stage: string;
  // What the figures are counted over: pairs, or for a gate settled one question at a time its
  // questions, in which case `pairs` is how many questions were compared.
  unit: "pair" | "question";
  pairs: number;
  failures: number;
  agreement: number | null;
  byTau: LayaAgreementAt[];
  // For a gate counted by question: the share of the questions Laya answered that it settled for the
  // gate. Null for a gate counted by pair.
  settled: number | null;
}

// The Laya server's last health check, kept as one row (the gate unit's docs/laya.md, 「The health watcher」). The
// archive settles and keeps the row, so its store stands with it; the watcher that asks the server
// is the gate base's (`laya-health.ts`).

// `up` is a server that answered; `off` is a bot with no address set, which asks nothing; `unknown`
// is a server nobody has checked yet; every other word is the failure the last check met.
export type LayaHealthState = "up" | "off" | "unknown" | LayaFailure;

export interface LayaHealth {
  state: LayaHealthState;
  model: string | null;
  device: string | null;
  vramBytes: number | null;
  loadMs: number | null;
  versions: Record<string, string>;
  // The address the check asked, so a screen can say which machine the server stands on.
  address: string | null;
  // How long the last check took in milliseconds, and when it was made and when the server last
  // answered one, in unix seconds.
  checkMs: number | null;
  checkedAt: number | null;
  healthyAt: number | null;
}

// What a gate order is: where each gate stands against a chat turn (`the gate unit's docs/gates.md`). The pre-gate
// and post-gate parts are steps in the order a turn passes them, a step holding the gates the turn
// starts together; the off-turn part is the gates that run outside any turn. Which gates there are
// and where each stands is the deployment's own order, handed to whatever reads it.

// What a step of the gate order may run under, where it runs in some turns only: the turn replaces
// the agent's session, or the room's dialect folds its answers (`the gate unit's docs/chat-providers.md`).
export const gateConditions = ["fresh-session", "folding-dialect"] as const;

export type GateCondition = (typeof gateConditions)[number];

// A gate's place in a step: the gate alone, or the gate with the one condition its step runs under.
export type GatePlace = string | { readonly key: string; readonly condition: GateCondition };

export interface GateOrder {
  pre: readonly (readonly GatePlace[])[];
  post: readonly (readonly GatePlace[])[];
  apart: readonly string[];
}

export type GatePart = keyof GateOrder;

export interface GatePlaceView {
  key: string;
  condition: GateCondition | null;
}

export interface GateStepView {
  places: GatePlaceView[];
}

export interface GatePartView {
  part: GatePart;
  // Whether the steps are a turn's order. The off-turn part's are not: each of its gates is a step of
  // its own, in the order the part lists them.
  inTurn: boolean;
  steps: GateStepView[];
}

// The job screens' shapes, as bmo-job answers them (bmo-job's `docs/api.md`).

// Which chat is the owner's own, as this app itself knows it. The bot's health answer carries
// the same number, and this one is here for the screens that have to be drawn before any answer
// of the bot's has come back.
export interface OwnerChat {
  chatId: number | null;
  // Whether the one signed in is the platform administrator, who alone is offered what only the owner may do.
  administrator: boolean;
}

// One lot of words added to an item that already stands, as the archive's todo_notes holds it.
// The work is often already under way when the next condition is thought of, and this is where
// those words wait: who added them, when, and which job was running at that moment. Nothing
// edits or deletes one, so an item read afterwards says what was asked of it while it was being
// done.
export interface TodoNote {
  id: number;
  todoId: number;
  author: string;
  // Who the author is in Telegram, where the words came from somebody the archive knows.
  authorId: number | null;
  text: string;
  addedAt: number;
  jobId: number | null;
  // When a running session was handed these words. Null is a note no running job has been handed.
  deliveredAt: number | null;
  // Whether the words may be in a run already: a change of the chat agent's made after them has been handed
  // to a job, or they were handed themselves. Taking them back does not reach into that run.
  carried: boolean;
  // "change" is the chat agent's change to the item's brief, the only kind a running job is handed; null is
  // words a person, a companion or a job added.
  kind: "change" | null;
  // When the words were taken back, and by whom. The row stays where it is and is marked instead
  // of being deleted, so the item still says that this was asked and then withdrawn; no reading
  // and no prompt carries it again.
  removedAt: number | null;
  removedBy: string | null;
}

// One change of an item's approval, given or taken back, as the item's approval record keeps it
// (docs/todo.md, 「Approval」): whose hand it was, the road it came by and when, in seconds. The way
// an approval came is null on one taken back.
export interface TodoApproval {
  id: number;
  approved: boolean;
  via: "owner" | "rule" | "grant" | null;
  whoKind: "person" | "agent" | "job";
  who: string;
  road: "console" | "verb" | "chat_tool";
  at: number;
}

// What the console asks the bot to do to one row. reorder carries the whole queue in its new
// order rather than a step, since dragging says where every row stands rather than which way one
// of them went. resolve carries the line that says why a finished item's unfinished note no longer stands.
export type TodoAction =
  | "approve"
  | "unapprove"
  | "move"
  | "top"
  // Behind every other row of the queue, in one step; the rest keep their numbers.
  | "bottom"
  | "drop"
  // Marked done by the owner himself, keeping whatever account the row already carries.
  | "done"
  | "reorder"
  | "resolve"
  // A new row raised out of an unfinished note being read, on the reader's own words about it.
  | "raise"
  // Words added to an item that already stands. They accumulate on the row rather than replacing
  // anything, and a job that is running when they land is handed them before it may report.
  | "append"
  // One of those lots of words taken back. It is marked rather than deleted, so the item keeps
  // the record that it was said; what it asked for reaches no later reading and no later prompt.
  | "unappend"
  // Set aside for now, and taken back. Neither is a deletion: the row keeps its place.
  | "hold"
  | "release"
  // Set aside as the owner's stop: whatever of the item is running is ended now, and what it finished is
  // kept to resume from once the hold is taken back. A reason is required.
  | "stop"
  // Which worker is to do it. An assignment, not a record: it is what the queue reads to decide
  // whose turn the item is.
  | "worker"
  // Whether its job fans out into branches. Off is what every item runs as unless it is turned on.
  | "cowork";

export interface TodoActionResult {
  ok: true;
  // The number of the row a raising made, so the console can name it back rather than leaving the owner
  // to go and find it. Absent for every other verb, which makes no row.
  raised?: number;
  // How many runs a stop asked to end. Absent for every other verb.
  stopped?: number;
}

export interface QuestionAnswerResult {
  ok: true;
}

// A question's clock stopped or started again: what the countdown has left while stopped, and
// the time the question now settles by.
export interface QuestionPauseResult {
  ok: true;
  pausedLeft: number | null;
  dueAt: number;
}

// Who said one turn of the talk about an item: the owner, or the chat agent answering them.
export type TalkSpeaker = "owner" | "bmo";

// One turn of the talk an item carries, kept with the item so reopening it reads the whole talk
// back.
export interface TodoTalkTurn {
  id: number;
  todoId: number;
  speaker: TalkSpeaker;
  text: string;
  saidAt: number;
}

// The talk as the panel reads it: the turns kept with the item, and where the chat agent stands on it —
// whether it is answering now, and why the last turn came back with nothing. Those two live in
// the running bot, and a bot that cannot be asked is answering nothing.
export interface TodoTalk {
  turns: TodoTalkTurn[];
  answering: boolean;
  failure: string | null;
}

// One turn of the talk about a document, kept in the console's own table: for the owner's words, the passage,
// heading and version selected as they were said, and whether the document was read translated then.
export interface DocumentTalkTurn {
  id: number;
  speaker: TalkSpeaker;
  text: string;
  saidAt: number;
  passage: string | null;
  heading: string | null;
  version: string | null;
  translated: boolean;
}

// The talk as the drawer reads it: the turns kept, whether the chat agent is answering the last one now, and
// why the last came back with nothing.
export interface DocumentTalk {
  turns: DocumentTalkTurn[];
  answering: boolean;
  failure: string | null;
}

// The memories and the document viewer's shapes: a memory row as the brain answers it and as the memories
// screen shows it, and the documents, their fragments, their search and their translation as the viewer reads
// them.

// How a watch stands, as the brain names it.
export type WatchState = "active" | "fired" | "lapsed" | "broken" | "cancelled";

// One memory as the brain answers it (the brain's `docs/boundary-api.md`, 「Memory rows」): what an agent is
// holding, what it has done since, how it ended where it has, and why it came down where it has. Nothing here
// deletes a row, so a row that is down and a row that is finished both stand beside the ones still open.
export interface MemoryRecord {
  id: number;
  // The agent whose memory the row is, by its registration name.
  agent: string;
  slug: string;
  // Which kind of thing the row is. A condition, not a type, decides how it attaches; a state is the one type
  // that always stands in its room while it is open.
  type: "promise" | "check" | "followup" | "situation" | "state";
  // The room it belongs to, or null where it is global.
  chatId: number | null;
  // Which kinds of room a global row reaches. A room's own row carries it and nothing reads it.
  reach: "owner" | "group" | "all";
  // What the row waits for. Empty is the row that attaches every turn without being asked.
  condition: string;
  // The event the row waits on instead of a condition, and when it first came.
  event: { kind: "deployed" | "job-ended" | "queue-changed"; item: number | null } | null;
  eventMetAt: number | null;
  action: string;
  // Whom the row is for, where it is for one person.
  forUser: number | null;
  active: boolean;
  lastHitAt: number | null;
  hits: number;
  setBy: number | null;
  setAt: number;
  messageId: number | null;
  todoId: number | null;
  // When the errand was finished and how it ended. Being finished is not being taken down: a kept promise was
  // never retired, and a withered rule was never finished.
  doneAt: number | null;
  doneText: string | null;
  downReason: string | null;
  downAt: number | null;
  candidateWhy: string | null;
  candidateAt: number | null;
  // When a state last moved, and null for every other type and for a state that has not moved yet.
  movedAt: number | null;
}

// The latest watch linked to a memory: by number and short name, with how it stands, and how many other
// watches served the same row before it.
export interface MemoryWatchView {
  id: number;
  name: string;
  state: WatchState;
  others: number;
}

// One memory as the console shows it: the row as the brain answers it, with the names the console reads its
// agent, its room and its people by, the message it was set from, and the watch serving it.
export interface MemoryRowView extends MemoryRecord {
  // What the owner calls the agent whose memory it is.
  agentLabel: string;
  // The room's name, or null where the row is global.
  room: string | null;
  // The person's latest name, where the row is for one person; their number where no name is known.
  forName: string | null;
  // Who set it, by the same name; null where the row does not say.
  setByName: string | null;
  // The message it was set from, in the row's room; null where the row names none, is global and so keeps no
  // room, or the receiver does not keep it.
  message: MemorySourceView | null;
  // The watch serving it; null where none is known.
  watch: MemoryWatchView | null;
}

export interface MemorySourceView {
  senderName: string;
  sentAt: number;
  text: string;
}

export interface MemoriesView {
  memories: MemoryRowView[];
}

export interface MemoryChanged {
  ok: true;
  memory: MemoryRowView;
}

// The document viewer (`docs/documents-viewer.md`). A document is named by its root and its path inside that
// root; the absolute path never leaves the server.

// One root as the viewer's list shows it: its label, who writes the documents under it, and whether it is read
// at all. A root kept by a unit that serves no route for its documents stands in the list unread.
export interface DocumentRootView {
  key: string;
  label: string;
  writer: string;
  available: boolean;
  // Where a root read from nowhere belongs and why it is not read here, the sentence its unread mark is named by;
  // null for a root that is read.
  unread: string | null;
}

// What a document's group is: a person's common book, or one room's books and rules.
export type DocumentGroupKind = "person" | "room";

export interface DocumentGroup {
  key: string;
  kind: DocumentGroupKind;
  name: string;
}

// What the brain's fragment row says about a document that is a piece a reference gate may attach (the
// brain's `docs/fragments.md`). A document with no row of its own carries none of this.
export interface DocumentFragmentView {
  // The library it is a piece of, as the brain names it, and what that kind is called on a screen.
  kind: string;
  kindLabel: string;
  // The room it belongs to, and the name that room is known by; both null where it belongs to every room.
  chatId: number | null;
  room: string | null;
  owner: number | null;
  // The agent whose row it is, by its registration name.
  agent: string | null;
  // The name its gate answers under.
  slug: string;
  // What the index entry says the piece is about: the words a gate picks it by.
  title: string;
  // The words it is asked for by beyond its title.
  keywords: string[];
  active: boolean;
  // When a turn last attached it, and how many turns have.
  lastHitAt: number | null;
  hits: number;
  // When a person set the standing themselves, and null where none has.
  handAt: number | null;
}

export interface DocumentEntry {
  root: string;
  path: string;
  title: string;
  size: number;
  group: DocumentGroup | null;
  // The row behind this document, where it is a reference fragment. Its title is what the list shows the
  // document by, since that is the line a gate picks it by.
  fragment: DocumentFragmentView | null;
}

export interface DocumentList {
  roots: DocumentRootView[];
  documents: DocumentEntry[];
  // Whether a document can be read translated: the translator is a unit's that serves the viewer no route yet.
  translation: boolean;
}

export interface DocumentView {
  root: string;
  path: string;
  label: string;
  writer: string;
  title: string;
  text: string;
  // The SHA-256 of the document's bytes.
  version: string;
  size: number;
  language: DocumentLanguage;
}

// One place a search of the documents found its words: the name, the title, or a line of the body with the
// text around it.
export interface DocumentMatch {
  root: string;
  path: string;
  title: string;
  where: "name" | "title" | "body";
  line: number | null;
  snippet: string | null;
}

// Where a question is answered: a document, and the mark of the heading inside it where one was found.
export interface DocumentSeekPick {
  root: string;
  path: string;
  title: string;
  heading: string | null;
}

export interface DocumentSeekResult {
  picks: DocumentSeekPick[];
}

// What the bot answers a launch with. The unit is up; the run itself is watched in the log.
export interface LaunchResult {
  ok: true;
}

// What the bot answers a word to a worker with. It is written down and handed to that worker's
// own session; what the worker answers reaches the owner's private chat, not this call.
export interface WorkerWordSent {
  ok: true;
}

// What the bot answers when the auto-progression is switched. The queue result is what the
// naming a resume asks for found; a pause names nothing and answers null. A resume lets go of the
// owner's pause alone, so it says whether a deployment's hold still stands.
export interface QueuePauseChanged {
  ok: true;
  paused: boolean;
  queue: string | null;
  deployHold: boolean;
}

// What the bot answers when the deployment's hold is let go by hand: what the naming the queue is
// then told found.
export interface DeployHoldReleased {
  ok: true;
  queue: string | null;
}

// The two languages a document is read in; a document is translated into the one it is not in.
export type DocumentLanguage = "ko" | "en";

// One part of a document as its translation stands: the original text of the part, and the
// translation where there is one, or the mark that it could not be translated with the translator's
// sentence saying why, where it said one.
export interface DocumentTranslationPart {
  part: number;
  source: string;
  text: string | null;
  failed: boolean;
  failure: string | null;
}

export interface DocumentTranslationFailure {
  reason: string;
  provider: string | null;
  model: string | null;
}

export interface DocumentTranslation {
  version: string;
  language: DocumentLanguage;
  target: DocumentLanguage;
  parts: DocumentTranslationPart[];
  // How many parts the bot is still translating; null where the bot could not be asked.
  pending: number | null;
  failure: DocumentTranslationFailure | null;
}

// One text of a work order — a task's instruction, or its result — as its translation stands. The
// same shape a document's translation has, with the name the parts are kept under so the screen
// knows which news is about this text.
export interface WorkTextTranslation extends DocumentTranslation {
  document: string;
}

// A work order as the console reads it: the order, and when each of its tasks ended — the finish
// of the job that ran it, in unix seconds, by task id. A task keeps its own start; its end is its
// job's, so nothing is recorded twice.
export type WorkOrderView = WorkOrder & { ended: Record<string, number> };

// A production role is an archive row; its name is what a task names.
export type WorkRole = string;

export type WorkPhase = "planning" | "research" | "synthesis" | "implementation" | "finalization";

export interface WorkTask {
  id: string;
  // The name the plan gave this one task, in the plan's own words. It is what the console calls
  // the task and what heads its result document, so a task is told apart from the three beside it
  // in the same stage by what it does rather than by its role and model, which they share. A task
  // no plan named — a build task written as a bare instruction, a round recovered from job rows —
  // carries none, and the screen puts the name of its group there instead.
  title?: string;
  role: WorkRole;
  model: string;
  // The tier the task runs at, as the deployment's tier plan names it.
  tier?: string;
  followRole?: boolean;
  legacyModel?: string;
  instruction: string;
  state: "pending" | "running" | "done" | "failed" | "skipped";
  // Why a task was decided against, and when. A skipped task is passed over like a done one and is
  // never counted as done: the record and the screen keep what was achieved apart from what was not.
  skip?: { why: string; at: number };
  attempt: number;
  recoveryProviders?: string[];
  // The provider and model the task's last execution actually went out on, and whether its executions
  // went out on more than one road. The order runner writes it; `model` stays the road the launch asked
  // for (bmo-job's docs/work-orders.md 「The model a step ran on」).
  ranOn?: RanOn;
  // How the bot's retry of a stopped order runs this task: on a fresh session, or on the retry model.
  retry?: { freshSession?: true; model?: string };
  unit: string | null;
  jobId: number | null;
  startedAt: number | null;
  // The durable FIFO request for a branch model slot. Waiting tasks keep it across bot restarts;
  // the same token becomes their lease before launch and is cleared only after a terminal fact.
  poolRequest?: string;
  // A cancelled wait has no physical attempt, so its next FIFO identity advances separately.
  poolGeneration?: number;
  // A runaway branch keeps its lease until the supervisor confirms the requested stop. These
  // fields make that wait restart-safe and prevent a stop request from being sent every tick.
  stopRequestedAt?: number;
  stopReason?: string;
  // The standing place this task borrowed. A builder turn runs in the worker's own checkout and
  // never takes one; a branch takes one when it is launched and keeps the number afterwards, so
  // what it ran in is still known when its result lands and when the list is written.
  slot?: number | null;
  // That this attempt has already been put in front of the owner for going nowhere. One attempt is told
  // about once, however many ticks pass over it afterwards, and a fresh attempt starts silent.
  told?: boolean;
  result: string | null;
  artifact: string | null;
  error: string | null;
  // The run of the order this task was done in, set only on a task carried over when a finished
  // order was reopened. Its id then wears the same number, so the round it belongs to is read off
  // both the record and the name the next turn is shown.
  round?: number;
}

// What one earlier run of a reopened order was for. The new plan is told it beside what that run
// found, since a finding is only worth carrying on from once it is known what it was looking for.
export interface WorkRound { round: number; intent: string; instruction: string }

// What a stage of the plan does: find things out, or check a finding or the plan. It is what the stage is
// called wherever a step is named (bmo-job's docs/work-orders.md 「What a step is called」); a stage the plan gave
// no kind finds things out.
export const STAGE_KINDS = ["investigate", "review"] as const;

export type StageKind = (typeof STAGE_KINDS)[number];

export interface WorkStage { title: string; kind?: StageKind; tasks: WorkTask[] }

export interface WorkOrder {
  todoId: number;
  intent: string;
  instruction: string;
  status: "draft" | "active" | "paused" | "done";
  phase: WorkPhase;
  stage: number;
  stages: WorkStage[];
  tasks: WorkTask[];
  history: WorkTask[];
  control: WorkTask | null;
  worker: string;
  cwd: string;
  chatId: number;
  model: string;
  // What the order's own line — every turn but a branch — last went out on, so an item whose model is
  // `auto` or was moved to another road is shown by the road it took (bmo-job's docs/work-orders.md 「The model a
  // step ran on」).
  ranOn?: RanOn;
  error: string | null;
  updatedAt: number;
  worktreeBaseline?: WorktreeState;
  // Which run of this order is the current one; absent is the first. It rises each time the order
  // is reopened, and every name a run leaves behind carries it so no run overwrites another's.
  round?: number;
  earlier?: WorkRound[];
  // That this order holds its worker's checkout: from its first launch there until it is done or
  // stops and has taken its change out of the way, no other order launches anything there
  // (bmo-job's docs/work-orders.md 「One checkout, one work order」). What the checkout held when it was handed
  // over is kept with it, since that is what tells the order's own change from what was open already.
  holdsCheckout?: boolean;
  checkoutBaseline?: WorktreeState;
  // The order's own turns launched in the checkout since it took it, each by its unit and when it
  // started: a stopped order takes as its own only what was written while one of them ran.
  checkoutTurns?: { unit: string; from: number }[];
  // What a stopped order that still holds the checkout is waiting on before it lets it go.
  releaseWait?: string;
  // Where the change a stopped order opened went: committed onto the checkout's branch, or onto a
  // branch of the order's own that is merged back when the order holds the checkout again.
  parked?: ParkedWork;
  // Files a merge-back left conflicted, for the order's next builder turn to resolve first.
  conflicts?: string[];
  // A close that could not finish at once: the order held its checkout, so it stands stopped with
  // the reason until the runner has taken its change out of the tree and let the checkout go, and
  // is done only then.
  closing?: { why: string; at: number };
  // That the owner stopped the order mid-run, why and when. The interrupted tasks went back to waiting and
  // the finished ones stand, so the order resumes from there once the item's hold is taken back
  // (bmo-job's docs/work-orders.md 「The owner stops an item now」); nothing it stopped is counted as a failure.
  ownerStop?: { why: string; at: number };
  // When the order last stopped: a stopped order's turn in its worker's queue is measured from it
  // (bmo-job's docs/work-orders.md 「A stopped work order's turn」).
  stoppedAt?: number;
  // How many of its stops since a task last completed were the work itself failing. The third sets
  // the item aside.
  failedStops?: number;
  // The attempts the final turns of this run counted before they handed the order back to its build for
  // the steps added ahead of them; the fresh final turn after those steps counts on from it.
  finalAttempt?: number;
  // How many times a final turn of this run has held its own item; the order waits on one such hold only.
  finalHolds?: number;
  // Where the runner's judgement of the turn last left this stopped order in its worker's queue, and
  // why it is not resumed yet; what running.ts and the console show (bmo-job's docs/work-orders.md
  // 「A stopped work order's turn」). Absent where the order is not stopped or not at the head.
  queuePlace?: WorkQueuePlace;
}

// What a checkout held at one moment: its uncommitted tracked changes and the paths git has never seen.
export interface WorktreeState {
  // Tracked paths with uncommitted changes, each against a digest of what its own patches say.
  // What they say is compared and not just the names: preserving somebody else's dirty file is
  // fine; changing that same file and leaving the new patch behind is not.
  tracked:Record<string,string>;
  // The same paths, each with the lines its uncommitted change adds and removes, as short digests.
  // They are what tells whose a file's change is: a line somebody else had open stays theirs however
  // many of their neighbours were committed or edited, while a line that was not open then is the
  // current actor's. A reading written before these were kept has none, and is compared by digest.
  lines?:Record<string,string[]>;
  // Paths git has never seen, by name. There is no patch to digest for one, so a path already
  // here is somebody else's whatever its bytes now say — which costs nothing, because an
  // untracked file refuses no job and is deployed by nothing.
  untracked:string[];
}

/** Where a stopped order's change went. */
export type ParkedWork =
  | { kind: "main"; at: number; commit: string; paths: string[] }
  | { kind: "branch"; at: number; branch: string; commit: string; paths: string[] };

// The receiver screens' shapes: a room's messages and pages, its removal, its sends and the voice briefing's switch, as the console answers them

// One table's rows a room's removal takes or leaves, as bmo-server counts them (docs/control-port.md,
// `/rooms/remove`): the columns named are cleared on rows that stay.
export interface RoomRemovalRows {
  table: string;
  rows: number;
  cleared?: string[];
}

// A folder the removal takes: how many files stand under it, and each one by name where the
// confirmation names them — the brain's documents of the room.
export interface RoomRemovalFolder {
  path: string;
  files: number;
  documents?: string[];
}

// An archive copy holding the room, with the rows it holds, or why it could not be read.
export interface RoomRemovalCopy {
  path: string;
  rows: number | null;
  failure: string | null;
}

// What removing a room's registration would take and leave, nothing written yet: the refusal where
// one applies, the warnings, and the settings naming the room that no declaration matches.
export interface RoomRemovalPreview {
  chat: number;
  refused: string | null;
  warnings: string[];
  goes: RoomRemovalRows[];
  stays: RoomRemovalRows[];
  pictures: string[];
  settings: { taken: string[]; undeclared: string[] };
  folders: RoomRemovalFolder[];
  copies: RoomRemovalCopy[];
}

// A room's chat providers as its dialog reads them (docs/web.md, the room screen's chat providers): every provider
// the receiver names, by its key and its own label, the keys the room is on in order, and whether that list was set
// or is the one the receiver reads off where the room stands.
export interface RoomProvidersView {
  providers: { key: string; label: string }[];
  on: string[];
  chosen: boolean;
}

// The pinned order as it stands once a room was pinned or let go: the room numbers, first to last.
export interface PinnedRooms {
  rooms: number[];
}

// What the removal took, and anything it could not remove.
export interface RoomRemovalAnswer {
  chat: number;
  taken: RoomRemovalRows[];
  cleared: RoomRemovalRows[];
  pictures: string[];
  settings: string[];
  folders: { path: string }[];
  copies: RoomRemovalCopy[];
  left: string[];
}

export interface MessagePage {
  messages: ArchivedMessage[];
  judgements: Judgement[];
  hasMore: boolean;
}

// One picture a room holds, as the picture viewer walks the room's pictures.
export interface RoomPicture {
  messageId: number;
  // The album it went out in, by the number of the album's first picture; null for a picture sent alone.
  album: number | null;
  senderName: string;
  sentAt: number;
  // The message's words as the archive holds them, its picture mark included.
  text: string;
  // What the kept file is, or null where the file is no longer kept.
  file: { name: string; bytes: number; type: string } | null;
}

// A stretch of a room's pictures in the room's order, with where it stands among all of them.
export interface RoomPicturePage {
  pictures: RoomPicture[];
  // Whether the room holds more past the stretch, on the side it was asked for.
  hasMore: boolean;
  // How many of the room's pictures stand before the first of the stretch, and how many it holds.
  before: number;
  total: number;
}

// What one web address in a room's message shows of itself. The page's picture is fetched by the
// console's own server and named here only by whether there is one.
export interface LinkPreview {
  // The address's place among the message's previewed addresses, which is how its picture is asked for.
  index: number;
  url: string;
  host: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
  image: boolean;
}

// Where a day of a room begins: the first message said that day or after it. Null where nothing
// was said from that day on.
export interface RoomDayStart {
  start: { messageId: number } | null;
}

export interface JudgementPage {
  judgements: Judgement[];
  hasMore: boolean;
}

// What the receiver did with what the owner typed: it said it in the room under their name, and
// the room's record now holds it under this number.
export interface SentMessage {
  messageId: number;
}

// What a send's key came to, as the screen asks for it while it checks a send that ran late: the
// answer it went out with, the refusal that came instead, a send still going, or no record of it.
export type SendOutcomeRecord<T> =
  | { state: "answered"; answer: T }
  | { state: "failed"; reason: string }
  | { state: "going" }
  | { state: "unknown" };

// How long the window the chat agent keeps in one room has left to run, in whole seconds from the moment the
// console answered; nought where none is open (the receiver's docs/wake.md).
export interface RoomWindow {
  openFor: number;
}

// One room, counted: the messages kept for it, the session kept for the room, and the runs made for it.
export interface RoomSpeaker {
  name: string;
  messages: number;
}

export interface RoomStats {
  chatId: number;
  messages: number;
  // What the room is made of: the people's messages, and each agent's under its own block.
  fromPeople: number;
  speakers: number;
  firstAt: number | null;
  lastAt: number | null;
  // When an agent last said something in the room, which is not the same as the last message.
  lastAnswerAt: number | null;
  // Who talks most, biggest first. No agent is among them: an agent answers, it does not talk.
  top: RoomSpeaker[];
  // Messages by the hour of the day, Seoul time, twenty-four of them starting at midnight.
  byHour: number[];
  // The room's own agents (docs/web.md, the room's session section), its designated ones first.
  agents: RoomAgentStats[];
}

// One agent of a room: what it said there and the session it answers the room from.
export interface RoomAgentStats {
  agent: string;
  // How the room calls it; null for an agent row that carries no label.
  label: string | null;
  messages: number;
  lastAnswerAt: number | null;
  // The session it keeps for this room, when it holds one.
  sessionMode: AgentMode | null;
  model: string | null;
  // What actually answered most recently. This may name another mode even when the Claude
  // session fields above describe the primary line; Codex threads live in fallback_sessions.
  lastMode: AgentMode | null;
  lastModel: string | null;
  lastEffort: string | null;
  // Its runs in this room and what they cost, each null where no unit counts them by room.
  runs: number | null;
  contextTokens: number | null;
  lastRunAt: number | null;
  weekTokens: number | null;
  totalTokens: number | null;
}

// What the console is answered with when it sends attachments: what each file became, and what
// stopped the ones that did not go. A send that stopped halfway is never retried whole, so what
// landed has to come back named.
export interface SentAttachments {
  sent: { name: string; messageId: number }[];
  failed: { name: string; reason: string }[];
  // The files the receiver took but did not answer for in time: they may well have gone, so they are
  // watched for in the room rather than called failed.
  checking: { name: string }[];
}

export interface VoiceBriefingChanged {
  ok: true;
  on: boolean;
  autoplay: boolean;
}

// The home, cache-siren, deployment and database screens' shapes.

// What moved the prefix a request lost, where the agency has it on record. The siren can tell that a prefix
// moved and never what moved it; this is the agency's side of that answer, matched to the request by the moment
// it happened in.
export interface SirenCause {
  // A document a session reads was written, the code went live, or the line a session is opened on moved with it.
  why: "reload" | "deploy" | "launch";
  // The document, or the commit, or the part of the line that moved.
  detail: string;
  at: number;
}

// One request as the cache siren saw it: which session made it, on what model, whether it went to the cache or
// burned new tokens, and how loud that is.
export interface SirenEvent {
  // The siren's own event number, which only grows and carries on across restarts.
  seq: number;
  // The second the request was made, which carries a press on the row to the place in the agent's log where
  // that request stands, and which the screen writes as a clock; null where the feed is too old to carry it.
  atSeconds: number | null;
  project: string;
  session: string;
  // Which agent made the request, by its registration name. A request the console has no ground to name one
  // for says nothing rather than guessing.
  agent: string | null;
  // The harness the request went out on, as the siren names it; null for a siren's own row, which a harness
  // did not make.
  mode: AgentMode | null;
  model: string;
  kind: string;
  level: string;
  note: string;
  // Why the prefix moved, where this request lost one and a move is on record in the gap before it.
  cause: SirenCause | null;
  newTokens: number;
  readTokens: number;
}

// The siren's own switch, the cache lifetime it assumes and the new tokens that make a cold or growth request
// red: the three settings `GET /settings` answers.
export interface SirenSettings {
  armed: boolean;
  ttlMs: number;
  threshold: number;
}

// The siren itself: whether it is up, the sums it keeps over its window, and how much new token has gone out
// lately — the last ten minutes a minute at a time, and the last one alone, both counted from the events it
// hands back. It keeps no quota source and no count of the files it watches, so the screen carries neither.
export interface SirenWatch {
  reachable: boolean;
  // When the sums start: the oldest event the siren holds.
  since: number | null;
  newLastMinute: number;
  perMinute: number[];
  // The sessions that saw a request in the last half hour.
  sessions30m: number;
  // The sirens raised over the window, and the sums the siren keeps over it.
  sirenCount: number;
  // Cached tokens over cached and new tokens, 0 to 1; null with neither.
  cacheShare: number | null;
  coldCount: number;
  settings: SirenSettings;
  events: SirenEvent[];
  // Whether the siren held more events than the screen asked for. It keeps a ring rather than a history, so
  // this says a reader who has scrolled to the foot has reached the end of what there is.
  hasMore: boolean;
}

// One table of the console's database, as the DB screen lists them. A table that keeps no row number has no
// hidden number to open a row by.
export interface DbTable {
  name: string;
  rows: number;
  hasRowid: boolean;
}

// One column, as the database describes it, and whether this console withholds its values.
export interface DbColumn {
  name: string;
  type: string;
  required: boolean;
  primaryKey: boolean;
  masked: boolean;
}

// One value in a row. A long one arrives cut, and says how long the whole of it is, so the screen never shows
// a shortened value as though it were the value.
export interface DbCell {
  text: string;
  cut: boolean;
  length: number;
}

// SQL NULL is nothing rather than empty, so it stands as nothing here too.
export type DbValue = DbCell | null;

// One row, with the number the table knows it by where it keeps one; that number is what the whole of a row is
// asked for by.
export interface DbRow {
  rowid: number | null;
  cells: DbValue[];
}

// One page of one table: what the table is made of, what it was created as, the page itself and how many rows
// the whole table has under the same search.
export interface DbPage {
  table: string;
  columns: DbColumn[];
  ddl: string;
  rows: DbRow[];
  total: number;
  page: number;
  pageSize: number;
  ms: number;
}

// What a typed query answered with. The columns are the query's own, so they are names alone; `cut` says the
// answer stopped at the row cap rather than at the end of the answer.
export interface DbResult {
  columns: string[];
  masked: boolean[];
  rows: DbRow[];
  cut: boolean;
  ms: number;
}

// One row of one table with nothing left out: every column the table has, and the whole of each value.
export interface DbRowDetail {
  columns: DbColumn[];
  row: DbRow | null;
}

// A deployment as the title bar reads it (docs/web.md, 「Deployment in the title bar」), out of the testbed's
// progress record. A run whose process went without ending its record is cut off, and its end is the record's
// last write.
export interface DeployRunView {
  /** The unit whose run it is, by its deploy root's folder name; none for a reader not told it. */
  unitName: string | null;
  phase: "running" | "ended" | "cut";
  startedAt: number;
  endedAt: number | null;
  outcome: DeployEnding | null;
  commit: string | null;
  /** Every stage the run means to pass, in order. */
  plan: DeployStage[];
  stages: { stage: DeployStage; at: number }[];
  /** The heavy steps ended so far, each with the stage it ended in and, for a part of its stage, which part. */
  steps: DeployStep[];
  /** The steps of the stage under way still to come, in order. */
  ahead: DeployStepAhead[];
  /** The heavy step under way, with when it began. */
  running: DeployStepUnderWay | null;
}

// What `/api/deploy` hands a tab. A member is told only of a run under way and of the release, and `detailed`
// says the rest was left out.
export interface DeployView {
  /** The build the console server runs, which a page older than it compares its own with. */
  release: string;
  detailed: boolean;
  run: DeployRunView | null;
  hold: DeployHold | null;
}

/** One line of the deployment unit's journal. */
export interface DeployLogLine {
  at: number;
  text: string;
}
