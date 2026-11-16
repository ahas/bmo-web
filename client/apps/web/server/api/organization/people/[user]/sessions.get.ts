import { listRooms } from "../../../../utils/archive";
import { personsAgents, rosterPersonForAdministrator } from "../../../../utils/roster";

import type { RosterSession } from "#shared/roster";

type Held = Record<string, unknown>;

const count = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

// The context a session's last turn left, as the agency states it: `carried` tokens against the model's `window`.
function contextOf(value: unknown): RosterSession["context"] {
  const held: Held = typeof value === "object" && value !== null ? (value as Held) : {};
  const carried = count(held.carried);
  const window = count(held.window);

  return carried === null || window === null ? null : { carried, window };
}

// The sessions of the agents filed under a person's account, as the agency answers them, for the administrator alone
// (docs/web.md, 「Organisation」, the people tab).
export default defineEventHandler(async (event): Promise<RosterSession[]> => {
  const person = await rosterPersonForAdministrator(event);
  const [agents, rooms] = await Promise.all([personsAgents(Number(person.user)), listRooms()]);
  const titles = new Map(rooms.map((room) => [room.chatId, room.title]));
  const pages = await Promise.all(agents.map(async (agentName) => (await agencyCall(agency().GET("/sessions", { params: { query: { agentName } } }))).items));

  return pages.flat().map((session) => ({
    id: session.id,
    agent: session.agentName,
    scope: session.scope,
    roomId: session.roomId,
    roomTitle: session.roomId === null ? null : (titles.get(session.roomId) ?? null),
    provider: session.provider,
    model: session.model,
    context: contextOf(session.context)
  }));
});
