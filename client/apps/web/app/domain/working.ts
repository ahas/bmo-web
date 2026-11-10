import { ref } from "vue";

import { isBrainCall, mcpCallOf } from "#shared/mcp-names";
import { agentNameLabel, bmoLabel } from "./agents";
import { subjectOf as joinedSubject } from "#shared/particles";

import { contextStateLook, lineLook, toolCall, toolChip } from "./log";
import { countText } from "./numbers";
import { toolFace } from "./spans";
import { timerClock } from "bmo-ui/app/domain/time";

import type { AgentLogLine, LiveRun, RunProgress, TurnAction, TurnReceived, TurnSpeaker } from "#shared/types";
import type { ComputedRef, Ref } from "vue";
import type { DraftStep, RoomOutcome } from "./events";
import type { ContextStateLook, KindLook, ToolChip } from "./log";
import type { FigureLine } from "./numbers";
import type { SpendChip } from "./turns";
import type { Translate } from "#shared/wording";

// How the room shows a turn that is still going: one line saying what it is at, which for a turn
// working a tool is that tool by name. What the gates said stands under the message they judged,
// so nothing of it is repeated here.
export interface WorkingLook {
  label: string;
}

// What a turn still running hands its chip line: everything it has done so far and what it has
// spent so far. A turn that has ended leaves both in the record and the line reads them from
// there; one still running carries them itself, and the line is the same line either way.
export interface LiveTurn {
  actions: TurnAction[];
  // How many of its doings fell off the front of what the stream carries, and how many of those
  // were things it was handed. The chips count the whole turn, so these are counted although they
  // cannot be stood.
  dropped: number;
  droppedContext: number;
  chip: SpendChip;
}

// A name joined to the subject particle its last sound asks for, which the pack takes as {subject}: the name comes
// from another unit, so no key of the pack can carry the particle itself.
export function subjectOf(name: string): string {
  return joinedSubject(name);
}

// Who a turn is, by the name a person calls it: a supervisor under the label its row in the agents table carries,
// and the default answerer under the chat agent's own; never the registration name the turn carries, but where the catalogue holds no
// label for it.
export function turnName(t: Translate, speaker: TurnSpeaker | undefined): string {
  return speaker === undefined ? bmoLabel(t) : agentNameLabel(t, { name: speaker.name });
}

// The line says who is at it, by the name of the agent answering on that row: a room two agents
// answer stands a row of each, and each row says its own. It says the state the turn is at, whatever turn it is;
// what the chat agent's draft turn writes is the message, so its writing is said as that (docs/web.md, the room
// screen's running line). `draft` is the draft turn under way, null where none is.
export function phaseLook(t: Translate, name: string, progress: RunProgress | null, draft: DraftStep | null = null): WorkingLook {
  if (draft !== null && progress?.phase === "writing") return { label: draftStepText(t) };

  return stateLook(t, name, progress);
}

// What the draft turn's writing is said as: a round's draft is one turn, and what it writes is the message.
function draftStepText(t: Translate): string {
  return t("room.status.draft_writing");
}

// What a running turn is at now, without the agent's name: the reasoning block's face carries the name, and the
// detail under it says the state — the tool it works, the Job it waits on, or that it writes — whatever turn it is.
// What the chat agent's draft turn writes is the message, so its writing is said as that. Null while it only thinks,
// since the face already says that, and null where the pack has no word for a phase the stream named.
export function phaseDetail(t: Translate, progress: RunProgress | null, draft: DraftStep | null = null): string | null {
  if (progress === null || progress.phase === "thinking") return null;

  if (progress.phase === "writing") return draft === null ? t("room.status.step_writing") : draftStepText(t);

  if (progress.phase === "waiting") {
    const item = progress.waitingFor?.todoId ?? null;

    return item === null ? t("room.status.step_waiting") : t("room.status.step_waiting_item", { item: countText(item) });
  }

  const named = progress.tool === null ? null : toolFace(t, progress.tool);

  return named === null ? t("room.status.step_tool") : t("room.status.step_tool_named", { tool: named });
}

// The questions of the draft process's catalogue (the receiver's docs/drafting.md, 「The questions」) named in a
// list the reader picks from or reads a row of — the draft process's table, its catalogue and a round's draft
// log — where each stands under the pack's word for it rather than under its catalogue name, and a
// question the console adds under a name of its own under that name. The last question writes the message instead
// of asking one, so it is named as the step it is.
const DRAFT_QUESTION_NAMES: Record<string, string> = {
  intent: "room.status.draft_question_intent",
  information: "room.status.draft_question_information",
  facts: "room.status.draft_question_facts",
  promises: "room.status.draft_question_promises",
  fit: "room.status.draft_question_fit",
  memory: "room.status.draft_question_memory",
  final: "agents.label.draft_question_final",
  // The closing check, an item of the process rather than a question of the catalogue (the receiver's
  // docs/drafting.md, 「The round log」).
  arrived: "room.label.draft_question_arrived"
};

