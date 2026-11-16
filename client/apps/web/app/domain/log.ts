import { AGENT_LOG_OPENING_SIZE, AGENT_LOG_PAGE_SIZE, PAGING } from "#shared/config";
import { clockFitsCall, clockKey, foldClock, newClock, settleClock } from "./tool-clock";
import { valueText } from "./value-text";
import { failureText } from "bmo-ui/app/domain/errors";
import { sameRowsKept } from "./same-kept";

import type { ToolClockView } from "./tool-clock";

import type { AgentLogClock, AgentLogContext, AgentLogContextState, AgentLogKind, AgentLogLine, AgentLogPage } from "#shared/types";
import type { Translate } from "#shared/wording";
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
  // Whether a call is still running: a pane program said it began and has not said it settled.
  running?: boolean;
  // What the agency's call clock said of the call, its notes folded into one (docs/web.md, 「A call's clock lines are
  // no line of the log either」). A row whose line is a clock note rather than a call stands for a call not on the
  // page.
  clock?: ToolClockView;
}

// Where in a log a screen is to open: the log's own name for one run, or the second one began
// and the room it ran for.
// A run to open at, and whether the log stands that run's lines alone, as a job's log does; or a moment.
export type LogPlace = { run: string; only?: boolean } | { at: number; chat?: number };

