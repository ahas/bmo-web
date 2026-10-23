import { AGENT_LOG_PAGE_SIZE, PAGING } from "#shared/config";
import { failureText } from "bmo-ui/app/domain/errors";
import { formatTime, spanClock } from "bmo-ui/app/domain/time";

import type { AgentLogContext, AgentLogContextState, AgentLogKind, AgentLogLine, AgentLogPage } from "#shared/types";
import type { Translate } from "#shared/wording";
import type { StepperStep, StepState } from "./stepper";
import type { ComputedRef, Ref } from "vue";

// How one line is shown: the badge its kind wears, the word on it, and whether its text is words
// someone wrote — which stand as the markdown they were written in — or a record of the run that
// stands as the characters it was stored as.
export interface KindLook {
  label: string;
  color: LogTone;
  words: boolean;
}

export type LogTone = "primary" | "info" | "success" | "warning" | "neutral";

// One row of the log screen: the line itself, whatever answered it when it is a tool call, and how
// far in it sits.
export interface LogRow {
  key: string;
  line: AgentLogLine;
  // A call's results belong under the call rather than beside it.
  results: AgentLogLine[];
  // A line that came out of a Task call is one step in, under the branch's own head.
  depth: number;
}

// Where in a log a screen is to open: the log's own name for one run, or the second one began
// and the room it ran for.
export type LogPlace = { run: string } | { at: number; chat?: number };

export interface AgentLogFeed {
  rows: ComputedRef<LogRow[]>;
  older: Ref<boolean>;
  // Whether the log goes on past the last line held. A screen that opened on the newest page
  // is at the end and this is false; one that opened at a moment in the log has the rest of it
  // still ahead.
  newer: Ref<boolean>;
  loading: Ref<boolean>;
  loadingOlder: Ref<boolean>;
  failure: Ref<string | null>;
  load: () => Promise<void>;
  // The page one finished run begins at.
  loadAt: (place: LogPlace) => Promise<void>;
  loadOlder: () => Promise<number>;
  // The lines that arrived after the last one held. Returns how many, so the view can decide
  // whether to follow them down.
  follow: () => Promise<number>;
}

// A co-worker's branch is one step in from the run it was fanned out of.
const BRANCH_DEPTH = 1;

const KIND_LOOKS: Record<AgentLogKind, KindLook> = {
  start: { label: "agents.label.line_start", color: "success", words: false },
  thinking: { label: "agents.label.line_thinking", color: "neutral", words: true },
  text: { label: "agents.label.line_text", color: "primary", words: true },
  tool: { label: "agents.label.line_tool", color: "info", words: false },
  "tool-result": { label: "agents.label.line_tool_result", color: "neutral", words: false },
  prompt: { label: "agents.label.line_prompt", color: "neutral", words: false },
  context: { label: "agents.label.line_context", color: "success", words: false },
  note: { label: "agents.label.line_note", color: "neutral", words: true },
  end: { label: "agents.label.line_end", color: "warning", words: true }
};

const UNKNOWN_LOOK: KindLook = { label: "agents.label.line_unknown", color: "neutral", words: false };

// The prompt a session was launched with is written as a prompt line of its own name, and it is a
// different thing to read from the prompt of one turn.
const SYSTEM_PROMPT = "system";
const SYSTEM_LOOK: KindLook = { label: "agents.label.line_system_prompt", color: "info", words: false };

// What the owner said to a worker from its own screen is a prompt line of its own name too, and it
// reads as what it is — their words, whole — rather than as the machine text a run was handed.
const WORD_PROMPT = "word";
const WORD_LOOK: KindLook = { label: "agents.label.line_word", color: "neutral", words: true };

