// An organisation's agent settings as its heads set them on the delegation chain, beside its supply and its sign-up
// composition (docs/web.md, 「System and organisation」, the agents tab), and the settings of the chain a person reads in their own
// settings, a unit above deciding some of them (「Settings」, the supply and own-BMO sections).

import type { ChainDelegation } from "./organisation-supply";

/** The agents tab's settings each a unit sets on the chain: its instructions, its persona's choice, whether its people
 * add and change repositories, and what they may change of the agents it supplies — add agents and switch supplied ones
 * off, choose roads, give instructions of their own. */
export type AgentSettingKey = "instructions" | "persona" | "repositories" | "ownAgents" | "roadChoice" | "personalInstructions" | "personalize";

/** The settings of what a unit's people may change of the agents it supplies, in the order the tab shows them. */
export const PERSON_CHANGES = ["ownAgents", "roadChoice", "personalInstructions"] as const;

/** A persona's choice: the agent's own persona, or none at all. */
export type PersonaChoice = "own" | "none";

/** One setting as it stands at a unit. */
export interface UnitChainSetting<Value> {
  // The unit's own value, null where it follows the link above.
  own: Value | null;
  // What stands for the unit, read up its chain.
  stands: Value;
  delegation: ChainDelegation;
  // Whether the reader may change the unit's link now: a head, under no lock above, or the administrator.
  writable: boolean;
  // The link whose lock above holds it, where one does, and who that link is, for the line saying so.
  lockedBy: string | null;
  locker: DecidedBy;
}

/** The organisation's instructions at a unit: its own text, and every text the links above it hold, outermost first,
 * which an agent serving a person here is given before it. */
export interface UnitInstructions extends Omit<UnitChainSetting<string>, "stands"> {
  above: string[];
}

/** The agent settings of a unit (`GET /api/organization/units/{unit}/agent-settings`), or of the platform (`GET
 * /api/organization/platform/agent-settings`, `unit` null); a setting the reader writes none of stands null. */
export interface UnitAgentSettings {
  unit: number | null;
  instructions: UnitInstructions | null;
  persona: UnitChainSetting<PersonaChoice> | null;
  repositories: UnitChainSetting<boolean> | null;
  ownAgents: UnitChainSetting<boolean> | null;
  roadChoice: UnitChainSetting<boolean> | null;
  personalInstructions: UnitChainSetting<boolean> | null;
  // Whether the people may personalise their own BMO, read here at the platform's link alone; a unit sets it on its
  // BMO permission rows.
  personalize: UnitChainSetting<boolean> | null;
}

/** A repository the unit owns, whose people's agents alone work on it. */
export interface UnitRepository {
  name: string;
  label: string | null;
  path: string;
}

/** Who decided a setting standing for a person: a unit above, by its name where it is one the person stands under, the
 * platform, or nobody where the default stands. */
export type DecidedBy = { by: "unit"; name: string | null } | { by: "platform" } | null;

/** The persona's choice as it stands for the reader (`GET /api/account/agent-persona`). */
export interface OwnPersona {
  // Whether the reader's BMO keeps its persona.
  on: boolean;
  // The reader's own word, null where they follow their organisation.
  own: boolean | null;
  // A unit above deciding it with a lock, so the reader's word changes nothing; null where none does.
  decided: DecidedBy;
}
