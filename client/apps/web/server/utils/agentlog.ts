import { AGENT_LOG_RUN_SCAN, PAGING } from "#shared/config";

import { mcpCallOf } from "#shared/mcp-names";

import { agency, agencyCall } from "./agency";
import { unitFetch } from "./units";

import type { LogLine } from "@agency/client";
import type { AgentLogClock, AgentLogClockEvent, AgentLogLine, AgentLogPage, AgentLogPatch, AgentLogState, AgentLogTool } from "#shared/types";

// An agent's log as the agency's fixed API holds it (the agency's `docs/api.md`, 「log-lines」): every line the agent
// left, across its runs, oldest line first. A screen opens on the agent's newest page, goes back by the id of the
// oldest line it holds, follows by the id of the newest, and opens at the page a moment stands in, narrowed to a
// room where one is named (the agency's `GET /log/agents/{agentName}/lines`). One run's own lines are read from the
// same log narrowed to that run, where a screen stands at a run (the agency's `GET /log-lines`): forward from its start
// or from a line, which is all that read answers, and its newest lines, or the lines before one of it, out of the
// agent's log with the run's lines kept (docs/web.md, 「Where the log comes from」).

// The most lines one read of the agency answers.
const AGENCY_PAGE = 500;

// The page a link names where the agency holds no such run: an empty page the screen says it cannot read.
const UNAVAILABLE: AgentLogPage = { lines: [], hasMore: false, unavailable: true };

// One more line than asked for is read, and its presence is what says a page is waiting.
function pageWindow(limit: number): number {
  return Math.min(limit, PAGING.maxSize) + 1;
}

// The run a screen names by its own name, as the agency numbers it. The agent the ledger names it for is not the one
// its lines stand under — a job's run is named for the checkout it ran in, while its lines stand under the agent that
// ran it — so the run's lines are those of the agent its first line names (`firstLineOf`).
async function runOf(run: string): Promise<number | null> {
  const page = await agencyCall(agency().GET("/runs", { params: { query: { names: run, limit: 1 } } }));

  return page.items[0]?.id ?? null;
}

/** One run's lines of an agent's, oldest first, after `after` where it is given; `hasMore` says another page waits.
 * Where `agent` is named, a run another agent ran reads as unavailable. */
export async function readRunPage(run: string, after: number, limit: number, agent?: string): Promise<AgentLogPage> {
  const runId = await runOf(run);

  if (runId === null) return UNAVAILABLE;

  const first = await firstLineOf(runId);

  if (first === null) return { lines: [], hasMore: false, hasOlder: false };
  if (agent !== undefined && first.agentName !== agent) return UNAVAILABLE;

  const window = pageWindow(limit);
  const found: AgentLogLine[] = [];
  let cursor = after;

  for (;;) {
    const page = await agencyCall(
      agency().GET("/log-lines", { params: { query: { runId, agentName: first.agentName, after: cursor, limit: AGENCY_PAGE } } })
    );

    found.push(...page.items.map(asLine));

    if (found.length >= window || !page.more || page.items.length === 0) break;

    cursor = page.items[page.items.length - 1]!.id;
  }

  const held = found.slice(0, window - 1);
  const oldest = held[0];

  // What stands above the run is asked of the agent its lines stand under, not the one the ledger names the run for.
  return { lines: held, hasMore: found.length > window - 1, hasOlder: oldest !== undefined && (await linesBefore(oldest.agent, oldest.id)) };
}

// Whether any line of the agent's stands before one the page holds: a run's own read cannot say, so the agent's log
// is asked for the single line before it. A read that fails leaves the page without an older side rather than
// failing it.
async function linesBefore(agent: string, before: number): Promise<boolean> {
  try {
    const page = await agentLines(agent, { before, limit: 1 });

    return page.items.length > 0;
  } catch {
    return false;
  }
}

// A run's first line, or null where it left none, read by the run alone: where a read back through the agent's log
// stops, and the line that names the agent the run's lines stand under and the job they carry where it is a job's run.
// Another agent's lines the same run carries are not the run's as this agent's log shows it.
async function firstLineOf(runId: number): Promise<LogLine | null> {
  const page = await agencyCall(agency().GET("/log-lines", { params: { query: { runId, after: 0, limit: 1 } } }));

  return page.items[0] ?? null;
}

