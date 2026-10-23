// A row of the agent catalogue as the archive answers it, for a test that hands the console the list the way the
// app does: the chat agent's answering every room that names nobody, or a companion's.

import { conversationOf } from "./conversation";

import type { AgentSummary } from "../../apps/web/shared/types";

export function catalogueRow(name: string, kind: "chat" | "companion", label: string | null = null): AgentSummary {
  const carried = conversationOf({ kind });

  return {
    name,
    kind,
    sessionScope: carried?.scope ?? null,
    turnShape: carried?.shape ?? null,
    defaultAnswerer: carried?.defaultAnswerer ?? false,
    model: null,
    lastMode: null,
    lastModel: null,
    lastEffort: null,
    label,
    aliases: null,
    icon: null,
    cwd: null,
    builtin: true,
    chatId: null,
    runs: 0,
    lastRunAt: null,
    lastKeepaliveAt: null,
    contextTokens: null,
    keepaliveStopped: false,
    keepalivePausedAt: null
  };
}
