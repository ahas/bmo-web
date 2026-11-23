// An organisation's agents as its heads set them on the delegation chain (docs/web.md, 「Organisation」, the supply
// and BMO tabs): which supply sources stand open under a unit, the unit's own keys, and the agents its people are
// given as their accounts are made ready. No secret value stands in any shape here: what a screen learns of a key
// is its name.

/** The three supply sources a unit opens or closes below it, in the order a run takes them. */
export type SourceKind = "personal" | "organisation" | "platform";

/** Whether the links below a unit may change a setting: 허용, 잠금 or 위를 따름. */
export type ChainDelegation = "allow" | "lock" | "inherit";

/** One source as it stands at a unit. */
export interface UnitSourceView {
  source: SourceKind;
  // What stands for the unit: open or closed, read up its chain.
  stands: boolean;
  // The unit's own word: closed here, or null where it follows the link above.
  closedHere: boolean;
  delegation: ChainDelegation;
  // Whether the reader may change the unit's link now: a head, under no lock above, or the administrator.
  writable: boolean;
  // The link whose lock above holds it, where one does.
  lockedBy: string | null;
}

/** One key or Claude account of the unit's own supply, by its secret's name. */
export interface UnitSupplyItem {
  id: string;
  road: string;
  secret: string;
  enabled: boolean;
  refused: boolean;
}

/** The agent supply of a unit (`GET /api/organization/units/{unit}/supply`). */
export interface UnitSupplyView {
  unit: number;
  sources: UnitSourceView[];
  // For the administrator on a company: whether the platform opens organisation supply to it; null for anyone else.
  companyOpened: boolean | null;
  // The unit's own keys and accounts, null where the reader may not manage them.
  items: UnitSupplyItem[] | null;
}

/** One role of a unit's sign-up composition. */
export interface CompositionRoleView {
  role: string;
  label: string;
  // What stands for the unit: off, or the agents given; `agents` null for the platform's own rule.
  off: boolean;
  agents: number | null;
  // The unit's own word on the role, none where it follows above.
  own: CompositionChoice | null;
}

/** A unit's word on a role: off, or a number of agents on the road of the role's own agent. */
export type CompositionChoice = { off: true } | { agents: number };

/** A unit's sign-up composition (`GET /api/organization/units/{unit}/composition`). */
export interface CompositionView {
  unit: number;
  roles: CompositionRoleView[];
  delegation: ChainDelegation;
  writable: boolean;
  lockedBy: string | null;
}
