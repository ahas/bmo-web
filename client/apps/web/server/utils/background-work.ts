import { agency, agencyCall } from "./agency";

import type { BackgroundWork } from "@agency/client";
import type { BackgroundCall } from "#shared/types";

// The background work a supervisor's program still runs for a room after the turn that launched it (the agency's
// `docs/api.md`, 「background-work」), which the room screen's list of what waits stands beside the tool host's calls
// (docs/web.md, the room screen's list of what waits).

/** One task as the list shows it: a subagent or a shell command by its kind, any other kind the program names by
 * that name, as any other call stands by its tool's; its note the description it was launched with, a shell's
 * command where it has none; its moment the turn's end its launch was written down at. */
export function workCall(work: BackgroundWork): BackgroundCall {
  const command = work.command?.trim() ?? "";
  const note = work.description.trim() !== "" ? work.description : command !== "" ? command : null;

  return {
    id: `background-work:${work.task}`,
    kind: work.kind === "subagent" || work.kind === "shell" ? work.kind : "call",
    tool: work.kind,
    note,
    everySeconds: null,
    until: null,
    agent: work.agentName ?? null,
    startedAt: work.launchedAt
  };
}

/** The background work still running for this room, as the agency lists it; null where the agency cannot be read. */
export async function roomWork(room: number): Promise<BackgroundCall[] | null> {
  try {
    const page = await agencyCall(agency().GET("/background-work", { params: { query: { roomId: room } } }));

    return page.items.map(workCall);
  } catch {
    return null;
  }
}
