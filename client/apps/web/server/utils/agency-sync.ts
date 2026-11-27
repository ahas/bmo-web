// The agency's view of the organisation, written whole from the account service (docs/web.md, 「The agency's
// organisation」; the agency's docs/api.md, 「What the front writes」). The agency keeps no organisation and no delegation
// chain of its own and asks nobody: the console, which stands in front of it, declares the settings the agency reads on
// the chain, and writes the agency two tables it reads instead —
//
// - the units each account reaches: a person heads a unit, and every unit under it, where they head it or a unit above;
// - the settings the agency declares, each resolved on the chain for every person and every unit, as the chain
//   answers the resolution.
//
// The writing is whole and idempotent: it runs as the console starts, after a change of the organisation or the chain
// the console makes, and on a timer, so a change made elsewhere reaches the agency within that time.

import { chainKinds, declareChainKind, listUnits, listUsers, resolveChain } from "./account-service";
import { agencyRoute } from "./agency";
import { moveAdministratorKey } from "./owner-key";


/** One account's reach of one unit, as the agency's table holds it. */
export interface UnitReachRow {
  account: number;
  unit: number;
  write: boolean;
}

/** One subject's resolution of one setting, as the agency's table holds it. */
export interface SubjectSettingRow {
  subject: string;
  key: string;
  value: unknown;
}

/**
 * The units each account heads: a head of a unit heads every unit under it as well. A member who heads nothing
 * reaches no unit's resources; their own path stands in the settings, not here.
 */
export function unitReachOf(units: readonly { id: number; parent?: number | null; heads: readonly string[] }[]): UnitReachRow[] {
  const children = new Map<number, number[]>();

  for (const unit of units) {
    if (unit.parent === null || unit.parent === undefined) continue;

    children.set(unit.parent, [...(children.get(unit.parent) ?? []), unit.id]);
  }

  const below = (unit: number): number[] => {
    const out: number[] = [];
    const stack = [unit];

    while (stack.length > 0) {
      const next = stack.pop()!;

      out.push(next);
      stack.push(...(children.get(next) ?? []));
    }

    return out;
  };
  const rows = new Map<string, UnitReachRow>();

  for (const unit of units) {
    for (const head of unit.heads) {
      const account = Number(head);

      if (!Number.isSafeInteger(account)) continue;

      for (const reached of below(unit.id)) rows.set(`${account}:${reached}`, { account, unit: reached, write: true });
    }
  }

  return [...rows.values()].sort((one, other) => one.account - other.account || one.unit - other.unit);
}

let running: Promise<void> | null = null;
let again = false;

/** The agency's two tables written whole, the agency's kinds declared first. One run at a time; a run asked while one
 * goes runs once more after it. */
export async function syncAgency(): Promise<void> {
  if (running !== null) {
    again = true;
    return await running;
  }

  running = (async () => {
    do {
      again = false;
      await syncOnce();
    } while (again);
  })().finally(() => {
    running = null;
  });

  return await running;
}

async function syncOnce(): Promise<void> {
  const key = await moveAdministratorKey();

  if (key === null) return;

  const caller = { key, role: "administrator" as const };
  const declared = await agencyRoute<{ kinds: { key: string }[] }>("GET", "/setting-kinds");

  for (const kind of declared.kinds) await declareChainKind(kind.key, kind);

  const [units, users] = await Promise.all([listUnits(caller), listUsers(caller)]);
  const known = new Set((await chainKinds()).map((kind) => kind.key));
  const keys = declared.kinds.map((kind) => kind.key).filter((one) => known.has(one));
  const settings: SubjectSettingRow[] = [];

  for (const setting of keys) {
    for (const user of users) {
      settings.push({ subject: `person:${user.user}`, key: setting, value: await resolveChain(setting, { person: user.user }) });
    }

    for (const unit of units) {
      settings.push({ subject: `unit:${unit.id}`, key: setting, value: await resolveChain(setting, { unit: unit.id }) });
    }
  }

  await agencyRoute("PUT", "/unit-reach", { items: unitReachOf(units) });
  await agencyRoute("PUT", "/subject-settings", { items: settings });
}
