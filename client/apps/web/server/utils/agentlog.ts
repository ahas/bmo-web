import { PAGING } from "#shared/config";

import { mcpCallOf } from "#shared/mcp-names";

import { agency, agencyCall } from "./agency";
import { unitFetch } from "./units";

import type { LogLine } from "@agency/client";
import type { AgentLogLine, AgentLogPage, AgentLogState, AgentLogTool } from "#shared/types";

// An agent's log as the agency's fixed API holds it (the agency's `docs/api.md`, 「log-lines」): every line the agent
// left, across its runs, oldest line first. A screen opens on the agent's newest page, goes back by the id of the
// oldest line it holds, follows by the id of the newest, and opens at the page a moment stands in, narrowed to a
// room where one is named (the agency's `GET /log/agents/{agentName}/lines`). One run's own lines are read from the
// same log narrowed to that run, where a screen stands at a run (the agency's `GET /log-lines`).

// The most lines one read of the agency answers.
const AGENCY_PAGE = 500;

// The page a link names where the agency holds no such run: an empty page the screen says it cannot read.
const UNAVAILABLE: AgentLogPage = { lines: [], hasMore: false, unavailable: true };

// One more line than asked for is read, and its presence is what says a page is waiting.
function pageWindow(limit: number): number {
  return Math.min(limit, PAGING.maxSize) + 1;
}

// The run a screen names by its own name, as the agency numbers it, with the agent its lines are written under: a
// co-work stage's run is named from its order, whose worker need not be the agent that ran it.
async function runOf(run: string): Promise<{ id: number; agent: string } | null> {
  const page = await agencyCall(agency().GET("/runs", { params: { query: { names: run, limit: 1 } } }));
  const found = page.items[0];

  return found === undefined ? null : { id: found.id, agent: found.agentName };
}

/** One run's lines of an agent's, oldest first, after `after` where it is given; `hasMore` says another page waits. */
export async function readRunPage(agent: string, run: string, after: number, limit: number): Promise<AgentLogPage> {
  const named = await runOf(run);

  if (named === null) return UNAVAILABLE;

  const runId = named.id;
  const owner = named.agent || agent;
  const window = pageWindow(limit);
  const found: AgentLogLine[] = [];
  let cursor = after;

  for (;;) {
    const page = await agencyCall(
      agency().GET("/log-lines", { params: { query: { runId, agentName: owner, after: cursor, limit: AGENCY_PAGE } } })
    );

    found.push(...page.items.map(asLine));

    if (found.length >= window || !page.more || page.items.length === 0) break;

    cursor = page.items[page.items.length - 1]!.id;
  }

  const held = found.slice(0, window - 1);
  const first = held[0];

  return { lines: held, hasMore: found.length > window - 1, hasOlder: first !== undefined && (await linesBefore(owner, first.id)) };
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
    patches: [],
    patchesMore: 0
  };
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