// The draft turn follows several questions at once and goes by all their names, joined by `+` (the receiver's
// docs/drafting.md, 「The round log」): it stands as the words of each, in their order.
export function draftQuestionLabel(t: Translate, question: string): string {
  if (question.includes("+")) {
    return question
      .split("+")
      .map((one) => draftQuestionLabel(t, one))
      .join(" · ");
  }

  const name = DRAFT_QUESTION_NAMES[question];

  return name === undefined ? question : t(name);
}

function stateLook(t: Translate, name: string, progress: RunProgress | null): WorkingLook {
  const subject = subjectOf(name);

  if (progress === null || progress.phase === "thinking") {
    return { label: t("room.status.agent_thinking", { subject }) };
  }

  if (progress.phase === "writing") {
    return { label: t("room.status.agent_writing", { subject }) };
  }

  // A turn whose engine a Job holds waits for that Job, which the line names by the item it is a run of
  // (the agency's docs/supervisors.md, 「The engine it shares」).
  if (progress.phase === "waiting") {
    const item = progress.waitingFor?.todoId ?? null;

    return { label: item === null ? t("room.status.agent_waiting_engine", { subject }) : t("room.status.agent_waiting_engine_item", { subject, item }) };
  }

  // The line names the tool it is working, in the word a person calls that tool by rather than in
  // the name the program calls it: the state a reader is watching is which tool is out right now,
  // and a line that says only that a tool is out leaves them counting down the stack to find it.
  // The name is the tool the call reached: a call made through the toolbook is named by the tool it
  // ran, whose arguments stand in the turn's list of actions rather than on this one line. A phase
  // the stream gave no name to says the tool without naming it, since something is better than
  // nothing at all.
  const named = progress.tool === null ? null : toolFace(t, progress.tool);

  return { label: named === null ? t("room.status.agent_tool", { subject }) : t("room.status.agent_tool_named", { subject, tool: named }) };
}

// What the chat agent's row says while it only listens in a group room's open window: that the room's chat is
// on, that it listens, under the name its turn's line wears there, and how long the window has left,
// which turns as it ticks down (docs/web.md, 「The listening row」).
export interface ListeningLines {
  enabled: string;
  state: string;
  left: { keypath: string; figures: Record<string, { value: number; text: string }> };
}

export function listeningLines(t: Translate, name: string, secondsLeft: number): ListeningLines {
  const left = Math.max(0, secondsLeft);

  return {
    enabled: t("room.status.chat_enabled"),
    state: t("room.status.agent_listening", { subject: subjectOf(name) }),
    left: { keypath: "room.status.listening_left", figures: { time: { value: left, text: timerClock(left) } } }
  };
}

// What the room's top bar says of the window while it is open: that the chat agent listens, as its tooltip
// and its name to a screen reader, and the time left as a timer reads it, which turns as it ticks down
// (docs/web.md, 「The window's time left stands in the top bar」).
export interface WindowClockLines {
  state: string;
  left: { keypath: string; figures: Record<string, { value: number; text: string }> };
}

export function windowClockLines(t: Translate, name: string, secondsLeft: number): WindowClockLines {
  const left = Math.max(0, secondsLeft);

  return {
    state: t("room.status.agent_listening", { subject: subjectOf(name) }),
    left: { keypath: "room.status.window_left", figures: { time: { value: left, text: timerClock(left) } } }
  };
}

// Why a turn left no answer, naming the agent whose turn it was by the name its running row wore.
export function outcomeLine(t: Translate, outcome: RoomOutcome): string {
  const name = turnName(t, outcome.speaker);

  return t(outcome.key, { name, subject: subjectOf(name) });
}

// What the turn was handed, in the room's own words: how many of the room's own messages, the
// bot's own quiet instructions, or both together. A turn the bot said nothing about, and one
// that took neither, says nothing — what is not known is not made up, and a turn with an empty
// round behind it has nothing to report having read. Its counts rise while the turn waits on more
// words, so the line is handed over as its sentence and its figures, which turn on their own.
export function receivedLine(received: TurnReceived | null): FigureLine | null {
  if (received === null) {
    return null;
  }

  const { messages, instructions } = received;

  if (messages > 0 && instructions > 0) {
    return { keypath: "room.status.received_both", figures: { messages, instructions } };
  }

  if (messages > 0) {
    return { keypath: "room.status.received_messages", figures: { messages } };
  }

  return instructions > 0 ? { keypath: "room.status.received_instructions", figures: { instructions } } : null;
}

