import { isBrainCall, mcpCallOf } from "#shared/mcp-names";
import { agentLabel, bmoLabel } from "./agents";
import { subjectOf as joinedSubject } from "#shared/particles";

import { contextStateLook, lineLook, toolCall, toolChip } from "./log";
import { countText } from "./numbers";
import { toolFace } from "./spans";
import { agentLink, depthLabel, launcherLabel, modelLabel, runningWorkLabel } from "./status";
import { timerClock } from "bmo-ui/app/domain/time";
import { watchOfRun, watchTitle } from "./watches";

import type { AgentLogLine, LiveRun, RoomSummary, RunProgress, TurnAction, TurnReceived, TurnSpeaker, WatchView } from "#shared/types";
import type { ComputedRef } from "vue";
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

// One thing running for this room that is not the room's own turn: a search, a browse, a job.
export interface RoomRunLine {
  key: string;
  label: string;
  // Which count of the room's run line it falls in: a job, a watch's check, a search, or the rest.
  sort: "job" | "watch" | "search" | "other";
  // Who set it off, in the words the room reads; null where nobody launched it.
  launcher: string | null;
  startedAt: number;
  // Which agent is at work, and where its log is read: the room opens the log over the
  // conversation when the line is pressed, and the same name is what its own page is under.
  agent: string;
  to: string;
  // The standing watch this run is a check of, where it is one. The line is then named after the
  // watch rather than after the agent running it, and pressing it opens the watch itself — what it
  // promised, its condition, how often it looks and how the last look went — above the log, which
  // for a check that wrote nothing is the whole of what there is to read.
  watch: WatchView | null;
  // The item a job's line is a run of, which the line names on hover; null on every other line.
  todoId: number | null;
}

// A name joined to the subject particle its last sound asks for, which the pack takes as {subject}: the name comes
// from another unit, so no key of the pack can carry the particle itself.
export function subjectOf(name: string): string {
  return joinedSubject(name);
}

// Who a turn is, by the name a person calls it: a companion under the label its row in the agents table carries,
// and the chat agent under its own; never the registration name the turn carries, but where the catalogue holds no
// label for it.
export function turnName(t: Translate, speaker: TurnSpeaker | undefined): string {
  return speaker === undefined ? bmoLabel(t) : agentLabel(t, speaker.name);
}

// The line says who is at it, by the name of the agent answering on that row: a room two agents
// answer stands a row of each, and each row says its own. While the chat agent's draft process is on a question, the
// line says that question in place of the state (docs/web.md, the room screen's running line): its round out of how
// many the process asks, and the question in the pack's words, or that the message is being written where it is the
// last. `draft` is the question under way, null where none is.
export function phaseLook(t: Translate, name: string, progress: RunProgress | null, draft: DraftStep | null = null): WorkingLook {
  if (draft === null) return stateLook(t, name, progress);

  const step = t("room.status.draft_step_round", { n: countText(draft.number), count: countText(draft.count) });
  const what = draft.number >= draft.count ? t("room.status.draft_writing") : draftQuestionFace(t, draft.question);

  return { label: t("room.status.draft_step", { step, what }) };
}

// The words the pack has for each question of the draft process's catalogue (the receiver's docs/drafting.md, 「The
// questions」). A question the console adds under a name of its own stands under that name.
const DRAFT_QUESTION_FACES: Record<string, string> = {
  intent: "room.status.draft_question_intent",
  information: "room.status.draft_question_information",
  facts: "room.status.draft_question_facts",
  promises: "room.status.draft_question_promises",
  fit: "room.status.draft_question_fit",
  memory: "room.status.draft_question_memory",
  final: "room.status.draft_writing"
};

export function draftQuestionFace(t: Translate, question: string): string {
  const face = DRAFT_QUESTION_FACES[question];

  return face === undefined ? question : t(face);
}

// The same questions named in a list the reader picks from or reads a row of — the draft process's round table
// and its catalogue — where each stands under the pack's word for it rather than under its catalogue name, and a
// question the console adds under a name of its own under that name. The last question writes the message instead
// of asking one, so it is named as the step it is.
const DRAFT_QUESTION_NAMES: Record<string, string> = {
  intent: "room.status.draft_question_intent",
  information: "room.status.draft_question_information",
  facts: "room.status.draft_question_facts",
  promises: "room.status.draft_question_promises",
  fit: "room.status.draft_question_fit",
  memory: "room.status.draft_question_memory",
  final: "agents.label.draft_question_final"
};

export function draftQuestionLabel(t: Translate, question: string): string {
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
  // (docs/companions.md, 「The engine it shares」).
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

// What is running for this room besides its own turn. A gate belongs to the turn it judges and
// stands under the message it judged, so it is not doubled here.
export function roomRuns(
  t: Translate,
  live: LiveRun[],
  chatId: number,
  rooms: RoomSummary[],
  watches: readonly WatchView[] = []
): RoomRunLine[] {
  return live
    .filter((run) => run.kind !== "gate" && run.chatId === chatId)
    .map((run): RoomRunLine => {
      const watch = watchOfRun(watches, run);

      return {
        key: `${run.kind}:${run.id}`,
        label: watch === null ? runLabel(t, run) : watchTitle(t, watch),
        sort: watch !== null ? "watch" : run.kind === "worker" ? "job" : run.depth !== null ? "search" : "other",
        launcher: launcherLabel(t, run, rooms),
        startedAt: run.startedAt,
        agent: run.agent,
        to: agentLink(run.agent),
        watch,
        todoId: watch === null ? run.todoId : null
      };
    });
}

// A search wears its rung and a job the item it is a run of; a browse has neither and stands as
// its name. A job with no item behind it wears why it was launched, and only one written before
// launches had to say wears its model, since there is nothing else to give.
function runLabel(t: Translate, run: LiveRun): string {
  const name = agentLabel(t, run.agent);

  if (run.depth !== null) {
    return `${name} · ${depthLabel(t, run.depth)}`;
  }

  const work = runningWorkLabel(t, run);

  if (work !== null) {
    return `${name} · ${work}`;
  }

  return run.model === null ? name : `${name} · ${modelLabel(run.model)}`;
}

// The one line of counts a room stands for what else runs for it (docs/web.md, the room screen's section on what runs
// for the room): each sort of run counted. A part with nothing in it does not stand.
export function runSummary(t: Translate, lines: readonly RoomRunLine[]): string {
  const count = (sort: RoomRunLine["sort"]) => lines.filter((line) => line.sort === sort).length;
  const parts = [
    { n: count("job"), key: "room.label.summary_jobs" },
    { n: count("watch"), key: "room.label.summary_watches" },
    { n: count("search"), key: "room.label.summary_searches" },
    { n: count("other"), key: "room.label.summary_others" }
  ]
    .filter((part) => part.n > 0)
    .map((part) => t(part.key, { n: countText(part.n) }));

  return parts.join(" · ");
}
