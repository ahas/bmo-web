import { chatAgent } from "#shared/agent-names";
import { wording } from "#shared/wording";

import { standingBmoOf } from "./account-service";
import { agency, agencyCall } from "./agency";
import { supervisorOwner } from "./axes";
import { defaultAnswerer } from "./owner";
import { receiverRoute } from "./receiver";

import type { RoomAgent } from "#shared/types";

// The agent a private room stands as (docs/web.md, 「An agent's private room stands as its agent」): the owner's
// private chat as the supervisor that answers it, under the name the console calls its chat agent, and every other
// private room as the supervisor that answers it, under the name that agent answers to there. A person's own BMO answers to the name its profile stands with, never to a label made with
// the person's name; an agent of no account to its label. The receiver's own title for the room is left as it is.

/** What the receiver says of a room that tells whose private room it is and who answers it. */
export interface AnsweredRoom {
  id: number;
  privateOf: number | null;
  supervisors: readonly string[];
}

/** A supervisor as the agency lists it, as much of it as names it. */
export interface NamedSupervisor {
  name: string;
  label?: string | null;
  ownerAccount?: number | null;
}

/** The answering agent a room stands as, before its name is read: for the owner's private chat the supervisor it
 * names, else the default answerer, else the chat agent the settings name, called by that supervisor's own label and
 * by the chat agent's label the settings name only where it has none, as its row in the sidebar is; the
 * supervisor that answers any other private room, the one the room's account owns first; none for any other room. */
export function answeringAgent(room: AnsweredRoom, owner: number | null, supervisors: readonly NamedSupervisor[], answerer: string | null = null): NamedSupervisor | null {
  if (owner !== null && room.id === owner) {
    const chat = chatAgent();
    const name = room.supervisors[0] ?? answerer ?? (chat.name === "" ? null : chat.name);
    const own = supervisors.find((supervisor) => supervisor.name === name)?.label?.trim() ?? "";
    const label = own !== "" ? own : chat.label;

    return name === null ? null : { name, label };
  }

  if (room.privateOf === null) return null;

  const answering = room.supervisors.map((name) => supervisors.find((supervisor) => supervisor.name === name) ?? { name });

  return answering.find((supervisor) => supervisorOwner(supervisor) === room.privateOf) ?? answering[0] ?? null;
}

/** The name a person's own BMO answers to: the name its profile stands with, the pack's word for a BMO where the
 * profile names none. */
export function profileName(standing: { name: { value: string | null } } | null): string {
  const name = standing?.name.value?.trim() ?? "";

  return name === "" ? wording("account.label.bmo_name") : name;
}

// The supervisors as the agency lists them; none where it does not answer, so each room's answering agent stands by its
// registration name alone.
async function listedSupervisors(): Promise<NamedSupervisor[]> {
  try {
    return (await agencyCall(agency().GET("/supervisors"))).items;
  } catch {
    return [];
  }
}

async function nameOf(agent: NamedSupervisor): Promise<string> {
  const account = supervisorOwner(agent);

  if (account === null) return agent.label?.trim() || agent.name;

  const standing = await standingBmoOf(account).catch((error: unknown) => {
    console.error(`account ${account}: its BMO's profile could not be read for its room's name: ${String(error)}`);

    return null;
  });

  return profileName(standing);
}

/** The agent each private room among `rooms` stands as, by the room's number; a room standing as none is left out. */
export async function roomAgents(rooms: readonly AnsweredRoom[], owner: number | null): Promise<Map<number, RoomAgent>> {
  const answered = rooms.filter((room) => room.privateOf !== null || (owner !== null && room.id === owner));

  if (answered.length === 0) return new Map();

  const [supervisors, answerer] = await Promise.all([listedSupervisors(), answered.some((room) => room.id === owner) ? defaultAnswerer() : null]);
  const named = await Promise.all(
    answered.map(async (room) => {
      const agent = answeringAgent(room, owner, supervisors, answerer);

      return agent === null ? [] : [[room.id, { name: agent.name, title: await nameOf(agent) }] as const];
    })
  );

  return new Map(named.flat());
}

/** The agent one room stands as, read off the receiver's own read of it; none where it stands as none. */
export async function roomAgentOf(room: number, owner: number | null): Promise<RoomAgent | null> {
  const view = await receiverRoute<{ privateOf?: unknown; supervisors?: unknown } | null>(`/rooms/${room}`);
  const privateOf = typeof view?.privateOf === "number" && Number.isSafeInteger(view.privateOf) ? view.privateOf : null;
  const supervisors = Array.isArray(view?.supervisors) ? view.supervisors.filter((name): name is string => typeof name === "string") : [];

  return (await roomAgents([{ id: room, privateOf, supervisors }], owner)).get(room) ?? null;
}