// Whether a line of the agent's log is the run's: one carrying the run, or, for a job's run, the job its first line
// carries, since an agent's log names a job's lines by their job and no run (docs/web.md, 「Where the log comes
// from」).
function ofRun(line: LogLine, runId: number, first: LogLine): boolean {
  return line.id >= first.id && (line.runId === runId || (first.jobId !== null && line.jobId === first.jobId));
}

// The id of a run's newest line before `below`, the run's first line standing before it. A read of the run's own
// lines answers the first one past an id, so each one-line read either lifts the low end to a line of the run or
// brings the high end down to the middle, and the stretch between them halves.
async function lastLineBefore(runId: number, owner: string, first: number, below: number): Promise<number> {
  let low = first;
  let high = below - 1;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const page = await agencyCall(agency().GET("/log-lines", { params: { query: { runId, agentName: owner, after: middle, limit: 1 } } }));
    const next = page.items[0]?.id;

    if (next !== undefined && next <= high) low = next;
    else high = middle;
  }

  return low;
}

// A run's lines read back through its agent's log, from the newest page or from the page before `before`: the lines
// of the run it kept, oldest first, and the oldest id it looked at. It stops once it holds `want` of them, has passed
// the run's first line, has reached the log's first line, or has looked through `AGENT_LOG_RUN_SCAN` lines, so a run
// with few lines among the agent's never reads the agent's whole log.
async function scanBack(runId: number, first: LogLine, before: number | null, want: number): Promise<{ found: LogLine[]; reached: number | null }> {
  const found: LogLine[] = [];
  let cursor = before;
  let looked = 0;

  for (;;) {
    const page = await agentLines(first.agentName, { limit: AGENCY_PAGE, ...(cursor === null ? {} : { before: cursor }) });
    const head = page.items[0];

    if (head === undefined) break;

    found.unshift(...page.items.filter((one) => ofRun(one, runId, first)));
    looked += page.items.length;
    cursor = head.id;

    if (found.length >= want || head.id <= first.id || !page.hasMore || looked >= AGENT_LOG_RUN_SCAN) break;
  }

  return { found, reached: cursor };
}

/** One run's newest lines of an agent's, or the run's lines before `before`, oldest first; `hasMore` says lines of the
 * run wait above them. The agency reads a run's own lines forward from its start alone, so they are read out of the
 * agent's log (docs/web.md, 「Where the log comes from」). */
export async function readRunBack(run: string, before: number | null, limit: number, agent?: string): Promise<AgentLogPage> {
  const runId = await runOf(run);

  if (runId === null) return UNAVAILABLE;

  const want = Math.min(limit, PAGING.maxSize);
  const first = await firstLineOf(runId);

  if (first !== null && agent !== undefined && first.agentName !== agent) return UNAVAILABLE;
  if (first === null || (before !== null && first.id >= before)) return { lines: [], hasMore: false };

  // The run's lines are read out of the log of the agent its first line names: a job's run stands in the ledger under
  // the checkout it ran in, while its lines stand under the agent that ran it.
  let read = await scanBack(runId, first, before, want);

  // None of the run's lines among those looked through, and its first line not reached: the run ended under later
  // runs, so its newest line before them is found and the log read back from there.
  if (read.found.length === 0 && read.reached !== null && read.reached > first.id) {
    const last = await lastLineBefore(runId, first.agentName, first.id, read.reached);

    read = await scanBack(runId, first, last + 1, want);
  }

  const held = read.found.slice(-want).map(asLine);
  const oldest = held[0];

  return { lines: held, hasMore: oldest !== undefined && oldest.id > first.id };
}

// Where a page of an agent's log is read from: no place is its newest page.
export interface AgentLogRead {
  // The id of the oldest line the reader holds, whose page comes before it.
  before?: number;
  // The id of the newest line the reader holds, whose page comes after it.
  after?: number;
  // A moment in unix seconds, whose page opens at the head of the run standing there.
  at?: number;
  // The room that moment is narrowed to.
  chat?: number;
}

// One page of the agency's answer, as its document states it (the agency's `docs/api.md`, 「log-lines」).
interface AgentLinesPage {
  items: LogLine[];
  hasMore: boolean;
  hasOlder: boolean;
}