// What a turn was handed, in the owner's own word for each sort. They share one tone because they
// are one thing — what went in front of the turn before it ran — and the word is what tells a
// person book from a rulebook from the stretch of the room the turn read back.
const CONTEXT_LABELS: Record<AgentLogContext, string> = {
  room: "agents.label.context_room",
  memory: "agents.label.context_memory",
  person: "agents.label.context_person",
  document: "agents.label.context_document",
  rule: "agents.label.context_rule",
  situation: "agents.label.context_situation",
  knowledge: "agents.label.context_knowledge",
  archive: "agents.label.context_archive"
};

// Whether a reference document went in full with its turn or as a mark for a version the session
// already held: an icon alone, named by its tooltip.
export interface ContextStateLook {
  icon: string;
  color: "primary" | "neutral";
  label: string;
}

const CONTEXT_STATE_LOOKS: Record<AgentLogContextState, ContextStateLook> = {
  attached: { icon: "i-material-symbols-fiber-new-outline", color: "primary", label: "agents.label.context_attached" },
  held: { icon: "i-material-symbols-history", color: "neutral", label: "agents.label.context_held" }
};

// The mark a line wears, on a `context` line that carries one and on nothing else.
export function contextStateLook(t: Translate, line: { kind: string; state: string | null }): ContextStateLook | null {
  const look = line.kind === "context" ? CONTEXT_STATE_LOOKS[line.state as AgentLogContextState] : undefined;

  return look === undefined ? null : { ...look, label: t(look.label) };
}

// A kind's look with its label put into words.
function spoken(t: Translate, look: KindLook): KindLook {
  return { ...look, label: t(look.label) };
}

export function kindLook(t: Translate, kind: string): KindLook {
  return spoken(t, KIND_LOOKS[kind as AgentLogKind] ?? UNKNOWN_LOOK);
}

// How one line is shown: its kind's look, except where the name says more than the kind does — the
// prompt a session was launched with, the owner's word to a worker, and which sort of thing a turn
// was handed.
export function lineLook(t: Translate, line: Pick<AgentLogLine, "kind" | "name">): KindLook {
  if (line.kind === "prompt" && line.name === SYSTEM_PROMPT) {
    return spoken(t, SYSTEM_LOOK);
  }

  if (line.kind === "prompt" && line.name === WORD_PROMPT) {
    return spoken(t, WORD_LOOK);
  }

  const sort = line.kind === "context" ? CONTEXT_LABELS[line.name as AgentLogContext] : undefined;

  return sort === undefined ? kindLook(t, line.kind) : { ...kindLook(t, "context"), label: t(sort) };
}

// The icon every tool is shown by that declares none of its own.
export const GENERIC_TOOL_ICON = "i-material-symbols-build-outline";

// What a call wears in place of a kind word: a chip of the tool's own name — `Bash`, `Read`,
// `memory_add` — with the icon the tool declares, or the generic one. A result keeps its kind's word
// and names its tool beside it, since the chip is the call's. The name and the icon come with the
// line (`client/server/utils/agentlog.ts`): the screen keeps no list of tools of its own.
export interface ToolChip {
  label: string;
  icon: string;
}

export function toolChip(line: Pick<AgentLogLine, "kind" | "tool">): ToolChip | null {
  return line.kind === "tool" && line.tool !== null ? { label: line.tool.name, icon: line.tool.icon ?? GENERIC_TOOL_ICON } : null;
}

// What a call shows on its own row: what it did, and the description it came with when it has
// one. The whole arguments are a click away either way, so nothing here is the only copy.
export interface ToolCall {
  head: string;
  description: string | null;
}

// Which argument of a tool says what the call did. A tool not named here — every MCP tool, and
// anything new — falls back to its own arguments laid out as name=value, which says as much
// about a call as a rule written for it would.
const TOOL_FIELDS: Record<string, readonly string[]> = {
  Bash: ["command"],
  BashOutput: ["bash_id"],
  KillShell: ["shell_id"],
  Read: ["file_path", "pages"],
  Write: ["file_path"],
  Edit: ["file_path"],
  NotebookEdit: ["notebook_path"],
  Glob: ["pattern", "path"],
  Grep: ["pattern", "path", "glob"],
  Task: ["prompt"],
  Agent: ["prompt"],
  WebFetch: ["url"],
  WebSearch: ["query"],
  ToolSearch: ["query"],
  Skill: ["skill", "args"],
  Workflow: ["name", "scriptPath", "script"],
  Monitor: ["command", "ws"],
  TaskOutput: ["task_id"],
  TaskStop: ["task_id"],
  SendMessage: ["to", "message"],
  ScheduleWakeup: ["reason", "prompt"]
};