// One action of a turn as the room draws it: the badge its sort wears — the same look the agent's
// own page gives that line — the tool's own word where it has one, and what the action was about.
// A call's arguments are read by the very function the log screen reads them with, so a file tool
// says its file and a shell command says its command in both places.
export interface ActionLook {
  look: KindLook;
  // What a call wears in place of its kind's word: its tool's own name and icon, as the agent's log
  // shows it. Null for what was handed over, and for a call that named no tool.
  chip: ToolChip | null;
  text: string;
  // Whether a reference document went in full or as an already-loaded mark; null on the rest.
  mark: ContextStateLook | null;
  // Whether the call came back a failure. A call still out and one that came back well both
  // stand plainly; only a failure is worth a mark.
  failed: boolean;
}

// What a screen knows of a tool's icon where none came with the call: nothing, so every call shows the
// generic icon.
const NO_ICONS: ReadonlyMap<string, string> = new Map();

// The MCP server the deployment's own tools are served under, whose tools declare their icons.
const CHAT_TOOL_SERVER = "bmo";

// A call as its chip names it: an MCP call by its tool, with the icon one of the deployment's own tools declares for
// it where one is known, and any other call by its own name.
function toolShown(name: string, icons: ReadonlyMap<string, string>): { name: string; icon: string | null } {
  const call = mcpCallOf(name);

  return { name: call?.tool ?? name, icon: call?.server === CHAT_TOOL_SERVER ? (icons.get(call.tool) ?? null) : null };
}

// A call read off the log wears the tool its line says; one read off the bot's live picture wears the icon its
// tool declares, out of `icons`.
export function actionLook(t: Translate, action: TurnAction, icons: ReadonlyMap<string, string> = NO_ICONS): ActionLook {
  const look = lineLook(t, action);

  if (action.kind !== "tool") {
    return { look, chip: null, text: action.text, failed: false, mark: contextStateLook(t, action) };
  }

  const name = action.name;
  const head = toolCall(name, action.text).head;

  return {
    look,
    chip: name === null ? null : toolChip({ kind: "tool", tool: action.tool ?? toolShown(name, icons) }),
    text: head === "" ? action.text : head,
    failed: action.state === "failed",
    mark: null,
  };
}

// The icon each of the chat agent's own tools declares, asked for once a screen, for the calls a screen reads off the
// bot's live picture.
export function useToolIcons(): ComputedRef<ReadonlyMap<string, string>> {
  const { data } = useFetch<Record<string, string>>("/api/tool-icons", {
    key: "tool-icons",
    lazy: true,
    server: false,
    default: () => ({})
  });

  return computed(() => new Map(Object.entries(data.value ?? {})));
}

// What a finished turn did, out of the lines its run left. It is the same list the room watched
// stack up while the turn ran — the writer wrote both from one normalizer — so a turn read back an
// hour later reads as it read live: what it was handed, then each call, with what the call came
// back as written onto it.
// What a turn read from the brain: the documents the reference put in front of it, and its calls to the brain's
// reading tools (docs/web.md, the room screen's brain chip).
export function brainActions(actions: readonly TurnAction[]): TurnAction[] {
  return actions.filter((action) => action.kind === "context" || (action.kind === "tool" && isBrainCall(action.tool?.name ?? action.name, action.text)));
}

export function turnActions(lines: readonly AgentLogLine[]): TurnAction[] {
  const actions: TurnAction[] = [];
  const calls = new Map<string, TurnAction>();

  for (const line of lines) {
    if (line.kind === "context" || line.kind === "tool") {
      // A reference document keeps how it went in; a call's ending is written onto it below.
      const state = line.kind === "context" && (line.state === "attached" || line.state === "held") ? line.state : null;
      const action: TurnAction = { kind: line.kind, name: line.name, tool: line.tool, text: line.text, state };

      actions.push(action);

      if (line.kind === "tool" && line.ref !== null) {
        calls.set(line.ref, action);
      }

      continue;
    }

    // A result is not an action of its own: it is how the call it answers ended.
    if (line.kind === "tool-result" && line.ref !== null) {
      const called = calls.get(line.ref);

      if (called !== undefined) {
        called.state = line.state === "failed" ? "failed" : "succeeded";
      }
    }
  }

  return actions;
}

// The last thinking block a running turn's picture carries, as its block stands it under the turn's detail: the
// block with the blank around it taken off, or null where the picture carries none (docs/web.md, the room screen's
// running line).
export function thinkingBlock(progress: RunProgress | null): string | null {
  const block = (progress?.thinking ?? "").trim();

  return block === "" ? null : block;
}

