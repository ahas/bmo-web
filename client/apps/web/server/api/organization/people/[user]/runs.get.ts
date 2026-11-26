import { listRooms } from "../../../../utils/archive";
import { personsAgents, rosterPersonForAdministrator } from "../../../../utils/roster";
import { ROSTER_RUNS } from "#shared/roster";

import type { RosterRun } from "#shared/roster";

// A person's latest runs, those of the agents filed under their account as the agency's run ledger holds them, the
// newest first, for the administrator alone (docs/web.md, 「System and organisation」, the people tab).
export default defineEventHandler(async (event): Promise<RosterRun[]> => {
  const person = await rosterPersonForAdministrator(event);
  const [agents, rooms] = await Promise.all([personsAgents(Number(person.user)), listRooms()]);
  const titles = new Map(rooms.map((room) => [room.chatId, room.title]));
  const pages = await Promise.all(
    agents.map(async (agentName) => (await agencyCall(agency().GET("/runs", { params: { query: { agentName, limit: ROSTER_RUNS } } }))).items)
  );

  return pages
    .flat()
    .sort((one, other) => other.startedAt - one.startedAt)
    .slice(0, ROSTER_RUNS)
    .map((run) => ({
      id: run.id,
      name: run.name,
      run: run.unitName,
      agent: run.agentName,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      roomId: run.roomId,
      roomTitle: run.roomId === null ? null : (titles.get(run.roomId) ?? null),
      state: run.state,
      outcome: run.outcome
    }));
});