// The call's own account of itself, kept apart from what it did so both can be read at a glance.
const DESCRIPTION_FIELDS = ["description", "reason"] as const;

// Between two fields of one call, and between the pairs of a call with no rule of its own.
const FIELD_SEPARATOR = " · ";

// A cut line is a JSON that never closed, so the pairs are read out of it by hand rather than
// parsed. The scan is deliberately plain: a name, a colon, and a scalar.
// The closing quote is optional, because a value the cap cut off in the middle is still the
// best thing the row can say about that call.
const PAIR = /"([A-Za-z_][\w.-]*)"\s*:\s*("(?:[^"\\]|\\.)*"?|-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?|true|false|null)/g;

// A row is one flowing line however the argument was written, so the newlines and the runs of
// spaces inside a command or a prompt are levelled here. The fold under the row keeps the
// argument exactly as it was.
function scalar(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const text = typeof value === "string" ? value : JSON.stringify(value);

  return text.replace(/\s+/g, " ").trim();
}

// What each escape stands for. Only the ones a value of this kind actually carries are here; a
// mark not among them is left as it was written rather than guessed at.
const ESCAPES: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  b: "\b",
  f: "\f",
  '"': '"',
  "/": "/",
  "\\": "\\"
};

// What a value the cap cut in half says: the quote it opened with is dropped and the escapes it
// did carry are read, which is as much as anyone can make of it. It is one pass, so a backslash
// takes the character after it with it — a value holding a backslash of its own before an n
// reads as that backslash and that n, where reading the marks one after another would have made
// a line break out of the pair. The value comes out as it was written; the row's own line levels
// its newlines itself, and the fold under it wants them kept.
function unescaped(raw: string): string {
  const body = raw.startsWith('"') ? raw.slice(1) : raw;

  return body.replace(/\\([\s\S])/g, (whole, mark: string) => ESCAPES[mark] ?? whole);
}

// The arguments of a call as a map of name to text, whether the line survived whole or was cut
// at the writer's cap.
function argumentsOf(text: string): Map<string, string> {
  const fields = new Map<string, string>();

  try {
    const parsed: unknown = JSON.parse(text);

    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        fields.set(key, scalar(value));
      }

      return fields;
    }
  } catch {
    // A line the writer cut leaves an unclosed JSON; what is there is still worth reading.
  }

  PAIR.lastIndex = 0;

  let match: RegExpExecArray | null;

  while ((match = PAIR.exec(text)) !== null) {
    const name = match[1] ?? "";
    const raw = match[2] ?? "";

    if (fields.has(name)) {
      continue;
    }

    try {
      fields.set(name, scalar(JSON.parse(raw)));
    } catch {
      fields.set(name, scalar(unescaped(raw)));
    }
  }

  return fields;
}

export function toolCall(name: string | null, text: string): ToolCall {
  const fields = argumentsOf(text);
  const told =
    DESCRIPTION_FIELDS.map((key) => ({ key, value: fields.get(key) ?? "" })).find((field) => field.value !== "") ?? null;
  const wanted = TOOL_FIELDS[name ?? ""];
  // A field the tool's own rule already tells with is not told twice as its description.
  const spoken = new Set(wanted ?? []);
  const description =
    told === null || spoken.has(told.key) ? null : told.value;
  const telling =
    wanted === undefined
      ? [...fields]
          .filter(([key, value]) => value !== "" && !(DESCRIPTION_FIELDS as readonly string[]).includes(key))
          .map(([key, value]) => `${key}=${value}`)
      : wanted.map((key) => fields.get(key) ?? "").filter((value) => value !== "");

  // A call whose arguments say nothing readable — an empty object, a line cut before its first
  // value — still has its own line and its own fold; the row simply has nothing to add.
  return { head: telling.join(FIELD_SEPARATOR), description };
}