export interface AgentLogFeed {
  rows: ComputedRef<LogRow[]>;
  // Every line held, the progress records the rows leave out among them.
  lines: Ref<AgentLogLine[]>;
  older: Ref<boolean>;
  // Whether the log goes on past the last line held. A screen that opened on the newest page
  // is at the end and this is false; one that opened at a moment in the log has the rest of it
  // still ahead.
  newer: Ref<boolean>;
  loading: Ref<boolean>;
  loadingOlder: Ref<boolean>;
  failure: Ref<string | null>;
  load: () => Promise<void>;
  // The page one run begins at, or a moment stands in. Answers the id of the page's first line, where the view stands
  // the reader, or null where the page held none or could not be read.
  loadAt: (place: LogPlace) => Promise<number | null>;
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
  end: { label: "agents.label.line_end", color: "warning", words: true },
  // A progress record is read into what it says and never stands as a line; its look is only a fallback.
  progress: { label: "agents.label.line_unknown", color: "neutral", words: false },
  answer: { label: "agents.label.line_answer", color: "primary", words: true }
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

/** Whether the console knows a line's kind; one it does not wears its own word and folds what it holds. */
export function knownKind(kind: string): boolean {
  return kind in KIND_LOOKS;
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

  return valueText(value).replace(/\s+/g, " ").trim();
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
// its own newlines and indentation stand. Anything else is written out as its named fields and rows,
// so a nested shape reads as a shape rather than as JSON.
function readable(value: unknown): string {
  return valueText(value);
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
// so the branch reads on its own. The call clock's notes are folded into the call they are of.
export function buildLog(lines: AgentLogLine[]): LogRow[] {
  const rows: LogRow[] = [];
  const calls = new Map<string, LogRow>();
  // The calls a pane program said began and has not said settled, by the call's id.
  const going = new Set<string>();
  // The row each call's clock stands on, by the clock's key: the call's own, or one standing in for it.
  const clocks = new Map<string, LogRow>();

  // A call's clock carried by a row standing in for it moves onto the call once the call's own line is read, and the
  // stand-in goes.
  function adopt(call: LogRow): void {
    for (const [key, held] of clocks) {
      const clock = held.clock;

      if (held.line.kind === "tool" || clock === undefined || call.clock !== undefined) continue;

      // A clock with no call id is only ever a call's that is still running: an ended one was another run's.
      const ours = clock.call !== null ? clock.call === call.line.ref : clock.state === "running" && clockFitsCall(call.line, held.line.run, clock);

      if (!ours) continue;

      call.clock = clock;
      clocks.set(key, call);
      rows.splice(rows.indexOf(held), 1);
    }
  }

  // The newest call on the page a note with no call id is of, one carrying no clock yet.
  function callFor(line: AgentLogLine, clock: AgentLogClock): LogRow | undefined {
    if (clock.call !== null) {
      const call = calls.get(clock.call);

      return call?.clock === undefined ? call : undefined;
    }

    return rows.findLast((row) => row.line.kind === "tool" && row.clock === undefined && clockFitsCall(row.line, line.run, clock));
  }

  function foldNote(line: AgentLogLine, clock: AgentLogClock): void {
    const key = clockKey(line, clock);
    let row = clocks.get(key);

    // A start after the call's end is a new run of the same command.
    if (row?.clock !== undefined && clock.event === "started" && row.clock.state !== "running") row = undefined;

    if (row === undefined) {
      row = callFor(line, clock);

      if (row === undefined) {
        row = { key: String(line.id), line, results: [], depth: line.parent === null ? 0 : BRANCH_DEPTH };
        rows.push(row);
      }

      row.clock = newClock(key, clock);
      clocks.set(key, row);
    }

    foldClock(row.clock!, line, clock);
  }

  for (const line of lines) {
    // A pane program's progress record is no line of the log: a call's start and settling mark its call, and the rest
    // is read by the work view's head (docs/web.md, 「Agent screen」).
    if (line.kind === "progress") {
      const progress = progressOf(line);

      if (progress?.callId != null) {
        if (progress.state === "in_progress") going.add(progress.callId);
        else going.delete(progress.callId);

        const call = calls.get(progress.callId);

        if (call !== undefined) call.running = going.has(progress.callId) && call.results.length === 0;
      }

      continue;
    }

    // A clock note is no line of the log either: it is the clock of the call it is of.
    if (line.clock != null) {
      foldNote(line, line.clock);
      continue;
    }

    // A result whose call has already scrolled out of the window has nothing to sit under,
    // so it stands as a row of its own.
    if (line.kind === "tool-result" && line.ref !== null) {
      const call = calls.get(line.ref);

      if (call !== undefined) {
        call.results.push(line);
        call.running = false;

        if (call.clock !== undefined) settleClock(call.clock, line.state === "failed" ? "failed" : "completed", line.at);

        continue;
      }
    }

    // A run's end ends every call of it still running.
    if (line.kind === "end") {
      for (const held of clocks.values()) {
        if (held.clock !== undefined && held.line.run === line.run) settleClock(held.clock, "ended-with-turn", line.at);
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
      row.running = going.has(line.ref);
    }

    rows.push(row);

    if (line.kind === "tool") adopt(row);
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
// comes back short, and whoever shows it says so rather than passing it off as the whole. It is read from its start: the
// lines after none.
export async function readRunLines(agent: string, run: string): Promise<AgentLogLine[]> {
  const page = await $fetch<AgentLogPage>(`/api/agents/${encodeURIComponent(agent)}/log`, {
    query: { run, after: 0, limit: PAGING.maxSize }
  });

  return page.lines.filter((line) => line.run === run);
}

// A feed scoped to one run reads that run's own lines alone, every page asked for that run: it opens on the run's
// newest lines as the whole log opens on its own, however long the run has gone, reads the run's older lines as the
// reader scrolls up and its newer ones as they come (docs/web.md, the TODO panel's job log entry).
export function useAgentLog(t: Translate, name: string, run: string | null = null): AgentLogFeed {
  const describe = (error: unknown): string => failureText(error, t("agents.error.log_read_failed"));

  const lines = ref<AgentLogLine[]>([]);
  const failure = ref<string | null>(null);
  const older = ref(false);
  const newer = ref(false);
  const loading = ref(true);
  const loadingOlder = ref(false);

  const path = `/api/agents/${encodeURIComponent(name)}/log`;

  // Each row stays the one in hand while it reads the same, so a line arriving draws its own row and no other.
  const rows = computed<LogRow[]>((before) => sameRowsKept(before, buildLog(lines.value), (row) => row.key));

  function merge(page: AgentLogPage): number {
    if (page.unavailable === true) failure.value = t("agents.status.log_unavailable");

    const byId = new Map(lines.value.map((line) => [line.id, line]));
    let added = 0;
    let changed = false;

    for (const line of page.lines) {
      const had = byId.get(line.id);

      if (had === undefined) {
        added += 1;
      }

      // A line read again as it was stays the line in hand, so a read that brought nothing new draws no row again
      // (docs/web.md, 「What the stream costs a tab」).
      if (had === undefined || JSON.stringify(had) !== JSON.stringify(line)) {
        byId.set(line.id, line);
        changed = true;
      }
    }

    if (changed) {
      lines.value = [...byId.values()].sort((left, right) => left.id - right.id);
    }

    return added;
  }

  async function fetchPage(query: Record<string, number | string | undefined>, limit = AGENT_LOG_PAGE_SIZE): Promise<AgentLogPage> {
    return await $fetch<AgentLogPage>(path, { query: { ...query, ...(run === null ? {} : { run }), limit } });
  }

  async function load(): Promise<void> {
    loading.value = true;
    failure.value = null;

    try {
      // The log, or the one run, opens on its newest lines alone, as many as fill a screen: its end, with what lies
      // above it read as the reader scrolls up.
      const page = await fetchPage({}, AGENT_LOG_OPENING_SIZE);

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
  async function loadAt(place: LogPlace): Promise<number | null> {
    loading.value = true;
    failure.value = null;

    try {
      // The page is asked at the run's start, the lines after none, or at the moment; whether the log stands the run
      // alone is the screen's.
      const page = await fetchPage("run" in place ? { run: place.run, after: 0 } : { ...place });

      merge(page);
      older.value = run === null && page.hasOlder === true;
      newer.value = page.hasMore;

      return page.lines[0]?.id ?? null;
    } catch (error) {
      failure.value = describe(error);

      return null;
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
      // A log holding no line yet is read from its newest page: a page is asked for after a line, and there is none
      // to name.
      const page = await fetchPage(newest === undefined ? {} : { after: newest.id });

      failure.value = null;

      const added = merge(page);

      newer.value = page.hasMore;

      return added;
    } catch (error) {
      failure.value = describe(error);

      return 0;
    }
  }

  return { rows, lines, older, newer, loading, loadingOlder, failure, load, loadAt, loadOlder, follow };
}

// A pane program's progress record, read out of the line's text (the agency's docs/run-records.md, 「Agent log」).
export interface ProgressRecord {
  phase: string | null;
  state: string | null;
  tool: string | null;
  callId: string | null;
  usage: { inputTokens: number | null; outputTokens: number | null; cacheReadTokens: number | null } | null;
  context: { size: number; used: number } | null;
}

function numberOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recordOf(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);

    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function progressOf(line: Pick<AgentLogLine, "kind" | "text">): ProgressRecord | null {
  if (line.kind !== "progress") return null;

  const record = recordOf(line.text);

  if (record === null) return null;

  const usage = record.usage !== null && typeof record.usage === "object" ? (record.usage as Record<string, unknown>) : null;
  const context = record.context !== null && typeof record.context === "object" ? (record.context as Record<string, unknown>) : null;
  const size = numberOf(context?.size);
  const used = numberOf(context?.used);

  return {
    phase: typeof record.phase === "string" ? record.phase : null,
    state: typeof record.state === "string" ? record.state : null,
    tool: typeof record.tool === "string" ? record.tool : null,
    callId: typeof record.toolCallId === "string" ? record.toolCallId : null,
    usage: usage === null ? null : { inputTokens: numberOf(usage.inputTokens), outputTokens: numberOf(usage.outputTokens), cacheReadTokens: numberOf(usage.cacheReadTokens) },
    context: size === null || used === null || size <= 0 ? null : { size, used }
  };
}

/** The words of a pane program's answer line, out of its record; the text as it stands where it is no record. */
export function answerText(text: string): string {
  const record = recordOf(text);

  return record !== null && typeof record.text === "string" ? record.text : text;
}

/** What a run's log says it has done so far, for the work view's head while its job runs: the calls whose result came
 * back, the newest usage record, how full the session stands, and what it is doing now. */
export interface LogFigures {
  calls: number;
  usage: ProgressRecord["usage"];
  context: ProgressRecord["context"];
  phase: string | null;
}

export function logFigures(lines: readonly AgentLogLine[], run: string | null): LogFigures {
  const own = run === null ? lines : lines.filter((line) => line.run === run);
  let usage: ProgressRecord["usage"] = null;
  let context: ProgressRecord["context"] = null;
  let phase: string | null = null;

  for (const line of own) {
    const progress = progressOf(line);

    if (progress === null) continue;
    if (progress.usage !== null) usage = progress.usage;
    if (progress.context !== null) context = progress.context;
    if (progress.phase !== null) phase = progress.phase;
  }

  return { calls: own.filter((line) => line.kind === "tool-result").length, usage, context, phase };
}
