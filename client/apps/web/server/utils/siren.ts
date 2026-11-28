import { RUNNER_AGENTS, SIREN_MAX, SIREN_PAGE_SIZE } from "#shared/config";
import { agentProviderNames } from "#shared/types";

import { unitFetch } from "./units";

import type { AgentMode, SirenEvent, SirenWatch } from "#shared/types";

// The cache siren as the console reads it (the cache siren's `docs/api.md`): its sums by session and
// its siren count, its settings, and the newest of its events, at the address `CACHE_SIREN_ADDRESS` names. The
// daemon keeps a window of events, a siren count and three settings; it keeps no quota source and no figure for
// the files it reads, so the screen shows neither. Which agent holds a session and what moved a cache prefix are
// the agency's records, which no route serves the console (docs/boundary.md, 「Gaps the console meets」), so a
// request is named only where a runner's own directory names it and no prefix loss carries a cause.


// The daemon's ring holds the newest 600 events by default and it answers at most 1000 in one page. The console
// reads the whole ring it knows, since the last ten minutes are counted from events rather than from a tally the
// daemon does not keep; the screen then shows one page of them.
const MINUTE_MS = 60_000;
const MINUTES_SHOWN = 10;
const SESSIONS_MOVING_MS = 30 * MINUTE_MS;

interface SirenSessionStats {
  lastAt?: number;
  newTokenCount?: number;
  cachedTokenCount?: number;
  coldCount?: number;
}

interface SirenStats {
  since?: number;
  sirenCount?: number;
  sessions?: SirenSessionStats[];
}

interface SirenSettingsAnswer {
  armed?: boolean;
  ttlMs?: number;
  threshold?: number;
}

interface SirenUsage {
  sessionId?: string;
  modelName?: string;
  at?: number;
  harnessName?: string;
  kind?: string;
  level?: string;
  note?: string;
  newTokenCount?: number;
  cachedTokenCount?: number;
  projectName?: string;
  directoryName?: string;
}

interface SirenSound {
  kind?: string;
  at?: number;
  sessionId?: string | null;
  projectName?: string;
  newTokenCount?: number;
  cachedTokenCount?: number;
  note?: string;
}

interface SirenEventRow {
  id?: number;
  kind?: string;
  at?: number;
  data?: SirenUsage & SirenSound;
}

interface SirenPage {
  items?: SirenEventRow[];
  more?: boolean;
}

// One event as the screen reads it, with the moment it happened kept whole for the minute the figures are
// counted in.
interface ReadRow {
  event: SirenEvent;
  at: number | null;
  usage: boolean;
}

async function ask<T>(path: string, init?: RequestInit): Promise<T> {
  return await unitFetch<T>("CACHE_SIREN", path, init);
}

function unreachable(): SirenWatch {
  return {
    reachable: false,
    since: null,
    newLastMinute: 0,
    perMinute: [],
    sessions30m: 0,
    sirenCount: 0,
    cacheShare: null,
    coldCount: 0,
    settings: { armed: false, ttlMs: 0, threshold: 0 },
    events: [],
    hasMore: false
  };
}

// What the screen stands on: the siren's sums and settings, and the events it holds. A siren that does not answer
// is not this app's failure — the screen says so and shows nothing else.
export async function readSiren(limit: number = SIREN_PAGE_SIZE, now: number = Date.now()): Promise<SirenWatch> {
  const asked = Math.min(Math.max(limit, 1), SIREN_MAX);

  try {
    const [stats, settings, page] = await Promise.all([
      ask<SirenStats>("/stats"),
      ask<SirenSettingsAnswer>("/settings"),
      // A reader asking for JSON is answered a page instead of the stream the route holds open for everyone else.
      ask<SirenPage>(`/events?limit=${SIREN_MAX}`, { headers: { accept: "application/json" } })
    ]);

    // Newest first: the page holds its events oldest first, and the screen reads downward.
    const rows = (page.items ?? [])
      .map(asRow)
      .filter((row): row is ReadRow => row !== null)
      .sort((left, right) => right.event.seq - left.event.seq);

    const sessions = stats.sessions ?? [];
    const cached = sum(sessions.map((session) => session.cachedTokenCount));
    const newTokens = sum(sessions.map((session) => session.newTokenCount));

    return {
      reachable: true,
      since: typeof stats.since === "number" ? stats.since : null,
      newLastMinute: countMinute(rows, now),
      perMinute: countMinutes(rows, now),
      sessions30m: sessions.filter((session) => typeof session.lastAt === "number" && session.lastAt >= now - SESSIONS_MOVING_MS).length,
      sirenCount: stats.sirenCount ?? 0,
      cacheShare: cached + newTokens > 0 ? cached / (cached + newTokens) : null,
      coldCount: sum(sessions.map((session) => session.coldCount)),
      settings: {
        armed: settings.armed === true,
        ttlMs: settings.ttlMs ?? 0,
        threshold: settings.threshold ?? 0
      },
      events: rows.slice(0, asked).map((row) => row.event),
      // More of the ring stands behind the page where the siren held more than was asked, and the page is not
      // already the whole ring.
      hasMore: rows.length > asked && asked < SIREN_MAX
    };
  } catch {
    return unreachable();
  }
}

