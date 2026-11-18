// The BMO profile's screens (docs/web.md, 「Organisation」, its BMO tab, and 「Settings」, its own-BMO section): what
// a call name may be before it is added, how a part says where it came from, and the permission tree laid out as rows.
// The decisions themselves are the account service's (docs/accounts.md, 「A person's BMO profile」); this only lays out
// what it answered.

import { PROFILE_LIMITS } from "#shared/bmo-profile";

import type { PermissionSetting, PermissionTree, ProfileSource } from "#shared/bmo-profile";
import type { Translate } from "#shared/wording";

/** Why a call name cannot be added to those standing, as a pack key, or null where it can. */
export function callNameProblem(name: string, standing: readonly string[]): string | null {
  const word = name.trim();

  if (word === "") return null;
  if (word.includes(",")) return "bmo_profile.error.call_name_comma";
  if ([...word].length > PROFILE_LIMITS.callName) return "bmo_profile.error.bad_profile";
  if (standing.some((one) => one.toLocaleLowerCase() === word.toLocaleLowerCase())) return "bmo_profile.error.call_name_taken";
  if (standing.length >= PROFILE_LIMITS.callNames) return "bmo_profile.error.call_names_full";

  return null;
}

/** The call names with one more added at their end, where it may be; the same list where it is empty or refused. */
export function withCallName(standing: readonly string[], name: string): string[] {
  const word = name.trim();

  return word === "" || callNameProblem(word, standing) !== null ? [...standing] : [...standing, word];
}

/** The muted line under a part saying where what stands came from; none for the deployment's own, whose value
 * carries the default's mark instead. */
export function sourceLine(t: Translate, from: ProfileSource): string | null {
  if (from === "own") return t("bmo_profile.label.from_own");
  if (from === "company") return t("bmo_profile.label.from_company");

  return null;
}

/** The name a profile stands with as a person reads it: its own text, or the deployment's name with the default's
 * mark where none stands. */
export function nameShown(t: Translate, name: string | null): string {
  return name ?? t("bmo_profile.label.default_value", { value: t("account.label.bmo_name") });
}

/** One row of the permission tree: a unit at its depth, or a person under their unit one step deeper. */
export interface PermissionRow {
  key: string;
  kind: "unit" | "person";
  depth: number;
  name: string;
  setting: PermissionSetting;
  allowed: boolean;
  // The unit's id, or the person's user id.
  subject: string;
  // Whether a unit is a company, which offers no following, and whether it has people to open.
  company: boolean;
  people: number;
}

/**
 * The permission tree as rows, each unit after its parent and, where a unit stands open, its people under it. The
 * unit the tree was read from is its first row; a unit whose parent is not in the tree is at its top.
 */
export function permissionRows(tree: PermissionTree, open: ReadonlySet<number>): PermissionRow[] {
  const known = new Set(tree.units.map((unit) => unit.id));
  const children = new Map<number | null, PermissionTree["units"]>();

  for (const unit of tree.units) {
    const parent = unit.parent !== null && known.has(unit.parent) ? unit.parent : null;

    children.set(parent, [...(children.get(parent) ?? []), unit]);
  }

  const rows: PermissionRow[] = [];
  const walk = (parent: number | null, depth: number): void => {
    for (const unit of children.get(parent) ?? []) {
      const people = tree.people.filter((person) => person.unit === unit.id);

      rows.push({
        key: `unit:${unit.id}`,
        kind: "unit",
        depth,
        name: unit.name,
        setting: unit.setting,
        allowed: unit.allowed,
        subject: String(unit.id),
        company: unit.parent === null,
        people: people.length
      });

      if (open.has(unit.id)) {
        for (const person of people) {
          rows.push({
            key: `person:${person.user}`,
            kind: "person",
            depth: depth + 1,
            name: person.name,
            setting: person.setting,
            allowed: person.allowed,
            subject: person.user,
            company: false,
            people: 0
          });
        }
      }

      walk(unit.id, depth + 1);
    }
  };

  walk(null, 0);

  return rows;
}

/** The choices a row offers: a company allows or denies, its deny marked as what nothing set runs on, and every other
 * unit and every person may also follow above. */
export function settingItems(t: Translate, company: boolean): { label: string; value: PermissionSetting }[] {
  const deny = t("bmo_profile.label.deny");
  const items: { label: string; value: PermissionSetting }[] = [
    { label: t("bmo_profile.label.allow"), value: "allow" },
    { label: company ? t("bmo_profile.label.default_value", { value: deny }) : deny, value: "deny" }
  ];

  return company ? items : [...items, { label: t("bmo_profile.label.inherit"), value: "inherit" }];
}

/** The choice a row shows: a company with nothing set shows deny, which is what nothing set resolves to. */
export function shownSetting(row: Pick<PermissionRow, "setting" | "company">): PermissionSetting {
  return row.company && row.setting === "inherit" ? "deny" : row.setting;
}

/** The muted line under a row that follows the unit above: what it resolves to. None for a row set on its own. */
export function followsLine(t: Translate, row: Pick<PermissionRow, "setting" | "allowed" | "company">): string | null {
  if (row.company || row.setting !== "inherit") return null;

  return t(row.allowed ? "bmo_profile.label.follows_allowed" : "bmo_profile.label.follows_denied");
}

/** A unit the reader may set things under, with its parent and its company, as the invitations' list answers it. */
export interface HeadedUnit {
  id: number;
  parent?: number | null;
  company: { id: number };
}

/** Whether the reader may set a company's default: they reach the company unit itself among the units they head. */
export function headsCompany(units: readonly HeadedUnit[], company: number): boolean {
  return units.some((unit) => unit.id === company);
}

/** The units of a company the permission tree is read from: those the reader heads whose parent they do not, so
 * every unit they may set stands once, under the highest of them. */
export function permissionTops(units: readonly HeadedUnit[], company: number): number[] {
  const mine = units.filter((unit) => unit.company.id === company);
  const ids = new Set(mine.map((unit) => unit.id));

  return mine.filter((unit) => unit.parent === null || unit.parent === undefined || !ids.has(unit.parent)).map((unit) => unit.id);
}