// The agency's page of one agent's log. The published client's schema was generated before the agency served this
// route, so it is read from the agency's own address, its answer taken in the shape the agency's document states.
async function agentLines(agent: string, query: Record<string, number>): Promise<AgentLinesPage> {
  const search = new URLSearchParams(Object.entries(query).map(([key, value]) => [key, String(value)]));

  return await unitFetch<AgentLinesPage>("AGENCY", `/log/agents/${encodeURIComponent(agent)}/lines?${search}`);
}

/** One page of an agent's log across its runs: the newest page where no place is named, the page before or after an
 * id, or the page a moment stands in, narrowed to a room where one is named. */
export async function readAgentPage(agent: string, read: AgentLogRead, limit: number): Promise<AgentLogPage> {
  const query: Record<string, number> = { limit: Math.min(limit, AGENCY_PAGE) };
  const at = read.at === undefined || read.at <= 0 ? null : read.at;

  if (at !== null) {
    // The agency keeps its clock in milliseconds, and every moment a link names is in the seconds this console keeps.
    query.at = at * 1000;

    if (read.chat !== undefined) query.chat = read.chat;
  } else if (read.before !== undefined && read.before > 0) {
    query.before = read.before;
  } else if (read.after !== undefined && read.after > 0) {
    // An id of zero names no line, and a reader holding none asks for the newest page rather than a page after the
    // first line ever written.
    query.after = read.after;
  }

  const page = await agentLines(agent, query);

  return { lines: page.items.map(asLine), hasMore: page.hasMore, ...(at === null ? {} : { hasOlder: page.hasOlder }) };
}

// The fields a line's writer kept beside it, read by name where they are there.
function fieldOf<T>(line: LogLine, name: string, read: (value: unknown) => T | null): T | null {
  const fields = line.fields;

  return typeof fields === "object" && fields !== null && name in fields ? read((fields as Record<string, unknown>)[name]) : null;
}

function stringField(line: LogLine, name: string): string | null {
  return fieldOf(line, name, (value) => (typeof value === "string" ? value : null));
}

function asLine(line: LogLine): AgentLogLine {
  return {
    id: line.id,
    agent: line.agentName,
    run: stringField(line, "run") ?? String(line.runId),
    chatId: fieldOf(line, "chatId", (value) => (typeof value === "number" ? value : null)),
    at: Math.floor(line.at / 1000),
    kind: line.kind as AgentLogLine["kind"],
    name: stringField(line, "name"),
    tool: toolOf({ kind: line.kind as AgentLogLine["kind"], name: stringField(line, "name") }),
    parent: stringField(line, "parent"),
    // The agency's document names it `ref`, and its lines carry it as `reference` (docs/boundary.md, 「Gaps the console
    // meets」).
    ref: stringField(line, "ref") ?? stringField(line, "reference"),
    state: fieldOf(line, "state", (value) => (typeof value === "string" ? (value as AgentLogState) : null)),
    truncated: fieldOf(line, "truncated", (value) => value === true) === true,
    text: line.text,
    ...patchesOf(line),
    clock: line.kind === "note" ? clockOf(line) : null
  };
}

