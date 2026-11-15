// The shapes the console's server and its screens share. A shape another unit answers with is written here
// as that unit's document states it, since the console reads every unit over HTTP and imports none of their
// code (docs/boundary.md, 「Calls the console makes」). Each screen's group adds the shapes it reads.

import type { PushKind } from "./config";
import type { DeployEnding, DeployStage, DeployStep, DeployStepAhead, DeployStepUnderWay } from "./deploy-progress";
import type { DraftSummary } from "./drafting";

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
/** What the jobs that carried an item say of it, for its run record and its stages (docs/web.md, the TODO modal's state tab). */
export interface ItemRuns {
  // How many jobs ran it, and their time added up in seconds, null before one ended.
  attempts: number;
  seconds: number | null;
  // The provider and model its latest job answered on, as that job's answer line names them.
  ranOn: RanOn | null;
  // The newest plan its latest job laid out with its plan tool.
  plan: { title: string; state: "pending" | "running" | "done" }[];
  // Its latest job, where one ran as a run of its own, as a job line reads it: the agent it ran as and the run to open
  // its log at, when it started and ended, its tool calls and its tokens.
  latest: JobLine | null;
}

export interface RanOn {
  provider: string;
  model: string;
  changed: boolean;
}

// What chose a job's provider and model, the first of four that stands: its item's `model`, its role's forced provider,
// its repository's pin, or its role's order (the agency's `docs/repositories.md`, 「A model an item names」).
export type JobChosenBy = "item" | "forced" | "pin" | "order";