// What the fold shows for one argument of a call: the name it was sent under, its value as
// reading matter, whether that value wants a block of its own, and whether what stands there
// was clipped.
export interface ToolArgument {
  name: string;
  value: string;
  block: boolean;
  cut: boolean;
}

// A value sits beside its name while it is short enough to be taken in there; past that it
// wants a block. A value with a newline in it wants one whatever its length.
const INLINE_LENGTH = 64;

// How much of one value the fold stands. The writer caps a stored call at 2000 characters, so a
// single value running to 1500 is very nearly the whole record, and twenty lines is a screenful:
// past either the fold stops reading as the call and starts reading as the value alone.
const VALUE_LINES = 20;
const VALUE_CHARS = 1500;

// A string stands exactly as it was sent — a command, a path, a patch or a prompt only reads if
// its own newlines and indentation stand. Anything else is written out indented, so a nested
// shape reads as a shape rather than as one long line.
function readable(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

// The value cut down to what the fold stands, and whether the cutting took anything away.
function clipped(value: string): { value: string; cut: boolean } {
  const lines = value.split("\n");
  const shown = (lines.length > VALUE_LINES ? lines.slice(0, VALUE_LINES).join("\n") : value).slice(0, VALUE_CHARS);

  return { value: shown, cut: shown.length < value.length };
}

function argument(name: string, value: string): ToolArgument {
  const { value: shown, cut } = clipped(value);

  return { name, value: shown, block: shown.includes("\n") || shown.length > INLINE_LENGTH, cut };
}

// The arguments of a call laid out to be read: each one under the name it was sent under, each
// value as it stands. A line the writer cut never closed its JSON, so what is in it is read out
// by the same scan the row's own line uses and the caller is told the record itself is short.
// A stored text that is no object at all — a bare string, an array, something that parses as
// nothing — comes out as one nameless value holding the whole of it, so the fold never stands
// empty while there is something to read; a call sent with no arguments has nothing to draw and
// draws nothing.
export function toolArguments(text: string): { args: ToolArgument[]; whole: boolean } {
  if (text.trim() === "") {
    return { args: [], whole: true };
  }

  try {
    const parsed: unknown = JSON.parse(text);

    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return {
        args: Object.entries(parsed as Record<string, unknown>).map(([name, value]) => argument(name, readable(value))),
        whole: true
      };
    }

    return { args: [argument("", readable(parsed))], whole: true };
  } catch {
    // A line the writer cut leaves an unclosed JSON; what is there is still worth reading.
  }

  const args: ToolArgument[] = [];
  const seen = new Set<string>();

  PAIR.lastIndex = 0;

  let match: RegExpExecArray | null;

  while ((match = PAIR.exec(text)) !== null) {
    const name = match[1] ?? "";
    const raw = match[2] ?? "";

    if (seen.has(name)) {
      continue;
    }

    seen.add(name);

    try {
      args.push(argument(name, readable(JSON.parse(raw))));
    } catch {
      args.push(argument(name, unescaped(raw)));
    }
  }

  return { args: args.length > 0 ? args : [argument("", text)], whole: false };
}

// What a result shows before it is opened: its first line with something in it, and how long
// the whole of it is, so a glance says whether it is worth opening.
export function resultPreview(text: string): { head: string; lines: number } {
  // A text that ends with a newline ends there; the empty piece after it is not a line.
  const lines = text.replace(/\n$/, "").split("\n");
  const head = lines.find((line) => line.trim() !== "")?.trim() ?? "";

  return { head, lines: lines.length };
}

