// The people standing in an organisation unit or under it, as the organisation screen's permissions tab lists them
// (docs/web.md, 「Organisation」, the permissions tab).

/** One person of the unit's tree: their user, their name, the unit they stand in, and whether they are a platform
 * administrator, who passes every section. */
export interface UnitPerson {
  user: string;
  name: string;
  unit: { id: number; name: string };
  administrator: boolean;
}