// What the TODO rows name before anything of an item has run (docs/web.md, the TODO panel's section): each worker's own road, and
// the road the running job of each item went out on, both `provider/model` with a registered engine under its model's
// own name, and what chose each running job's road where the agency says.
export interface TodoModelPlan {
  workers: Record<string, string>;
  // Each agent's own road by its name, for an item that names its agent.
  agents: Record<string, string>;
  running: Record<number, string>;
  chosenBy: Record<number, JobChosenBy>;
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
/** A running item's job in the testbed's queue, as its TODO row's line says it (docs/web.md, the TODO panel's section). */
export interface ItemTestbedTurn {
  itemId: number;
  // The command as the testbed names it.
  command: string;
  // Its place in its lane's line, counted from one; null while it holds a seat.
  place: number | null;
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
}

// A place in a room's line: when the message was sent, and of those sent in one second the order
// the archive took them in.
export interface ReadPlace {
  sentAt: number;
  order: number;
}

// A message's id exactly as the receiver numbers it: the decimal digits of a signed 64-bit integer, which a
// JavaScript number holds without rounding only up to 2^53 (docs/web.md, 「A message's id」).
export type ExactMessageId = string;

// How far the signed-in reader has read a room: how many of its messages they have not read, the
// first of them, which the room opens at, and the place read to that the count runs from — null
// where the archive keeps no marks (docs/web.md, 「Sidebar」). It is the answer to a room marked read too.
export interface RoomRead {
  unread: number;
  firstUnread: ExactMessageId | null;
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

// The person number a chat agent's own words stand under, by which it wears that person's picture (docs/web.md,
// 「Profile photos」).
// The person number a chat agent's own words stand under, none where the receiver names none, and the rooms it speaks
// in, newest first, whose pictures stand for it where its number keeps none.
export interface AgentFace {
  name: string;
  personId: number | null;
  rooms: number[];
}

export interface MessageAttachment {
  id: number;
  kind: "audio" | "video" | "animation" | "document" | "sticker";
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

// The formatting a Telegram message's words were sent with, read off the entities of the metadata it arrived
// with and placed on the same base as the expressions, so its offset runs from the head of the words the row
// stands. Kinds overlap and nest as the chat sent them; only the address of a text link and the language of a
// pre ride on the kind.
export type TelegramFormatKind = "bold" | "italic" | "underline" | "strikethrough" | "spoiler" | "code" | "pre" | "link" | "quote" | "expandable_quote";

export interface TelegramFormat {
  offset: number;
  length: number;
  kind: TelegramFormatKind;
  // The address a text link opens, taken for the row only when it is a web address.
  url?: string;
  // The language a pre's fence named.
  language?: string;
}

// What a message's words stand under: the custom emoji and the formatting entities read off its metadata, in
// the coordinates of the words as the archive holds them.
export interface TelegramWords {
  expressions: TelegramExpression[];
  formats: TelegramFormat[];
}

// What a reply shows of the message it answers: who said it, what it said, and what it carried — a
// kept picture, and the first file it kept — so the quote can stand a small preview of it. A message
// the archive does not hold has no speaker, no words and nothing carried.
export interface ReplyQuote {
  messageId: ExactMessageId;
  senderName: string | null;
  text: string;
  pictured?: boolean;
  attachment?: MessageAttachment | null;
}

// The room's situation note as the round that judged a message read it (the receiver's `docs/drafting.md`): the note's
// text, and whether that round wrote it afresh.
export interface Situation {
  text: string;
  changed: boolean;
}

// The agents answering a room, by their own registration names (the receiver's `docs/api.md`, `GET
// /rooms/{roomId}/answerers`): the default answerer, the room's voice and every agent standing in the room.
export interface RoomAnswerers {
  default: string;
  voice: string | null;
  agents: { name: string }[];
}

// A room's situation note as it stands, with when it last changed (epoch milliseconds), both null where the room has no
// note yet.
export interface RoomSituation {
  text: string | null;
  updatedAt: number | null;
}

// Where a forwarded message came from, as the record marks it (the receiver's `docs/api.md`, 「Messages」): the room, the
// message and who said it there.
export interface ForwardedFrom {
  room: number;
  messageId: ExactMessageId;
  senderName: string;
}

export interface ArchivedMessage {
  chatId: number;
  messageId: ExactMessageId;
  senderId: number | null;
  senderName: string;
  sentAt: number;
  text: string;
  imagePath: string | null;
  replyToMessageId: ExactMessageId | null;
  // The answered message as a reply shows it, when this message is a reply.
  replyQuote?: ReplyQuote | null;
  // Where this message was forwarded from, on a message the record kept as a forward; absent on every other.
  forwardedFrom?: ForwardedFrom | null;
  // The room's situation note as the round that judged this message read it; absent where no round judged it under one.
  situation?: Situation | null;
  // What a voice note was heard as: the words, how long the recording ran in seconds, and whether it was heard
  // (`heard`) or could not be (`failed`). Null on any other message and, for the words, on one that could not be heard.
  transcript?: string | null;
  voiceSeconds?: number | null;
  voiceState?: string | null;
  attachments?: MessageAttachment[];
  expressions?: TelegramExpression[];
  // The formatting entities its words were sent with, on the same base as the expressions; absent where none
  // were read, which draws the words as they were before formatting was read.
  formats?: TelegramFormat[];
  // Whether an agent sent this message, whichever supervisor it is, as the server reads it off the archive;
  // a screen draws an agent's answer by it rather than by any name. Absent where the server did not
  // say, which a screen reads as a person's words.
  agent?: boolean;
  // The registration name of the agent whose answer this is, where it went out in the owner's own account and so
  // stands in the archive under the owner's number and name; absent on every other message.
  voicedBy?: string;
  // The registration name of the agent whose words an agent's message is, wherever it went out — a notice said in
  // the room's voice the room's answering agent's — so its row wears that agent's face; absent on a person's words.
  speaker?: string;
  // Whether the bot sent this message as the service rather than as the chat agent — a system notice, which a
  // screen stands as a system line rather than an answer. Absent where the server did not say.
  notice?: boolean;
  // Whether the receiver's record holds the message under the thinking kind: an agent's line that is no answer, which
  // a screen stands under its own label. Absent on every other message.
  thinking?: boolean;
  // How long the room waited for this answer, in whole seconds, on messages an agent answered with.
  // Null for everything anybody else said, and for an answer the archive holds no measurement
  // of.
  answerSeconds?: number | null;
  // The round of the chat agent's session this message answered in, on a message it sent in one.
  round?: string | null;
  // The album a picture went out in, named by the number of the album's first picture, on every
  // picture of a send of several; null on everything else.
  album?: ExactMessageId | null;
  // What that round cost, on the last message the round sent and on no other.
  spend?: RoundSpend | null;
  // How the round's draft process made its answer, on that same last message: a summary of the round's log,
  // read with the page.
  drafts?: DraftSummary | null;
  // Where what the turn did is kept, on that same last message: the room opens it from here and
  // the lines themselves are read out of the log when it does.
  actions?: TurnActionsRef | null;
  // The voice briefing that speaks this line, where one was asked for it.
  briefing?: MessageBriefing | null;
  // Whether the room is still reading what this line's round spent and did, on the round's last answer: the room's own
  // mark while its read of the round's figures is on its way, never one the server sets.
  figuring?: boolean;
  // On a voice briefing that speaks a line standing in the room, that line: the room stands the
  // voice on it rather than as a row of its own.
  briefs?: ExactMessageId | null;
  // On a summary whose round has not sent its line yet: the room stands it as no row until the
  // round ends, on the line it is tied to or as its own row where the round sent none.
  awaitsLine?: boolean;
  // What the room's record keeps done to the message (the receiver's docs/messages.md, 「What an agent can send
  // back」): when it was edited, deleted and pinned, in unix seconds, null where it was not, and its reactions.
  editedAt?: number | null;
  deletedAt?: number | null;
  pinnedAt?: number | null;
  reactions?: MessageReaction[];
}

// One reaction on a message: its emoji, and who put it there, an agent's name or a person's number.
export interface MessageReaction {
  emoji: string;
  by: string;
}

// A line's full reading (docs/web.md, the room screen's chips): nothing made yet, being made, there to play, failed
// to be made, or stopped before it stood and to be asked for again. Once it is there, where its sound is served from — the voice message it went out as,
// for a line read out before readings were kept, or the reading kept on the line — and that sound.
export interface MessageBriefing {
  state: "idle" | "making" | "ready" | "failed" | "stopped";
  source: "voice" | "kept" | null;
  voiceMessageId: ExactMessageId | null;
  sound: MessageAttachment | null;
  // The voice engine's briefing the line's full reading is, where one was asked for.
  briefingId?: number | null;
}

// One briefing as the voice engine keeps it (its `docs/boundary-api.md`, 「Briefings」): the room and the line it
// speaks — none while a summary awaits its line — whether it is a line's summary or its full reading, its title,
// where it stands, how long it runs, whether a listener plays it by itself, the voice message an old one went out
// as, whether the engine spoke it, and when it ended, in epoch milliseconds.
export interface VoiceBriefing {
  id: number;
  chatId: number;
  messageId: ExactMessageId | null;
  kind: "summary" | "full";
  title: string | null;
  state: "waiting" | "done" | "failed" | "stopped";
  durationMs: number | null;
  plays: boolean;
  voiceMessageId: ExactMessageId | null;
  spoken: boolean;
  finishedAt: number | null;
}

// A secret the server's store holds, by its name (docs/web.md, 「Organisation settings」, the secret store tab): its
// size and when it last changed. No type of the console carries a secret's value back.
export interface KeptSecret {
  name: string;
  bytes: number;
  changedAt: number;
  // The key of the kind the secret's file reads as, where the store's list reads one.
  kind?: string;
}

// Every secret the store holds, in the order of their names.
export interface SecretList {
  secrets: KeptSecret[];
}

// The voice briefing's one switch, the receiver's: whether anything is spoken at all. A briefing it speaks plays as
// it arrives, so nothing else stands beside it.
export interface BriefingSwitches {
  on: boolean;
}

// What asking for a line's full reading answered: being made, or there already, and the briefing it is — none yet
// while the room's agent writes the script it is spoken from, the engine's stream then naming it as it is taken in.
export interface BriefingReading {
  state: "making" | "ready";
  briefingId: number | null;
}

// A finished turn's own actions, as a message points at them: the agent whose log holds the run,
// the run its lines stand under, and how many documents it was handed and calls it made — enough for
// the room to stand a chip for each without reading a single line of the log — beside what the
// round wrote down, which is carried whole.
export interface TurnActionsRef {
  agent: string;
  // Every run of the round by the name its log lines are kept under: its own turn, then each question its draft
  // process asked the same session.
  runs: string[];
  documents: number;
  // The reference documents the turn went on holding from earlier in its session, which went as a
  // one-line mark: listed with the rest, but not counted among what it was handed.
  held: number;
  tools: number;
  // The calls among them that read from the brain.
  brain: number;
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
  // The tokens the session's context held as the last of the round's runs that reported it closed: what each
  // request carried in again, so the cache read over it says how many requests the round made. Absent or null
  // where no run reported it.
  contextTokens?: number | null;
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
  messageId: ExactMessageId | null;
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
  // What opened that round and what its gates were offered, where either was read.
  opening?: RoundOpening;
  // What a picker's or the matcher's model was asked of its candidates, each line exactly as the model read it and
  // its answer, null where the answer was not read; none on every other judgement.
  lines?: JudgementLine[];
}

// One line a gate's model read of a candidate, and what it answered of it.
export interface JudgementLine {
  line: string;
  answer: string | null;
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
  kept: KeptCounts;
  capped: number;
  rules: string[] | null;
}

// How many candidates each of a gate's rules kept, as the gate's offers record counts them: by an item number the
// turn named, by a keyword, by a word, by a person and by recency.
export interface KeptCounts {
  item: number;
  keyword: number;
  word: number;
  person: number;
  recent: number;
}

// What one round settled and was offered: its quiet instructions as the receiver reads them, and its offers
// record as the gate hands it with each of the round's verdicts.
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

// One report bmo-job keeps of an item: what the one doing it told of it, as its kind — the closing account, an
// account on the way, or why the item waits — the words whole, who wrote them, and when, in unix seconds.
export interface TodoReport {
  id: number;
  kind: "final" | "progress" | "held";
  body: string;
  actor: string;
  at: number;
}

// One entry of an item's review as bmo-job keeps it: its kind, the stage it is about (null for the work whole) and
// the round, the words whole, who wrote them, the check a question, rejection or pass was on, and when, in unix
// seconds.
export interface TodoReview {
  id: number;
  kind: "opened" | "report" | "question" | "answer" | "rejection" | "pass" | "escalation" | "ruling" | "accepted";
  stage: number | null;
  round: number;
  body: string;
  actor: string;
  check: string | null;
  at: number;
}

// One piece of work the owner is owed, as the archive's todos table holds it. The instruction
// is the owner's words and the chat agent's reply verbatim, which is why an item is worth keeping at all.
export interface TodoItem {
  id: number;
  title: string;
  instruction: string;
  // The organized instruction the chat agent keeps for the item's jobs, in the original a job reads. It is null
  // until a job of the item is launched or the chat agent rewrites it.
  brief: string | null;
  requester: string;
  requesterId: number | null;
  chatId: number | null;
  // Whether an approver's approval stands on it, and, below, whether the chat agent recommended it, which moves
  // nothing; neither says whether it still waits on the owner.
  approved: boolean;
  // Whether the item waits on the owner's approval: its state is `draft`, which is the job service's one word on it.
  // An item past it carries no approval where it opened by itself under an unattended label.
  awaitingApproval: boolean;
  recommended: boolean;
  done: boolean;
  // Whether a job of this item is under way, read from the run itself: the item has a job row
  // that has not finished. The state line is a word somebody typed, so it is not asked.
  running: boolean;
  // The state the job of this item stands in right now, as the agency names it: `starting` while its worker is
  // launched, `running` while its turn goes, and `waiting` while it waits before it launches — for its agent's seat, a
  // road or a card. Null or absent where no job of it is under way.
  liveState?: "waiting" | "starting" | "running" | null;
  // Whether the item is done in bmo-job while the agency's job for it still goes: its report is still going out,
  // until the agency says the job ended.
  reporting?: boolean;
  priority: number;
  status: string;
  // The model the item names its work for, its `model` label: the launch seats its job on whichever agent of its role
  // running that model is free, unless `agent` names one (the agency's docs/repositories.md, 「An agent an item
  // names」). Null where it names none or `auto`.
  model: string | null;
  // The agent the item names its work for, its `agent` label, which stands over `model`; null where it names none.
  agent: string | null;
  // The role whose agents a `model` label is taken among, its `role` label; null or absent where it names none and the
  // role is the one its job runs as.
  role?: string | null;
  // The agent the job under way for this item runs on, the agency's job `agentName`: what launched it, which a change
  // of the item's label never moves. Null or absent where no job of it is under way.
  jobAgent?: string | null;
  // The provider and model the item's work last went out on, which `model` — `auto` above all — does
  // not say: a co-work item's own line as its order keeps it, any other item's latest run. Null until a
  // run of it has gone out (bmo-job's docs/work-orders.md 「The model a step ran on」).
  ranOn: RanOn | null;
  // Which worker is to do this work, and so which checkout it will be done in. It is an
  // assignment and not a record: the queue reads it to decide whose turn the item is, and the
  // job is launched on the worker it names. Null is unassigned, which is the built-in worker.
  worker: string | null;
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
  // Where the job's close stands, as bmo-job's close writes it on the item (its docs/cli.md, 「`bmo-job job
  // close`」): its check and suite under way, or its commit handed over and waiting to go live, with that commit.
  // Null where the item's labels say neither.
  closing: { phase: "testing" | "waiting-batch" | "waiting-live"; commit: string | null } | null;
  // Held by its job only until its close's commit goes live, its last check needing that commit (docs/web.md, the
  // TODO panel's section): it stands in the queue as waiting with the words of its way live, never as held.
  deployHeld: boolean;
  // Whether a deployment under way carries the item's commit: set by the panel from the deploy view it reads, which the
  // board does not carry, and absent on the board as the server answers it.
  deploying?: boolean;
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
  // Every report kept of the item, the closing ones first, the latest of them leading, and the rest after
  // them in the order they were written, and what the work left behind. Both empty on an item nobody has reported on, and on one
  // finished before a closing job was asked for its account.
  reports: TodoReport[];
  // How many times its work was sent back by its review.
  rejections: number;
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
  // The rows of the queue whose close merged their commit and that wait, no run going, for its deployment, those a
  // deployment under way carries among them.
  deploy: number;
  // Of those, the rows a deployment under way carries: counted by the panel from the deploy view, 0 as the server
  // answers it.
  deploying: number;
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
export type QuestionSettler = "owner" | "deadline" | "recommendation";

// One question a job stopped to ask the owner, as the console reads it. The job is standing
// still while it is open, which is why the console shows it rather than leaving it to the chat.
export interface JobQuestion {
  id: number;
  // The item the asking job is a run of. A question is read back with its item afterwards.
  todoId: number;
  // Who asked: the name the asking run gave, which its talk turns carry too.
  asker: string;
  question: string;
  options: string[];
  // Which option the job would take by itself, counted from zero; null where its recommendation names no choice — a
  // free answer, or none at all — so no choice wears the mark. The wait settles on it.
  recommended: number | null;
  // The free answer the job would take by itself where it names no choice; null on every other.
  recommendation: string | null;
  // The one line saying why the job would not decide this itself; empty where it named none.
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
  messageId: ExactMessageId | null;
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
  // A worker run alone: the repository it runs in and the checkout of it, each null where the agency names none.
  repository?: string | null;
  checkout?: string | null;
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
// Who answers a turn, as the receiver names it on every event of the turn and on the turn its picture holds: the
// number the agent's words stand under in the room, or null where the room gives it none, and the agent's
// registration name, which tells the default answerer's turn from another supervisor's and is never shown as it is.
export interface TurnSpeaker {
  id: number | null;
  name: string;
}

export interface ChatTurn extends TurnReceived {
  chatId: number;
  since: number;
  // The newest message the round carries, which it reads last and which its gates and answer judge;
  // null for a round carrying none, absent from a bot that does not say.
  messageId?: ExactMessageId | null;
  // Whose turn it is, so a room two agents answer holds a turn of each at once; null where the room gives none.
  speaker?: TurnSpeaker | null;
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
  messageId: ExactMessageId;
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

// Where a task a supervisor delegated to its double stands: waiting for a slot, running on one, or ended.
export type DelegationStage = "waiting" | "running" | "ended";

// A task a supervisor delegated to its double, as the agency lists it (its `docs/api.md`, `GET /delegations`): what it
// was asked to do, which role's run carries it, who asked, and what it came to once it ended.
export interface DelegationView {
  token: string;
  title: string | null;
  askedBy: string | null;
  stage: DelegationStage;
  // The agent its turn runs on; null before it is bound.
  agentName: string | null;
  role: string;
  askedAt: number;
  runningSince: number | null;
  endedAt: number | null;
  outcome: string | null;
}

// The agency's page of delegations: the ones still waiting or running in the order they were asked, then the latest
// ended.
export interface DelegationPage {
  items: DelegationView[];
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
  // A turn of the round's draft process ended, or the process did, as the receiver's round log wrote it
  // (the receiver's docs/drafting.md, 「The round log」).
  | "draft"
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
  // The record kept an act on a message — a reaction, a pin, an edit or a delete — and the message is read again.
  | "message-changed"
  // A room's window was opened, moved on or shut. How long it has left is read from the archive.
  | "window"
  // A room's window closed, by its time or early, as the receiver tells it once (the receiver's docs/wake.md, 「The
  // names and the window」).
  | "window-closed"
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
  | "agency-turn"
  // One of an agent's runs or sessions began, moved or stopped, as the agency publishes it: what a log and a
  // stepper of that agent read again on.
  | "agency-run"
  // The signed-in account read a room up to a message, in this tab or another, on the console's own word.
  | "room-read"
  // One of the voice engine's briefings was taken in, ended, or named its line (its `docs/boundary-api.md`,
  // 「Events」).
  | "voice-briefing"
  // The voice engine stopped a room's briefings, or every room's, and the player falls silent for them (its
  // `docs/boundary-api.md`, 「Briefings」).
  | "voice-briefings-stopped"
  // A job the agency runs for a room started, changed or ended. What runs now is read from the agency's job
  // list, so the event says only that it moved.
  | "worker-run"
  // A supervisor, a role or a repository changed or went, or a role's slot was asked, let in or given back, as the
  // agency publishes it: what the agent lists and the agents' state read again on.
  | "agency-catalogue";

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
  messageId: ExactMessageId | null;
  stage?: string;
  verdict?: string;
  detail?: string | null;
  // A judgement event: the lines its model read of its candidates, where the stream hands them.
  lines?: JudgementLine[];
  // A live event belongs to no room and carries the whole picture rather than a change to it.
  live?: LiveSnapshot;
  // A run-started event alone: what the turn was handed, as it stood when the round opened.
  received?: TurnReceived;
  // A turn's events: who is answering, so each speaker's ending closes that speaker's turn and not another one
  // going in the same room. Null on an event that is no turn's, or of a room no turn has begun in.
  speaker?: TurnSpeaker | null;
  // A run-progress event alone: where the turn is and what its stream has counted so far.
  progress?: RunProgress;
  // A sent event and a draft event: the round the answer went out in, which every message of that answer names.
  round?: string;
  // A draft event alone: the row of the round log it tells — its number in the process, its question's name, its
  // kind and how it ended — never the answer itself.
  number?: number;
  question?: string;
  kind?: string;
  outcome?: string;
  // A draft event of kind `start` alone: how many questions the process asks, the one it tells being `number` of them.
  count?: number;
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
  // Where the event itself says how the order stands. An event that only says it moved leaves it off, and the
  // panel reading it asks the job service for the order as it stands.
  workOrder?: WorkOrderProgress;
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
  type: "voice-briefing";
  // What the engine said of the briefing, and the briefing as it stands with it.
  phase: "created" | "ended" | "changed";
  voice: VoiceBriefing;
  todoId?: never;
  workOrder?: never;
  document?: never;
  review?: never;
} | {
  type: "voice-briefings-stopped";
  // The room whose briefings were stopped, or null for every room's; the event's `chatId` is 0 either way.
  stoppedRoom: number | null;
  // The briefings the stop ended.
  briefingIds: number[];
  todoId?: never;
  workOrder?: never;
  document?: never;
  review?: never;
} | {
  type: "agency-run";
  // The agent the run or the session is of, and the run where the event names one; null where it names none.
  agent: string | null;
  run: string | null;
  todoId?: never;
  workOrder?: never;
  document?: never;
  review?: never;
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
  type: Exclude<BotEventType, "work-order" | "todo-talk" | "document-talk" | "document-translation" | "code-review-talk" | "code-review" | "agency-turn" | "agency-run" | "voice-briefing" | "voice-briefings-stopped">;
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

// A line a running turn wrote and then went on working, shown as its words in progress: the words, run into one
// line and redacted by the bot, and how many actions the turn had made, those dropped counted, when the call it led
// to was made.
export interface SaidLine {
  text: string;
  before: number;
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
  // The turn's last few progress lines, oldest first; a bot that tells none leaves it out.
  said?: SaidLine[];
  // The last thinking block the turn's run wrote, redacted and cut by the bot, on a turn whose picture carries one.
  thinking?: string | null;
  // The Job the turn waits on, in the waiting phase alone.
  waitingFor?: EngineHold | null;
}

// One gate run as the archive kept it: the verdict is what it ended with, and no detail is
// read here — no screen of what runs shows anything anyone said.
export interface GateRunRecord {
  id: number;
  agent: string;
  chatId: number;
  messageId: ExactMessageId | null;
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
  // The role it ran as, which is the name its log is kept under and the screen it belongs to.
  worker: string;
  // The repository it ran in and the checkout of it, each null where the agency names none.
  repository?: string | null;
  checkout?: string | null;
}

// What the status route is answered with: the bot's picture of now, and the archive's
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
  live: LiveRun[];
  compacting: ChatCompaction[];
  liveAt: number | null;
  gates: GateRunRecord[];
  runners: RunnerRecord[];
  jobs: JobRecord[];
}

export interface AccountUser {
  name: string;
}

// A user's job title and contact details (docs/accounts.md, 「Users and senders」); every field is empty where the
// account keeps none.
export interface UserProfile {
  jobTitle: string;
  landline: string;
  mobile: string;
  email: string;
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

// Which of the agency's two axes or its places an entry of the agent list is (the agency's docs/agents.md, 「Two
// axes」): a supervisor, a role, or a repository.
export type AgentAxis = "supervisor" | "role" | "repository";

// One run a role's slot is let in for now, as the agency's `GET /slots` answers it: the path it works at, the
// provider and model it went out on, the source that asked for it, since when it holds the slot, in epoch
// milliseconds, the role session it is bound to, the run its binding names — for a slot on a role session, the run of
// that session's turn while one runs —, the job whose run it is, and the line naming its work. A field the answer
// does not carry stands as none.
export interface RoleSlotRun {
  role: string;
  path: string | null;
  provider: string | null;
  model: string | null;
  source: string | null;
  since: number | null;
  session: string | null;
  runName: string | null;
  jobId: number | null;
  title: string | null;
  // The agent of the role the run was let in on; none where the agency names none.
  agent: string | null;
}

// One checkout of a repository, as the agency answers it: its name, path and node, and the job holding it where one
// does — the job, its item and the role it runs as —, each none where it is not held or the answer does not say.
export interface RepositoryCheckout {
  name: string | null;
  path: string | null;
  node: string | null;
  jobId: number | null;
  itemId: number | null;
  role: string | null;
}

// One entry of the console's agent list: a supervisor, a role or a repository, as the agency's own lists answer it.
// Every field belongs to one axis and stands empty — null, false, nought or no entries — on the others.
export interface AgentSummary {
  name: string;
  kind: AgentAxis;
  // What the entry is called: a supervisor's and a repository's label, and a role's name alone. Null where the answer
  // names none.
  label: string | null;
  // The other names the owner calls a supervisor by.
  aliases: string | null;
  // The mark the agency answers for a supervisor and a repository; null where it answers none.
  icon: string | null;
  // How a supervisor's session is carried (the agency's docs/supervisors.md): one session across its rooms or one in
  // each, its window's turns or its settings' pieces, and whether it answers every room that names nobody.
  sessionScope: "agent" | "room" | null;
  turnShape: "window" | "pieces" | null;
  defaultAnswerer: boolean;
  // The rooms a supervisor's sessions hold, each with the moment its log last took a line there where that is known.
  sessions?: { chatId: number; lastAt: number | null }[];
  // A supervisor's road, or the provider a role's next run goes out on with the model and effort its roads name there,
  // and why a role's runs wait; each null where the agency names none.
  provider: string | null;
  model: string | null;
  effort: string | null;
  waitingFor: string | null;
  // A role's line, how many of its runs go and wait, its cap, and the runs its slots hold now.
  line: string | null;
  running: number;
  waiting: number;
  maxConcurrent: number | null;
  runs: RoleSlotRun[];
  // A repository's path, the node it stands on, and its checkouts.
  path: string | null;
  node: string | null;
  checkouts: RepositoryCheckout[];
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
  // The agent under whose name the job's log lines stand: the worker it ran on, the agent of its session.
  agent: string;
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
  // What the job's turn spent, every model's together: the agency's own figure once the job has ended, and while it
  // runs what its run's requests have reported so far. Null where nothing has been reported.
  spent: TokenSplit | null;
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
  // What a provider paid by the request has left, where the agency reads one.
  balance: UsageBalance | null;
}

// What an account or a provider has left in money, as its balance reader last read it: the amount, its currency
// and when it was read, in epoch seconds.
export interface UsageBalance {
  amount: number;
  currency: string;
  seenAt: number;
  // The request allowance read with it, where its provider states one: how many requests of the day are used,
  // the day's ceiling, how many are left, and what the allowance covers as the agency's word for it, or null
  // where it covers every request.
  requests: { used: number; limit: number; left: number; scope: string | null } | null;
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
  balance: UsageBalance | null;
}

// A provider's own road and what it has left in money: one that is switched on and keeps a balance, other than
// the slot the chat runs on.
export interface RoadUsage {
  provider: string;
  label: string;
  balance: UsageBalance;
}

export interface UsageView {
  // Null where the agency names no slot.
  active: ActiveUsage | null;
  // Each provider's own road that keeps a balance, in the order the agency lists the providers.
  roads: RoadUsage[];
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
// An agent the agency registered: its key, and what became of its brain — made, kept where one already stood,
// none where it is given none, or failed (the agency's `docs/api.md`, 「agents」).
export interface AgentRegistered {
  name: string;
  brain: "made" | "kept" | "none" | "failed";
}

export interface RoleView {
  name: string;
  label: string;
  bundles: { name: string; label: string }[];
}

export interface AgentList {
  reachable: boolean;
  // The supervisors, then the roles, then the repositories, each in the order the agency lists them.
  agents: AgentSummary[];
  // Every role, with the bundles it gives, in the order the agency lists them; empty while it is not answering.
  roles: RoleView[];
  // The line a job's run goes out on: the line of the role the agency's newest job ran as, null where it lists no
  // job. A role on another line is one a runner runs as (docs/web.md, 「Home screen」). Absent before the list arrives.
  jobLine?: string | null;
  // The gate order is the gate unit's; null while no unit answers it.
  gateOrder: GatePartView[] | null;
  // The registration name of the receiver's default answerer, whose turns are the chat agent's; null where the
  // receiver did not say.
  defaultAnswerer: string | null;
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
  | "end"
  // A pane program's record of what its turn is doing — the phase, a call starting or settling, the usage, how full
  // the session stands — and the answer it gave (the agency's docs/run-records.md, 「Agent log」).
  | "progress"
  | "answer";

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
  // What the agency's call clock said of a tool call, on a note it wrote; absent or null on every other line (the
  // agency's `docs/agent-control.md`, 「A job turn's tool calls are held to a clock」).
  clock?: AgentLogClock | null;
}

// What befell a call when the clock wrote: it began, it was still running, the supervisor was asked about it, kept
// it, could not be asked, it was cut, or it ended.
export type AgentLogClockEvent = "started" | "running" | "asked" | "kept" | "ask-failed" | "cut" | "ended";

// One note of the agency's call clock, as fields: the call's id where the note carries one, the tool, the one-line
// summary of its command, its process, how long it had run, and what each event adds.
export interface AgentLogClock {
  event: AgentLogClockEvent;
  call: string | null;
  tool: string;
  command: string;
  pid: number | null;
  elapsedMs: number | null;
  silentMs: number | null;
  keptMs: number | null;
  why: string | null;
  cut: "no-progress" | "no-process" | "supervisor" | "stop" | null;
  outcome: "completed" | "failed" | "ended-with-turn" | null;
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
  // Only a page a screen opens at — a moment in the log, or one run — says this, since such a page has the log
  // above its head.
  hasOlder?: boolean;
  // The page a link names where the agency holds no such run: the screen says the log cannot be read.
  unavailable?: true;
}

export interface WorkerChanged {
  ok: true;
}

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

// The fallback as the agency answers it (its `docs/api.md`, 「providers, models and model files」): the account runs
// on Claude Code go out on now, and the Claude Code entry's own list, the accounts in the order it walks them. What the
// screen learns of a credential is the path it is reached by — no token and no file body is here.
export interface FallbackView {
  active: ActiveAgentView;
  accounts: ClaudeAccountView[];
}

export interface FallbackChanged {
  ok: true;
}

/** A Claude account's sign-in under way: its identifier and the address it is approved at (the agency's
 * `docs/cache-fallback.md`, 「Signing an account in from the console」). */
export interface ClaudeLoginStarted {
  login: string;
  url: string;
}

// What the console may know about the warming round as a whole. Which agents are stopped one by
// one is on the agents list, since that is where the rows are.
export interface KeepaliveView {
  stopped: boolean;
}

export interface KeepaliveChanged {
  ok: true;
}

// What the bot answers when one runner is stopped from a run's row. The row is closed by the
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
// The reader's own BMO beside a group room: the supervisor, its label, and the room it answers the reader alone in;
// all null where the reader has none.
export interface RoomOverlay {
  supervisor: string | null;
  label: string | null;
  room: number | null;
}

export interface OwnerChat {
  chatId: number | null;
  // The sender the receiver archives every message the owner sends under, the console's among them.
  senderId: number | null;
  // The senders whose messages are the signed-in person's own, and so stand on the right: those linked to their
  // account, and the owner's for the administrator (docs/web.md, 「Which messages stand on the right」).
  senders: number[];
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
  // words a person, a supervisor or a job added.
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
  // An approver's approval, which lets the item's work begin, or the chat agent's recommendation, which moves nothing.
  kind: "approval" | "recommendation";
  // The caller whose token gave it, or null for the shared token or one recorded with no caller.
  caller: string | null;
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
  // The provider and model its jobs go out on, its `model` label: `<provider>/<model>`, or `auto` for the agency's choice.
  | "model"
  | "agent";

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

// One turn of the talk over a job's question (docs/web.md, 「Talking a question over」): the question's replies
// that settle nothing, the asker's own and everyone else's, in the order they were said. Its moment is in
// milliseconds.
export interface QuestionTalkTurn {
  id: number;
  // Whether the job that asked said it; everyone else is a person talking to it.
  byAsker: boolean;
  // Who said it, as bmo-job keeps the reply's actor.
  name: string;
  text: string;
  at: number;
}

// The talk over one question, and how far its asker has heard it: the last reply the waiting run was handed, or
// null where it was handed none.
export interface QuestionTalk {
  turns: QuestionTalkTurn[];
  heardThrough: number | null;
  // Whether the question still waits for an answer, so a word on it reaches a run waiting there.
  open: boolean;
}

export interface QuestionTalkResult {
  ok: true;
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

export interface DocumentEntry {
  root: string;
  path: string;
  title: string;
  size: number;
  group: DocumentGroup | null;
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
  // How many times the item's review sent this task's stage back: the rejection entries written under its stage.
  rejections?: number;
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
  // The worker the order runs on; null where the order names none, which a screen reads as the item's own worker.
  worker: string | null;
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
// A chat service a room may be added from, as the room-add dialog offers it: its key and label and the modes a
// room on it may be added in (the receiver's `docs/api.md`, 「Rooms」).
// A chat service a room may be added from: what it lists and starts, and the modes a room on it may take.
export interface RoomAddService {
  key: string;
  label: string;
  modes: RoomAddMode[];
  listsRooms: boolean;
  listsContacts: boolean;
  startsChats: boolean;
  startsGroups: boolean;
}

export type RoomAddMode = "avatar" | "record-only";

// One room of a chat service's account, with the mode it was added in, or null where it was never added.
export interface RoomAddCandidate {
  id: number;
  title: string | null;
  kind: string;
  // Whether the receiver already holds the room, added or not.
  held: boolean;
  mode: RoomAddMode | null;
  // The chat service's own modes for the room, where it states them; an avatar is offered only where they hold
  // `human-avatar`.
  modes: string[] | null;
}

export interface RoomAddPage {
  items: RoomAddCandidate[];
  more: boolean;
}

// One contact of a chat service's account, with the one-to-one the account already has with it, whether the
// receiver holds that room, and the mode it was added in.
export interface RoomAddContact {
  id: number;
  name: string;
  kind: string;
  roomId: number | null;
  held: boolean;
  mode: RoomAddMode | null;
}

export interface RoomAddContactPage {
  items: RoomAddContact[];
  more: boolean;
}

export interface RoomAdded {
  chatId: number;
  title: string | null;
}

export interface RoomProvidersView {
  providers: { key: string; label: string }[];
  on: string[];
  chosen: boolean;
}

// A room's mode as its registration holds it, for the administrator alone: `avatar`, its agents answering under the
// owner's account; `record-only`, read and recorded and never answered; null for a room that was never added.
// One asynchronous call the tool host keeps running with its wake for a room (docs/web.md, the room screen's list of what waits): a watch
// with how often its check runs, a reminder with the moment it waits for, or any other call by its tool's name;
// the note it was set with, the agent it wakes, and when it started, in epoch milliseconds.
export interface BackgroundCall {
  id: string;
  kind: "watch" | "reminder" | "call";
  tool: string;
  note: string | null;
  everySeconds: number | null;
  until: number | null;
  agent: string | null;
  startedAt: number;
}

export interface BackgroundView {
  calls: BackgroundCall[];
}

export type RoomMode = "avatar" | "record-only";

export interface RoomModeView {
  mode: RoomMode | null;
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

// Where a room's line begins: the names of the chat services its past comes over from, where the road it is answered on
// reads a room's past back; none elsewhere, so its oldest message is the conversation's start; null where the receiver
// could not say (docs/web.md, the room screen's 「Where a room's line begins」).
export interface RoomPast {
  readers: string[] | null;
}

// What one round of a room spent and did, read once the page carrying its last answer has landed (docs/web.md, the
// room screen's chip line): the answer the room asked about it by, and the round's figures.
export interface RoundFiguresOf {
  messageId: ExactMessageId;
  round: string;
  spend: RoundSpend | null;
  actions: TurnActionsRef | null;
}

export interface RoomRoundFigures {
  items: RoundFiguresOf[];
}

// One picture a room holds, as the picture viewer walks the room's pictures.
export interface RoomPicture {
  messageId: ExactMessageId;
  // The album it went out in, by the number of the album's first picture; null for a picture sent alone.
  album: ExactMessageId | null;
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
  start: { messageId: ExactMessageId } | null;
}

export interface JudgementPage {
  judgements: Judgement[];
  hasMore: boolean;
}

// What the receiver did with what the owner typed: it said it in the room under their name, and
// the room's record now holds it under this number.
export interface SentMessage {
  messageId: ExactMessageId;
}

// What the signed-in person's act on a message answers: the message as the record now holds it, by its number, which
// the screen reads again rather than trusting the row it acted from.
export interface MessageAct {
  messageId: ExactMessageId;
}

// Where a forwarded copy was kept: the room it went into and the message the room now holds there.
export interface ForwardedMessage {
  room: number;
  messageId: ExactMessageId;
}

// A room's pinned message as the top bar's button reads it (the receiver's `docs/api.md`, 「Messages」): what it says,
// who said it, and when it was pinned, in unix seconds.
export interface PinnedMessage {
  messageId: ExactMessageId;
  senderName: string;
  text: string;
  pinnedAt: number | null;
}

export interface RoomPins {
  items: PinnedMessage[];
}

// The stickers the record keeps, each by its emoji: the deployment's set, which the console offers as it is.
export interface StickerSet {
  items: string[];
}

// What a send's key came to, as the screen asks for it while it checks a send that ran late: the
// answer it went out with, the refusal that came instead, a send still going, or no record of it.
export type SendOutcomeRecord<T> =
  | { state: "answered"; answer: T }
  | { state: "going" }
  | { state: "unknown" };

// How long the window the chat agent keeps in one room has left to run, in whole seconds from the moment the
// console answered; nought where none is open (the receiver's docs/wake.md).
export interface RoomWindow {
  openFor: number;
}

// One of a room's members (docs/web.md, the room screen's members entry), by either road: one its chat service read,
// with the person number the room's lines carry where one was given, their name and status line, and the console
// account they are where that number is linked to a user who may sign in; or an account let into the room in the
// console, by its account's name. `inConsole` says the account is a member in the console, so it may leave or be
// taken out there. Nothing is told of a member the platform does not know.
export interface RoomMember {
  person: number | null;
  name: string;
  status: string | null;
  account: string | null;
  inConsole: boolean;
}

// A room's members, and whether the reader may let people in and take them out (docs/web.md, the room screen's
// section on opening a room and letting people in).
export interface RoomMembersView {
  members: RoomMember[];
  mayLetIn: boolean;
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
  sent: { name: string; messageId: ExactMessageId }[];
  failed: { name: string; reason: string }[];
  // The files the receiver took but did not answer for in time: they may well have gone, so they are
  // watched for in the room rather than called failed.
  checking: { name: string }[];
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
  // A JSON object or list: its shape, how many fields or members it holds, the first of its field names, and the
  // value itself where it was read whole. A screen stands it as what it holds, never as its text.
  shape?: "object" | "list";
  count?: number;
  keys?: string[];
  json?: unknown;
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

// One commit a deployment carried, as the title bar reads it from the deploy log and the repository's own log.
export interface DeployCommit {
  commit: string;
  subject: string;
  // The item its subject or the deployed record names, which the popover opens in the TODO panel.
  todoId: number | null;
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
  /** The commits this deployment carries, oldest first, beside the commit itself. */
  carried: DeployCommit[];
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
  /** Every run under way, each with the commits it carries, for the rows whose item one of them carries. */
  runs?: DeployRunView[];
  hold: DeployHold | null;
}

/** One line of the deployment unit's journal. */
export interface DeployLogLine {
  at: number;
  text: string;
}