// The log as the screen walks it, oldest first. A result is folded under the call it answers
// so the two read as one thing, and a line fanned out by a Task call is indented under that call
// so the branch reads on its own.
export function buildLog(lines: AgentLogLine[]): LogRow[] {
  const rows: LogRow[] = [];
  const calls = new Map<string, LogRow>();

  for (const line of lines) {
    // A result whose call has already scrolled out of the window has nothing to sit under,
    // so it stands as a row of its own.
    if (line.kind === "tool-result" && line.ref !== null) {
      const call = calls.get(line.ref);

      if (call !== undefined) {
        call.results.push(line);
        continue;
      }
    }

    const row: LogRow = {
      key: String(line.id),
      line,
      results: [],
      depth: line.parent === null ? 0 : BRANCH_DEPTH
    };

    if (line.kind === "tool" && line.ref !== null) {
      calls.set(line.ref, row);
    }

    rows.push(row);
  }

  return rows;
}

// One agent's log. The archive only ever gains lines and their ids run forward, so a page
// that comes back is merged in by id: the newest page on opening, older pages upward, and
// whatever landed after the last id held on every poll.
// The lines one finished run left, read once and whole enough for a reader to see what that run
// did. It is the archive's own answer, so the same run read again reads the same — which is what
// lets a room show a turn's actions long after the turn ended. A page begins at the run and runs
// on into what followed it, so what is not this run's is dropped here; a run longer than one page
// comes back short, and whoever shows it says so rather than passing it off as the whole.
export async function readRunLines(agent: string, run: string): Promise<AgentLogLine[]> {
  const page = await $fetch<AgentLogPage>(`/api/agents/${encodeURIComponent(agent)}/log`, {
    query: { run, limit: PAGING.maxSize }
  });

  return page.lines.filter((line) => line.run === run);
}

export function useAgentLog(t: Translate, name: string): AgentLogFeed {
  const describe = (error: unknown): string => failureText(error, t("agents.error.log_read_failed"));

  const lines = ref<AgentLogLine[]>([]);
  const failure = ref<string | null>(null);
  const older = ref(false);
  const newer = ref(false);
  const loading = ref(true);
  const loadingOlder = ref(false);

  const path = `/api/agents/${encodeURIComponent(name)}/log`;
  // The run the log opened at, which a page read forward names: the log is read by its run.
  let openRun: string | undefined;

  const rows = computed<LogRow[]>(() => buildLog(lines.value));

  function merge(page: AgentLogPage): number {
    if (page.unavailable === true) failure.value = t("agents.status.log_unavailable");

    const byId = new Map(lines.value.map((line) => [line.id, line]));
    let added = 0;

    for (const line of page.lines) {
      if (!byId.has(line.id)) {
        added += 1;
      }

      byId.set(line.id, line);
    }

    lines.value = [...byId.values()].sort((left, right) => left.id - right.id);

    return added;
  }

  async function fetchPage(query: Record<string, number | string | undefined>): Promise<AgentLogPage> {
    return await $fetch<AgentLogPage>(path, { query: { ...query, limit: AGENT_LOG_PAGE_SIZE } });
  }

  async function load(): Promise<void> {
    loading.value = true;
    failure.value = null;

    try {
      const page = await fetchPage({});

      merge(page);
      older.value = page.hasMore;
      newer.value = false;
    } catch (error) {
      failure.value = describe(error);
    } finally {
      loading.value = false;
    }
  }

  // Opens where one run begins, named either by the log's own name for it or by the second and
  // the room it ran for. The log runs on in both directions from there, so both are said to be
  // there, and nothing is followed until the reader has caught up.
  async function loadAt(place: LogPlace): Promise<void> {
    loading.value = true;
    failure.value = null;

    try {
      openRun = "run" in place ? place.run : undefined;

      const page = await fetchPage({ ...place });

      merge(page);
      older.value = page.hasOlder === true;
      newer.value = page.hasMore;
    } catch (error) {
      failure.value = describe(error);
    } finally {
      loading.value = false;
    }
  }

  // Returns how many lines were added, so the view can hold its scroll position.
  async function loadOlder(): Promise<number> {
    const oldest = lines.value[0];

    if (loadingOlder.value || !older.value || oldest === undefined) {
      return 0;
    }

    loadingOlder.value = true;

    try {
      const page = await fetchPage({ before: oldest.id });
      const added = merge(page);

      older.value = page.hasMore;

      return added;
    } catch (error) {
      failure.value = describe(error);

      return 0;
    } finally {
      loadingOlder.value = false;
    }
  }

  async function follow(): Promise<number> {
    const newest = lines.value[lines.value.length - 1];

    try {
      const page = await fetchPage({ after: newest?.id ?? 0, run: openRun });

      failure.value = null;

      const added = merge(page);

      newer.value = page.hasMore;

      return added;
    } catch (error) {
      failure.value = describe(error);

      return 0;
    }
  }

  return { rows, older, newer, loading, loadingOlder, failure, load, loadAt, loadOlder, follow };
}



