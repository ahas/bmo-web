import { OWNER_ROLE_HEADER } from "./owner-key";
import { unitAt, unitHeaders } from "./units";

import type { BackgroundCall } from "#shared/types";

// The tool host's console face (bmo-pocket's `docs/api.md`, 「The console face」), read under its console token as
// the administrator: the asynchronous calls it keeps running, which the room screen's list of what waits shows
// (docs/web.md, the room screen's list of what waits).

// The tool whose calls are the agents' reminders and watches; any other tool's call stands by its own name.
const WAIT_TOOL = "bmo/wait";

/** The calls the tool host keeps running, as its console face answers them; null where it cannot be read. */
export async function runningCalls(): Promise<unknown[] | null> {
  const unit = unitAt("POCKET");

  if (unit === null) return null;

  try {
    const answered = await fetch(`${unit.address}/uses?state=running`, {
      headers: { ...unitHeaders(unit), [OWNER_ROLE_HEADER]: "administrator" }
    });

    if (!answered.ok) return null;

    const page: unknown = await answered.json();
    const items: unknown = typeof page === "object" && page !== null ? Reflect.get(page, "items") : null;

    return Array.isArray(items) ? items : [];
  } catch {
    return null;
  }
}

// A field of a kept call read as a string, a number or nothing.
function field(call: object, name: string): unknown {
  return Reflect.get(call, name);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** One kept call as the list shows it, where its wake is for this room: what it is, its note, how often a watch
 * checks, the moment a reminder waits for, the agent it wakes and when it started. Any other call is left out. */
export function backgroundCall(call: unknown, room: number): BackgroundCall | null {
  if (typeof call !== "object" || call === null || field(call, "room") !== room) return null;

  const id = text(field(call, "id"));
  const tool = text(field(call, "tool"));
  const startedAt = number(field(call, "startedAt"));

  if (id === null || tool === null || startedAt === null) return null;

  const asked: unknown = field(call, "arguments");
  const argument = (name: string): unknown => (typeof asked === "object" && asked !== null ? Reflect.get(asked, name) : undefined);
  const waits = tool === WAIT_TOOL;
  const watches = waits && text(argument("check")) !== null;
  const seconds = number(argument("seconds"));
  const moment = text(argument("until"));
  const until = !waits || watches ? null : seconds !== null ? startedAt + seconds * 1000 : moment === null ? null : Date.parse(moment);

  return {
    id,
    kind: watches ? "watch" : waits ? "reminder" : "call",
    tool,
    note: text(argument("note")),
    everySeconds: watches ? (number(argument("every")) ?? 60) : null,
    until: until === null || Number.isNaN(until) ? null : until,
    agent: text(field(call, "agent")),
    startedAt
  };
}
