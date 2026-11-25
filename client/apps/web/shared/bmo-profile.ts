// A person's BMO profile as the console's own routes answer it (docs/accounts.md, 「A person's BMO profile」; docs/web.md,
// 「System and organisation」, its BMO tab, and 「Settings」, its own-BMO section): what stands for each part and where it came
// from, the person's own parts as kept, a company's default, and the personalisation setting on a unit or a person
// with what it resolves to.

/** Where a part of a profile came from: the person's own, the company's default, or the deployment's own. */
export type ProfileSource = "own" | "company" | "deployment";

/** The personalisation setting on a unit or a person; `inherit` follows the unit above. */
export type PermissionSetting = "allow" | "deny" | "inherit";

/** The longest a name or a call name may be, the most call names a profile keeps, and the longest persona. */
export const PROFILE_LIMITS = { name: 40, callName: 40, callNames: 10, persona: 100_000 } as const;

/** The profile standing for the signed-in person, as the own-BMO section reads it. */
export interface OwnBmoView {
  // Whether the person may personalise their BMO, and whether they own one to personalise.
  personalize: boolean;
  hasBmo: boolean;
  name: { value: string | null; from: ProfileSource };
  callNames: { value: string[]; from: ProfileSource };
  persona: { value: string | null; from: ProfileSource };
  picture: { from: ProfileSource };
  own: { name: string | null; callNames: string[]; persona: string | null; picture: boolean };
}

/** The person's own text parts as the own-BMO section saves them; an empty name or persona is none. */
export interface OwnBmoParts {
  name: string | null;
  callNames: string[];
  persona: string | null;
}

/** A company's default as the BMO tab reads and saves it. */
export interface CompanyBmoView {
  name: string | null;
  callNames: string[];
  picture: boolean;
}

/** One unit of the permission tree, each after its parent. */
export interface PermissionUnit {
  id: number;
  name: string;
  parent: number | null;
  setting: PermissionSetting;
  allowed: boolean;
}

/** One person standing in a unit of the permission tree. */
export interface PermissionPerson {
  user: string;
  name: string;
  unit: number;
  setting: PermissionSetting;
  allowed: boolean;
}

/** The permission tree from one unit down. */
export interface PermissionTree {
  units: PermissionUnit[];
  people: PermissionPerson[];
}
