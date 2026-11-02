// An entry of the agent list as the console's server answers it, for a test that hands the console the list the way
// the app does: a supervisor — the chat agent answering every room that names nobody, or a companion —, a role or a
// repository.

import { conversationOf } from "./conversation";

import type { AgentAxis, AgentSummary } from "../../apps/web/shared/types";

/** An entry of one axis with every other field empty, its own fields laid over it. */
export function catalogueEntry(name: string, kind: AgentAxis, label: string | null = null, own: Partial<AgentSummary> = {}): AgentSummary {
  return {
    name,
    kind,
    label,
    aliases: null,
    icon: null,
    sessionScope: null,
    turnShape: null,
    defaultAnswerer: false,
    provider: null,
    model: null,
    effort: null,
    waitingFor: null,
    line: null,
    running: 0,
    waiting: 0,
    maxConcurrent: null,
    runs: [],
    path: null,
    node: null,
    checkouts: [],
    ...own
  };
}

/** A supervisor: the chat agent's row, or a companion's. */
export function catalogueRow(name: string, kind: "chat" | "companion", label: string | null = null): AgentSummary {
  const carried = conversationOf({ kind });

  return catalogueEntry(name, "supervisor", label, {
    sessionScope: carried?.scope ?? null,
    turnShape: carried?.shape ?? null,
    defaultAnswerer: carried?.defaultAnswerer ?? false
  });
}
