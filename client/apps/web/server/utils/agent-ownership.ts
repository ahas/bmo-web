import { supervisorOwner } from "./axes";

import type { Role } from "@agency/client";
import type { RoleSlotRun } from "#shared/types";

// Which agents a reader's lists hold (docs/web.md, 「Access」): an agent is the reader's own where the account it is
// filed under is theirs, and the deployment's where it is filed under none. Every list and every choice of agents the
// console draws holds those alone, for every reader alike; another account's agent is reached by its address, and
// looked up from the organisation screen's people tab.

/** The account an agency row is filed under, read from its `ownerAccount` as a number or the digits of one; none where
 * it names none. A role agent carries the field though the published client does not declare it. */
export function filedUnder(row: object): number | null {
  const owner: unknown = "ownerAccount" in row ? row.ownerAccount : null;

  if (typeof owner === "number" && Number.isSafeInteger(owner)) return owner;
  if (typeof owner === "string" && /^[0-9]+$/.test(owner)) return Number(owner);

  return null;
}

/** Whether a reader's lists hold an agent filed under `owner`: the reader's own, or the deployment's. */
export function listedFor(reader: number | null, owner: number | null): boolean {
  return owner === null || owner === reader;
}

/** The supervisors a reader's lists hold, each judged whose BMO it is (docs/accounts.md, 「Whose BMO a supervisor
 * is」). */
export function listedSupervisors<Row extends { name: string; ownerAccount?: number | null }>(rows: readonly Row[], reader: number | null): Row[] {
  return rows.filter((row) => listedFor(reader, supervisorOwner(row)));
}

/** The repositories, or the role agents, a reader's lists hold. */
export function listedRows<Row extends object>(rows: readonly Row[], reader: number | null): Row[] {
  return rows.filter((row) => listedFor(reader, filedUnder(row)));
}

/** A role as a reader's lists hold it: the role itself, which is the deployment's, with only its agents the reader's
 * lists hold. */
export function listedRole(role: Role, reader: number | null): Role {
  return { ...role, agents: listedRows(role.agents, reader) };
}

/** The runs a reader's lists hold: those of an agent the lists hold, and those that name no agent. */
export function listedRuns(runs: readonly RoleSlotRun[], owners: ReadonlyMap<string, number | null>, reader: number | null): RoleSlotRun[] {
  return runs.filter((run) => run.agent === null || listedFor(reader, owners.get(run.agent) ?? null));
}

/** Whose each agent of the agency's lists is, by its name: the supervisors and every role's agents. */
export function agentOwners(supervisors: readonly { name: string; ownerAccount?: number | null }[], roles: readonly Role[]): Map<string, number | null> {
  return new Map([
    ...supervisors.map((supervisor) => [supervisor.name, supervisorOwner(supervisor)] as const),
    ...roles.flatMap((role) => role.agents.map((agent) => [agent.name, filedUnder(agent)] as const))
  ]);
}
