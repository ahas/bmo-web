import { agency, agencyCall } from "./agency";

import type { RoleSlotRun } from "#shared/types";

// The most runs one read of the agency's run ledger answers (the agency's `docs/api.md`, 「runs」).
const RUNS_PAGE = 500;

/**
 * The runs the slots hold, each with the room the agency's run ledger says it works for: the open runs read once by
 * the names the slots give them, which the ledger matches against each run's unit. A run the ledger names no room for,
 * or a ledger that does not answer, leaves the run as it was.
 */
export async function withRunRooms(runs: readonly RoleSlotRun[]): Promise<RoleSlotRun[]> {
  const names = [...new Set(runs.flatMap((run) => (run.runName === null ? [] : [run.runName])))];

  if (names.length === 0) return [...runs];

  const rooms = await agencyCall(agency().GET("/runs", { params: { query: { live: true, names: names.join(","), limit: RUNS_PAGE } } }))
    .then((page) => new Map(page.items.flatMap((row) => (row.roomId === null ? [] : [[row.unitName, row.roomId] as const]))))
    .catch(() => new Map<string, number>());

  return runs.map((run) => ({ ...run, roomId: (run.runName === null ? undefined : rooms.get(run.runName)) ?? run.roomId }));
}
