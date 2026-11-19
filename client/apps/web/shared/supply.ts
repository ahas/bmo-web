// Supply: where a run goes out and what pays for it (docs/web.md, the supply sections). The account service holds the
// policy, the caps, the usage and the balances; the agency holds a person's own logins and keys. No credential and no
// secret value stands in any shape here — what a screen learns of a key is its name, and of a login the path it is
// reached by. Field names follow the service's wire shape: camelCase, as every other route of it.

/** The five sources, keyed as the service keys them in every stored list. `stop` never stands in a switchable list:
 * it is the closed end of every order, last wherever an order is answered. */
export type SupplySource = "personal" | "global" | "org_credits" | "personal_credits" | "stop";

/** Which layer closed a source to the reader, as the service says it. A write that tries to open such a source back
 * is answered 403 with the same code. */
export type SupplyReason = "not-in-plan" | "blocked-by-organisation" | "blocked-by-administrator";

/** One source as the reader's own view stands it. */
export interface SupplySourceState {
  source: SupplySource;
  allowed: boolean;
  // An allowed source the reader has closed: switched off, or held by the personal-credit switch or the cap.
  off: boolean;
  reason?: SupplyReason;
}

/** What went out this month on one source. */
export interface SupplyUsage {
  source: SupplySource;
  credits: number;
  costMicros: number;
}

/** The reader's own supply view (`GET /api/supply/me`), and the answer of the write too. The personal-credit switch
 * and the cap it reaches both show on the `personal_credits` source's standing, as closed. */
export interface SupplyMe {
  order: SupplySource[];
  sources: SupplySourceState[];
  personalCreditCredits: number | null;
  usage: SupplyUsage[];
  globalRemaining: number | null;
  personalCredits: number | null;
}

/** The reader's own setting, written whole (`PUT /api/supply/me`). */
export interface SupplyMeSetting {
  order: SupplySource[];
  off: SupplySource[];
  personalCreditsOn: boolean;
  personalCreditCredits: number | null;
}

/** A policy one layer stands: the sources it allows, in order, and its per-person monthly cap. Where a unit follows
 * a policy from above, `from` names the unit whose row it is. */
export interface SupplyPolicy {
  allowed: SupplySource[];
  order: SupplySource[];
  memberCreditCredits: number | null;
  from?: number | null;
}

/** The plan an organisation stands on, as the supply read carries it. */
export interface SupplyPlanInfo {
  name: string;
  price: number;
  scope: string;
  period: string;
  includedCredits: number | null;
  creditsUsable: boolean;
}

/** What one member of a unit cost this month on one source, the member named by their id. */
export interface SupplyMemberUsage {
  user: string;
  source: SupplySource;
  credits: number;
}

/** What a credit wallet holds. */
export interface SupplyWallet {
  balance: number;
  reserved: number;
  debt: number;
}

/** A unit's supply (`GET /api/supply/org/{unit}`), answered afresh by the policy write and the policy's taking-away
 * too. Where the unit inherits, `policy` is the row standing for it from above, `from` naming whose row it is.
 * Policy, wallet and usage answer only to a reader who holds the unit's policy; the plan only to one who holds its
 * subscription — a reader who holds the other standing reads those parts as none. */
export interface SupplyOrgView {
  inherits: boolean;
  policy: SupplyPolicy | null;
  plan: SupplyPlanInfo | null;
  wallet: SupplyWallet | null;
  usage: SupplyMemberUsage[];
}

/** A person as their per-user policy and own providers stand (`GET /api/supply/user/{user}`), answered afresh by
 * the policy write and the policy's taking-away too. Where the agency names no personal supply for the person
 * because the deployment names no agency, the read is refused `no-agency` and the tab says so in one line. */
export interface SupplyUserView {
  inherits: boolean;
  policy: SupplyPolicy | null;
  // The roads the person's own credentials serve — names alone, never a credential, never a secret's value.
  providers: string[];
  order: SupplySource[];
}

/** The platform's own supply standing (`GET /api/supply/platform`), as the relay carries it: the default policy
 * whole and the money settings beside it. */
export interface SupplyPlatformView {
  policy: SupplyPolicy;
  creditsPerDollar: number;
  reservationCredits: number;
  enforce: boolean;
}

/** A membership plan the platform sells, read whole (`GET /api/supply/plans`), newest first. */
export interface SupplyPlanEntry {
  id: number;
  name: string;
  // Whole won.
  price: number;
  scope: "personal" | "organisation";
  // `day`, `week`, `month` or `year`.
  period: string;
  // The amount quota the plan carries for its supply action; null where it includes none.
  includedCredits: number | null;
  creditsUsable: boolean;
}

/** One entry of the credits ledger: the owner is named by kind and number, as the ledger keeps them. */
export interface SupplyLedgerEntry {
  id: number;
  at: number;
  ownerKind: string;
  ownerId: number;
  // sumida's ledger kind: `grant`, `consume`, `reserve`, `capture` and the rest.
  kind: string;
  amount: number;
  debtChange: number;
  balanceAfter: number;
  words: string | null;
}

/** A page of the ledger, newest first, `next` the place to ask the page after from. */
export interface SupplyLedgerPage {
  entries: SupplyLedgerEntry[];
  next: string | null;
}

/** One audited supply act: every grant, and every change of a policy, the conversion rate or the switch. */
export interface SupplyAuditEntry {
  id: number;
  at: number;
  by: string;
  byName: string;
  // `grant`, `policy`, `settings` or `plan`.
  kind: string;
  subject: string;
  detail: string;
}

export interface SupplyAuditPage {
  entries: SupplyAuditEntry[];
  next: string | null;
}

/** One unit a reader may manage supply for, named for a picker. */
export interface SupplyUnit {
  id: number;
  name: string;
  parent: number | null;
}

/** A person's own gateway key, as the agency answers it (its `docs/api.md`, 「accounts, rest and usage」). */
export interface PersonalSupplyKey {
  id: string;
  road: string;
  secret: string;
  place: number;
  enabled: boolean;
  refusedAt: number | null;
  addedAt: number;
}

// The answers the account service carries, read as the relay names them. Every interface here stands for one wire
// answer of the service's supply document; a field the service skips where none stands is optional here.
export interface SupplyPolicyWire {
  allowed: SupplySource[];
  order: SupplySource[];
  memberCreditCredits?: number | null;
  from?: number | null;
}

export interface SupplyOrgWire {
  unit?: number;
  inherits?: boolean;
  policy?: SupplyPolicyWire | null;
  plan?: SupplyPlanInfo | null;
  wallet?: SupplyWallet | null;
  usage?: SupplyMemberUsage[];
}

export interface SupplyUserWire {
  user?: string;
  inherits?: boolean;
  policy?: SupplyPolicyWire | null;
  order?: SupplySource[];
  providers?: string[];
}

export interface SupplyPlatformWire {
  allowed?: SupplySource[];
  order?: SupplySource[];
  creditsPerDollar?: number;
  reservationCredits?: number;
  enforce?: boolean;
}

export interface SupplyLedgerWire {
  entries?: SupplyLedgerEntry[];
  next?: string | null;
}

export interface SupplyAuditWire {
  entries?: SupplyAuditEntry[];
  next?: string | null;
}

export interface SupplyPlansWire {
  plans?: SupplyPlanEntry[];
}
