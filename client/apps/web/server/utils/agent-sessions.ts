import { wording } from "#shared/wording";

import { checkUnit, rosterPerson } from "./account-service";
import { signedInUser } from "./accounts";
import { agency, agencyCall, agencyRoute } from "./agency";
import { supervisorOwner } from "./axes";
import { callerOf } from "./organization";
import { receiverRoute } from "./receiver";

import type { SessionActOutcome } from "#shared/types";
import type { SignedIn } from "./accounts";
import type { H3Event } from "h3";

// A supervisor's session handed over or reset from the console (docs/web.md, 「A supervisor's session handed over or
// reset」). The console's server judges who may before any unit is asked: the administrator on every supervisor, a
// person on the supervisors filed under their account, and a head on those filed under a person standing in a unit
// they head or below it, as the account service's unit check answers; anyone else is answered as if the agent did
// not stand. The units are then asked as the deployment's own. Both acts touch the session alone, never a room's
// record.

/** A supervisor as an ask on its session reads it: its name, the account it is filed under and where it keeps its
 * session — one across its rooms (`agent`) or one in each room (`room`). */
export interface SessionSupervisor {
  name: string;
  owner: number | null;
  scope: "agent" | "room";
}

// The longest reason a handover is given, as the dialog holds it.
export const HANDOFF_REASON_LIMIT = 200;

/** Every supervisor as an ask on its session reads it, from the agency's list. */
export async function sessionSupervisors(): Promise<SessionSupervisor[]> {
  const page = await agencyCall(agency().GET("/supervisors"));

  return page.items.map((supervisor) => ({
    name: supervisor.name,
    owner: supervisorOwner(supervisor),
    scope: supervisor.sessionScope === "room" ? "room" : "agent"
  }));
}

/** Whether the signed-in reader may hand over or reset the session of a supervisor filed under `owner`. */
export async function maySessionAct(signed: SignedIn, owner: number | null): Promise<boolean> {
  if (signed.administrator) return true;
  if (signed.id === null || owner === null) return false;
  if (owner === signed.id) return true;

  const person = await rosterPerson(owner, callerOf(signed)).catch(() => null);

  if (person === null) return false;

  const units = [...new Set([person.unit.id, ...person.posts.map((post) => post.unit.id)])];
  const heads = await Promise.all(units.map((unit) => checkUnit(unit, signed.id ?? 0).catch(() => false)));

  return heads.some(Boolean);
}

/** The supervisor a route names, where the reader may act on its session; refused as if it did not stand
 * otherwise. */
export async function requireSessionSupervisor(event: H3Event, name: string): Promise<{ signed: SignedIn; supervisor: SessionSupervisor }> {
  const signed = await signedInUser(event);
  const supervisor = (await sessionSupervisors()).find((one) => one.name === name);

  if (supervisor === undefined || !(await maySessionAct(signed, supervisor.owner))) {
    throw createError({ statusCode: 404, statusMessage: "Not Found" });
  }

  return { signed, supervisor };
}

/** The rooms a supervisor keeping a session in each room holds one in now, as the agency answers its sessions. */
async function roomSessions(name: string): Promise<number[]> {
  const page = await agencyCall(agency().GET("/sessions", { params: { query: { agentName: name } } }));

  return [...new Set(page.items.flatMap((session) => (session.roomId === null ? [] : [session.roomId])))];
}

// One reset asked of the agency: asked, or nothing to act on where the agency holds no such session, which it
// refuses about the field `session`.
async function askReset(agent: string, room: number | null, by: number | null): Promise<SessionActOutcome> {
  try {
    await agencyRoute("POST", "/session-reset", { agent, ...(room === null ? {} : { chatId: room }), ...(by === null ? {} : { by: String(by) }) });

    return "asked";
  } catch (error) {
    const refused = error as { statusCode?: number; data?: { field?: string | null } };

    if (refused.statusCode === 400 && refused.data?.field === "session") return "none";

    throw error;
  }
}

// A reset of every room session a supervisor holds, or of the one `room` names: asked where any was.
async function askRoomResets(name: string, room: number | null, by: number | null): Promise<SessionActOutcome> {
  const rooms = room === null ? await roomSessions(name) : [room];
  const outcomes = await Promise.all(rooms.map((one) => askReset(name, one, by)));

  return outcomes.includes("asked") ? "asked" : "none";
}

/** A supervisor's session handed over: its one session through the receiver's handover, a room's session through the
 * agency's reset, which a room session carries out as its handover. */
export async function handOver(supervisor: SessionSupervisor, reason: string, room: number | null, by: number | null): Promise<SessionActOutcome> {
  if (supervisor.scope === "room") return await askRoomResets(supervisor.name, room, by);

  try {
    await receiverRoute(`/handovers/${encodeURIComponent(supervisor.name)}`, {
      method: "POST",
      body: { reason, ...(room === null ? {} : { room }), ...(by === null ? {} : { by }) }
    }, { passStatus: [404, 409] });

    return "asked";
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;

    if (status === 404) return "none";
    // The receiver finds the agent keeps a session in each room after all: the room's session is the agency's.
    if (status === 409) return await askRoomResets(supervisor.name, room, by);

    throw error;
  }
}

/** A supervisor's session reset through the agency: its one session, or its session of `room`, or every room
 * session it holds where no room is named. */
export async function resetSession(supervisor: SessionSupervisor, room: number | null, by: number | null): Promise<SessionActOutcome> {
  if (supervisor.scope === "room") return await askRoomResets(supervisor.name, room, by);

  return await askReset(supervisor.name, room, by);
}

/** The reason a handover body carries, trimmed and held to its limit; refused where it is empty or too long. */
export function handoffReason(value: unknown): string {
  const reason = typeof value === "string" ? value.trim() : "";

  if (reason === "" || [...reason].length > HANDOFF_REASON_LIMIT) throw fail(400, wording("agent_session.error.reason"));

  return reason;
}

/** The room a body names, or none. */
export function askedRoom(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;

  throw fail(400, wording("room.error.bad_chat_id"));
}