function sum(values: (number | undefined)[]): number {
  return values.reduce<number>((total, value) => total + (typeof value === "number" ? value : 0), 0);
}

// The new tokens of the requests that went out in the last minute.
function countMinute(rows: ReadRow[], now: number): number {
  return rows
    .filter((row) => row.usage && row.at !== null && row.at >= now - MINUTE_MS)
    .reduce((total, row) => total + row.event.newTokens, 0);
}

// The last ten minutes, a minute to a bucket oldest first, each holding the new tokens of the requests that went
// out in it. A request older than the window falls outside every bucket and is counted nowhere.
function countMinutes(rows: ReadRow[], now: number): number[] {
  const start = now - MINUTES_SHOWN * MINUTE_MS;
  const minutes = Array.from({ length: MINUTES_SHOWN }, () => 0);

  for (const row of rows) {
    if (!row.usage || row.at === null) continue;

    const at = Math.floor((row.at - start) / MINUTE_MS);

    if (at >= 0 && at < MINUTES_SHOWN) minutes[at] = (minutes[at] ?? 0) + row.event.newTokens;
  }

  return minutes;
}

function asRow(row: SirenEventRow): ReadRow | null {
  const seq = row.id ?? 0;
  const data = row.data ?? {};

  if (row.kind === "usage.created") {
    const at = typeof data.at === "number" ? data.at : null;

    return {
      at,
      usage: true,
      event: {
        seq,
        atSeconds: at === null ? null : Math.floor(at / 1000),
        project: data.projectName ?? "",
        session: sessionText(data.sessionId),
        agent: sirenAgentOf({ project: data.projectName, directory: data.directoryName }),
        mode: agentModeOf(data.harnessName),
        model: data.modelName ?? "",
        kind: data.kind ?? "",
        level: data.level ?? "info",
        note: data.note ?? "",
        cause: null,
        newTokens: data.newTokenCount ?? 0,
        readTokens: data.cachedTokenCount ?? 0
      }
    };
  }

  // A siren's own row: it was raised by a red request or a burst, and no harness made it.
  if (row.kind === "siren.sounded") {
    const at = typeof data.at === "number" ? data.at : (typeof row.at === "number" ? row.at : null);

    return {
      at,
      usage: false,
      event: {
        seq,
        atSeconds: at === null ? null : Math.floor(at / 1000),
        project: data.projectName ?? "",
        session: sessionText(typeof data.sessionId === "string" ? data.sessionId : ""),
        agent: sirenAgentOf({ project: data.projectName }),
        mode: null,
        model: "",
        kind: data.kind ?? "",
        level: "red",
        note: data.note ?? "",
        cause: null,
        newTokens: data.newTokenCount ?? 0,
        readTokens: data.cachedTokenCount ?? 0
      }
    };
  }

  // A settings change is a fact about the siren rather than a request, and the list is the requests.
  return null;
}

// A session's number as the row carries it, cut to the few characters that tell one session from another.
function sessionText(sessionId: string | undefined): string {
  return (sessionId ?? "").slice(0, 8);
}

// The harness a request went out on, in the console's own names. A harness the console does not know, or none at
// all, is read as Claude Code's, which is what a posted request without one came from.
function agentModeOf(harness: string | undefined): AgentMode {
  return agentProviderNames.find((name) => name === harness) ?? "claude-code";
}

// Which agent made a request. One ground, and no second: a runner works in a directory of its own name outside the
// repository. The siren's caller fields are the caller's own and the daemon never reads them, so they name no
// agent; everything else on this machine is left unnamed rather than guessed at.
export function sirenAgentOf(row: { project?: string; directory?: string }): string | null {
  const project = row.project ?? "";
  const directory = row.directory ?? "";

  return RUNNER_AGENTS.find((name) => directory === name && project.endsWith(`-${name}`)) ?? null;
}