// How the thinking preview streams its block in: quickly, so many characters a second.
export const THINKING_STREAM = { charsPerSecond: 400 } as const;

// How many characters of a block the preview shows `elapsedMs` after it began streaming from `from`, the count it
// already stood: the pace's characters past it, and never more than the block's `length`.
export function thinkingShown(elapsedMs: number, from: number, length: number): number {
  if (length <= from) return length;

  return Math.min(length, from + Math.floor((Math.max(0, elapsedMs) * THINKING_STREAM.charsPerSecond) / 1_000));
}

// Where the streaming of a new block goes on from, given what the preview stood of the block before: the count it
// stood where the new block grows that one, else nothing, since another block starts from its own head.
export function thinkingResumeFrom(before: string, shown: number, now: string): number {
  return now.startsWith(before.slice(0, shown)) && shown <= now.length ? shown : 0;
}

// How far the state line's shimmer travels per character: the library's two pixels a character, which reads a
// Latin letter's width; a Hangul syllable is twice as wide, so a line of them travels twice as far in the same
// time, and the sweep moves at one pace whatever the words.
export function shimmerSpread(text: string): number {
  const chars = [...text];

  if (chars.length === 0) return 2;

  const wide = chars.filter((char) => /\p{Script=Hangul}/u.test(char)).length;

  return (2 * (chars.length + wide)) / chars.length;
}

// What a running turn is at, in the pack's words (docs/web.md, the room screen's running line): the state's detail,
// or that it only thinks where the detail names nothing.
export function stateLine(t: Translate, progress: RunProgress | null, draft: DraftStep | null = null): string {
  return phaseDetail(t, progress, draft) ?? t("room.status.step_thinking");
}

// The last call the turn made, where its picture carries one: the one line the running block stands of its work.
export function lastAction(progress: RunProgress | null): TurnAction | null {
  return progress?.actions.at(-1) ?? null;
}

// What a running turn has written as it works, as its block stands it: the newest of its progress lines, read as the
// agent's words, and the few before it, oldest first (docs/web.md, the room screen's progress lines).
export function saidLines(progress: RunProgress | null): { earlier: string[]; newest: string | null } {
  const said = (progress?.said ?? []).map((line) => line.text).filter((text) => text.trim() !== "");

  return { earlier: said.slice(0, -1), newest: said.at(-1) ?? null };
}

// The progress lines a finished turn's runs left: each text line a call of the same run follows, the run's own and
// no co-worker branch's. A run's last text, with no call after it, is its answer or its notes, and a failed
// request's text is no line of the turn's, so neither is one.
export function progressLines(lines: readonly AgentLogLine[]): AgentLogLine[] {
  const said: AgentLogLine[] = [];
  const held = new Map<string, AgentLogLine[]>();

  for (const line of lines) {
    if (line.parent !== null) continue;

    if (line.kind === "text" && line.state !== "failed" && line.text.trim() !== "") {
      held.set(line.run, [...(held.get(line.run) ?? []), line]);
    } else if (line.kind === "tool") {
      said.push(...(held.get(line.run) ?? []));
      held.delete(line.run);
    }
  }

  return said;
}

// How long a picture that carries no runs is held off before it takes the room's line away: long enough for a job to
// hand over to the next one — a run ends and the next starts a moment later — and short enough that a line whose work
// truly ended goes. A job's own line is the agency's, and its changes come as one event each, so a moment with none
// running is a moment, not an ending.
export const WORK_SETTLE_MS = 2_500;

/**
 * The runs a room's line stands on, held across the pictures that say nothing of them (docs/web.md, the room screen's
 * section on what else runs for the room): a picture with no `runs` at all is the receiver's, which serves none, and
 * says nothing about jobs; a picture with an empty list clears the line once the settle window passes with nothing
 * running again.
 */
export function useHeldRuns(settleMs: number = WORK_SETTLE_MS): { runs: Ref<LiveRun[]>; take: (runs: LiveRun[] | undefined) => void; stop: () => void } {
  const runs = ref<LiveRun[]>([]);
  let clock: ReturnType<typeof setTimeout> | null = null;

  const stop = (): void => {
    if (clock === null) return;

    clearTimeout(clock);
    clock = null;
  };

  function take(seen: LiveRun[] | undefined): void {
    if (seen === undefined) return;

    if (seen.length > 0) {
      stop();
      runs.value = seen;

      return;
    }

    if (runs.value.length === 0 || clock !== null) return;

    clock = setTimeout(() => {
      clock = null;
      runs.value = [];
    }, settleMs);
  }

  return { runs, take, stop };
}