const CLOCK_EVENTS: readonly AgentLogClockEvent[] = ["started", "running", "asked", "kept", "ask-failed", "cut", "ended"];
const CLOCK_CUTS: readonly NonNullable<AgentLogClock["cut"]>[] = ["no-progress", "no-process", "supervisor", "stop"];
const CLOCK_OUTCOMES: readonly NonNullable<AgentLogClock["outcome"]>[] = ["completed", "failed", "ended-with-turn"];

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function numberOr(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * What the agency's call clock said of a tool call, as the fields it keeps on the note it wrote (the agency's
 * `docs/agent-control.md`, 「A job turn's tool calls are held to a clock」); null for a note that carries none. The
 * agency answers a note filed before it kept them with the same fields, so the sentence is never read here.
 */
export function clockOf(line: Pick<LogLine, "fields"> & { metadata?: unknown }): AgentLogClock | null {
  const metadata = line.metadata ?? fieldOf(line as LogLine, "metadata", (value) => value);
  const held = typeof metadata === "object" && metadata !== null ? (metadata as Record<string, unknown>).toolClock : null;

  if (typeof held !== "object" || held === null) return null;

  const clock = held as Record<string, unknown>;
  const event = oneOf(clock.event, CLOCK_EVENTS);

  if (event === null || typeof clock.tool !== "string") return null;

  return {
    event,
    call: typeof clock.call === "string" ? clock.call : null,
    tool: clock.tool,
    command: typeof clock.command === "string" ? clock.command : "",
    pid: numberOr(clock.pid),
    elapsedMs: numberOr(clock.elapsedMs),
    silentMs: numberOr(clock.silentMs),
    keptMs: numberOr(clock.keptMs),
    why: typeof clock.why === "string" ? clock.why : null,
    cut: oneOf(clock.cut, CLOCK_CUTS),
    outcome: oneOf(clock.outcome, CLOCK_OUTCOMES)
  };
}

// The most diff lines one line's changes are sent with; a change past it stands as the ordinary result instead
// (docs/web.md, 「Agent log」, the file change block).
const MOST_PATCH_LINES = 4_000;

interface RecordedHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

function isHunk(value: unknown): value is RecordedHunk {
  if (typeof value !== "object" || value === null) return false;

  const hunk = value as Record<string, unknown>;

  return (
    typeof hunk.oldStart === "number" &&
    typeof hunk.oldLines === "number" &&
    typeof hunk.newStart === "number" &&
    typeof hunk.newLines === "number" &&
    Array.isArray(hunk.lines) &&
    hunk.lines.every((one) => typeof one === "string")
  );
}

/**
 * The files a shell command changed, as the structured result its program recorded says: Claude Code's Bash result
 * and a pane program's shell result both carry the changed files with their hunks, the files past the record's own
 * cap by path alone, and every changed path. The agency keeps that result beside the line, and the screen is sent
 * the patches alone, each marked as a command's change, so the block under the command reads `Updated <path>`. A
 * change longer than the screen is sent stands as the ordinary result.
 */
export function patchesOf(line: Pick<LogLine, "fields"> & { metadata?: unknown }): Pick<AgentLogLine, "patches" | "patchesMore"> {
  const none = { patches: [], patchesMore: 0 };
  const metadata = line.metadata ?? fieldOf(line as LogLine, "metadata", (value) => value);

  if (typeof metadata !== "object" || metadata === null) return none;

  const result = (metadata as Record<string, unknown>).toolUseResult;

  if (typeof result !== "object" || result === null) return none;

  const diff = (result as Record<string, unknown>).bashEditDiff;

  if (typeof diff !== "object" || diff === null) return none;

  const recorded = diff as Record<string, unknown>;
  const files = Array.isArray(recorded.files) ? recorded.files : [];
  const patches: AgentLogPatch[] = [];
  let lines = 0;

  for (const one of files) {
    if (typeof one !== "object" || one === null) continue;

    const file = one as Record<string, unknown>;

    if (typeof file.filePath !== "string") continue;

    const hunks = Array.isArray(file.hunks) ? file.hunks.filter(isHunk) : [];

    lines += hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0);
    patches.push({ filePath: file.filePath, type: null, by: "command", hunks, content: null, tooLarge: false });
  }

  if (patches.length === 0) return none;

  const named = new Set(patches.map((patch) => patch.filePath));
  const changed = Array.isArray(recorded.changedFiles) ? recorded.changedFiles.filter((path): path is string => typeof path === "string") : [];
  const more = typeof recorded.moreFiles === "number" ? recorded.moreFiles : Array.isArray(recorded.moreFiles) ? recorded.moreFiles.length : 0;
  const unnamed = changed.filter((path) => !named.has(path)).length;

  if (lines > MOST_PATCH_LINES) {
    return { patches: patches.map((patch) => ({ ...patch, hunks: [], tooLarge: true })), patchesMore: Math.max(more, unnamed) };
  }

  return { patches, patchesMore: Math.max(more, unnamed) };
}

/**
 * How a call and its result show their tool: the tool's own name — an MCP tool's read out of the name its road
 * logged it under, without the server. Which icon a tool declares is the tool host's to say, and no unit hands
 * it to the console yet, so every tool takes the one generic icon.
 */
export function toolOf(line: Pick<AgentLogLine, "kind" | "name">): AgentLogTool | null {
  if (line.name === null || (line.kind !== "tool" && line.kind !== "tool-result")) {
    return null;
  }

  return { name: mcpCallOf(line.name)?.tool ?? line.name, icon: null };
}