// One run of the log as the progress stepper stands it: its lines in the order they came, and the
// lines that open and close it where the page holds them. Runs that went side by side each keep their
// own lines, so a run is gathered by its name rather than cut wherever another run's line falls between.
export interface LogRun {
  run: string;
  rows: LogRow[];
  start: AgentLogLine | null;
  end: AgentLogLine | null;
  // When its first and its last line on the page were written.
  first: number;
  last: number;
  chatId: number | null;
}

export function logRuns(rows: readonly LogRow[]): LogRun[] {
  const runs = new Map<string, LogRun>();

  for (const row of rows) {
    const line = row.line;
    let run = runs.get(line.run);

    if (run === undefined) {
      run = { run: line.run, rows: [], start: null, end: null, first: line.at, last: line.at, chatId: line.chatId };
      runs.set(line.run, run);
    }

    run.rows.push(row);
    run.last = Math.max(run.last, line.at, ...row.results.map((result) => result.at));
    run.chatId ??= line.chatId;

    if (row.depth === 0 && line.kind === "start" && run.start === null) run.start = line;
    if (row.depth === 0 && line.kind === "end") run.end = line;
  }

  return [...runs.values()];
}

// Whether a run is the one a screen was opened at: the run it named, or the first run that began at
// or after the second it named, in the room it named.
export function openedRun(runs: readonly LogRun[], place: LogPlace | null): string | null {
  if (place === null) return null;
  if ("run" in place) return place.run;

  return runs.find((run) => run.first >= place.at && (place.chat === undefined || run.chatId === place.chat))?.run ?? null;
}

// A run's step: running while it has no end line and is the newest run of a log read to its end,
// failed or done by its end line, and otherwise said to have left no end line. It stands open when it
// is the newest run, still going, or the run the screen was opened at.
export function runStep(t: Translate, run: LogRun, at: { newest: boolean; atEnd: boolean; opened: boolean }): StepperStep {
  const state: StepState = run.end !== null ? (run.end.state === "failed" ? "failed" : "done") : at.newest && at.atEnd ? "running" : "unended";
  const headline = run.start?.text.split("\n").find((part) => part.trim() !== "")?.trim() ?? "";
  const title = run.start === null ? t("agents.label.run_continued") : headline === "" ? t(KIND_LOOKS.start.label) : headline;
  const took = run.last - run.first;

  return {
    key: run.run,
    state,
    stateLabel: t(RUN_STATE_LABELS[state]),
    title,
    time: took > 0 ? `${formatTime(run.first)} · ${spanClock(t, took)}` : formatTime(run.first),
    open: at.newest || state === "running" || at.opened
  };
}

const RUN_STATE_LABELS: Record<StepState, string> = {
  pending: "agents.label.run_unended",
  running: "agents.label.run_running",
  done: "agents.label.run_done",
  failed: "agents.label.run_failed",
  skipped: "agents.label.run_unended",
  unended: "agents.label.run_unended"
};
