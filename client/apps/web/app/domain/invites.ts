// Where an invitation leads, as a person reads it (docs/web.md, the invitations section and 「The join page」): the
// company, then the unit under it; a unit that is the company itself is named once.

interface Named {
  id: number;
  name: string;
}

/** The company and the unit an invitation leads into, the unit left out where it is the company. */
export function placeOf(invite: { company: Named; unit: Named }): string {
  return invite.company.id === invite.unit.id ? invite.company.name : `${invite.company.name} ${invite.unit.name}`;
}

// The units the invitation dialog chooses among (docs/web.md, 「Organisation settings」, the invitations tab): a
// company first, then a unit of that company's tree. Each unit carries its company, so a head whose own unit stands
// under a company they may not invite into still reads it under that company's name.

/** One unit the reader may invite into, as the account service answers it. */
export interface InvitableUnit extends Named {
  parent?: number | null;
  company: Named;
}

/** The companies of the units given, each once, in the order their first unit comes. */
export function inviteCompanies(units: readonly InvitableUnit[]): Named[] {
  const companies = new Map<number, Named>();

  for (const unit of units) if (!companies.has(unit.company.id)) companies.set(unit.company.id, unit.company);

  return [...companies.values()];
}

/** The units of one company among those given, in their order. */
export function companyUnits<Unit extends InvitableUnit>(units: readonly Unit[], company: number): Unit[] {
  return units.filter((unit) => unit.company.id === company);
}
