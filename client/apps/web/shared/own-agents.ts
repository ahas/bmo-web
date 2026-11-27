// A person's own agents and instructions as their settings show them (docs/web.md, 「Settings」, the own-agents
// section; the agency's `docs/role-agents.md`, 「A person's own agents」): the set their organisation supplies, each
// seat with where it came from, and the person's own changes over it, each allowed or decided by a unit above.

import type { DecidedBy } from "./organisation-agents";

/** An agent's road: a provider, a model on it and an effort. */
export interface OwnRoad {
  provider: string;
  model: string;
  effort: string | null;
}

/** Whether the reader may make one kind of change, and who decided it where it is withheld. */
export interface OwnPermission {
  allowed: boolean;
  decided: DecidedBy;
}

/** One agent of the reader's: a seat supplied to them or one of their own. */
export interface OwnAgentView {
  name: string;
  // Whether the agent stands now; a seat supplied that no longer stands is false.
  held: boolean;
  // Its road now, null where it follows the supervisor that asks it.
  road: OwnRoad | null;
  enabled: boolean;
  // Whether it carries a run now.
  carries: boolean;
  // The seat supplied: its road, null for one that follows its asker, and who supplied it — a unit by its name, or
  // the platform. Null for an agent of the reader's own.
  supplied: { road: OwnRoad | null; by: DecidedBy } | null;
  // Whether the reader's own change stands over the seat supplied.
  changed: boolean;
}

/** One role as it stands for the reader, with their agents of it. */
export interface OwnRoleView {
  role: string;
  label: string;
  line: string;
  off: boolean;
  // The unit that turned the role off, where one did.
  offBy: DecidedBy;
  most: number;
  agents: OwnAgentView[];
}

/** A provider a road may name: every provider the build carries, one stood off for the reader by the owner's
 * switch or their chain carrying `off`, the decider under `offBy`. */
export interface OwnProvider {
  name: string;
  label: string;
  lines: string[];
  // "owner" where the owner's switch stands it off, "chain" where the reader's chain closes it, null while open.
  off: "owner" | "chain" | null;
  // Who closed it: the unit that said so, or the platform for its own switch; null where it stands open.
  offBy: DecidedBy;
}

/** The reader's agents (`GET /api/account/own-agents`). */
export interface OwnAgentsView {
  add: OwnPermission;
  road: OwnPermission;
  roles: OwnRoleView[];
  providers: OwnProvider[];
}

/** A model a road may name, and whether the reader's supply carries it now. */
export interface OwnModel {
  id: string;
  efforts: (string | null)[];
  inService: boolean | null;
  supplied: boolean;
}

/** One of the agents an instruction may name. */
export interface InstructedAgent {
  name: string;
  label: string | null;
  kind: "supervisor" | "agent";
  role: string | null;
}

/** The reader's own instructions (`GET /api/account/own-instructions`). */
export interface OwnInstructionsView {
  allowed: OwnPermission;
  all: string | null;
  agents: Record<string, string>;
  named: InstructedAgent[];
  // The organisation's instructions, outermost first, each with the unit or the platform that set it.
  organisation: { by: DecidedBy; text: string }[];
  mostCharacters: number;
}

/** Whether a value is a road as the screen sends one. */
export function isOwnRoad(value: unknown): value is OwnRoad {
  const road = value as Partial<OwnRoad> | null;

  return (
    road !== null &&
    typeof road === "object" &&
    typeof road.provider === "string" &&
    road.provider !== "" &&
    typeof road.model === "string" &&
    road.model !== "" &&
    (road.effort === null || road.effort === undefined || typeof road.effort === "string")
  );
}
