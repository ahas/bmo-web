import { searchHits } from "bmo-ui/shared/search";

import { listUnits } from "./account-service";

import type { SignedIn } from "./accounts";
import type { UnitChoice } from "#shared/people";
import type { UnitRow } from "@web/server-client";

// The organisations a room's let-in search offers beside people (docs/web.md, the room screen's section on opening a
// room and letting people in): the units of the reader's company, each standing for the people the receiver lets in
// for it, those whose home unit it is and those holding a post in it who have not left. The account service lists
// units to the administrator alone, so they are read under the administrator's role and only the reader's own
// company is handed on (docs/boundary.md, 「Calls the console makes」); a login with no user of the model reads none,
// and the administrator reads every company's.

// The most organisations one search offers.
const OFFERED = 20;

const READING = { key: "", role: "administrator" } as const;

class UnitTree {
  private readonly byId: Map<number, UnitRow>;

  constructor(rows: readonly UnitRow[]) {
    this.byId = new Map(rows.map((row) => [row.id, row]));
  }

  /** The units from the company at the top down to the one named, both included. */
  line(unit: UnitRow): UnitRow[] {
    const line: UnitRow[] = [];
    const seen = new Set<number>();
    let at: UnitRow | undefined = unit;

    while (at !== undefined && !seen.has(at.id)) {
      seen.add(at.id);
      line.unshift(at);
      at = at.parent == null ? undefined : this.byId.get(at.parent);
    }

    return line;
  }

  company(unit: UnitRow): number {
    return this.line(unit)[0]!.id;
  }

  /** The companies of the units the reader stands in — home unit, head or post. */
  companiesOf(user: string): Set<number> {
    return new Set(this.rows().filter((row) => [...people(row), ...row.heads].includes(user)).map((row) => this.company(row)));
  }

  rows(): UnitRow[] {
    return [...this.byId.values()];
  }
}

// The people a unit lets into a room, once each: those whose home unit it is, then those holding a post in it, each
// whose account has not left (docs/accounts.md, 「A person who leaves」), as the receiver lets them in.
function people(row: UnitRow): string[] {
  const left = new Set(row.left);

  return [...new Set([...row.members, ...row.concurrent])].filter((user) => !left.has(user));
}

// The units the reader may offer: every unit of the reader's company, every company's for the administrator.
async function readerUnits(signed: SignedIn): Promise<UnitRow[]> {
  const tree = new UnitTree(await listUnits(READING));

  if (signed.administrator) return tree.rows();
  if (signed.id === null) return [];

  const companies = tree.companiesOf(String(signed.id));

  return tree.rows().filter((row) => companies.has(tree.company(row)));
}

/** The organisations of the reader's company whose name or short name holds the words, in the tree's order, matched as
 * every list's search matches, so the rows mark what they matched by the same reading. */
export async function findUnits(signed: SignedIn, words: string): Promise<UnitChoice[]> {
  if (words.trim() === "") return [];

  const offered = await readerUnits(signed);
  const tree = new UnitTree(offered);

  return offered
    .filter((row) => [row.name, row.shortName ?? ""].some((said) => searchHits(said, words).length > 0))
    .slice(0, OFFERED)
    .map((row) => ({
      id: row.id,
      name: row.name,
      shortName: row.shortName ?? null,
      path: tree.line(row).slice(0, -1).map((one) => one.name),
      people: people(row).length
    }));
}

/** Each organisation asked with the people it lets into a room; none where the reader may not offer one of them. */
export async function unitsPeople(signed: SignedIn, units: readonly number[]): Promise<{ id: number; people: string[] }[] | null> {
  if (units.length === 0) return [];

  const offered = new Map((await readerUnits(signed)).map((row) => [row.id, row]));
  const asked = units.map((unit) => offered.get(unit));

  if (asked.some((row) => row === undefined)) return null;

  return asked.map((row) => ({ id: row!.id, people: people(row!) }));
}
