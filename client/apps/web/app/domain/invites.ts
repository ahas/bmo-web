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
