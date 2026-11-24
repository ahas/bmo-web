import { unitSubtree, userOf } from "./account-service";
import { callerOf, organizationFailure } from "./organization";

import type { SignedIn } from "./accounts";
import type { UnitPerson } from "#shared/unit-people";

// The people standing in a unit or under it (docs/web.md, 「Organisation」, the permissions tab), read from the account
// service's subtree in the reader's name, which it answers a head of the unit and the administrator alone. A person
// counts where their home unit is, else the first unit they head or hold a post in; one who left is no longer listed.

/** The people of a unit's tree in the order of their names, each with the unit they stand in. */
export async function unitPeople(unit: number, signed: SignedIn): Promise<UnitPerson[]> {
  let subtree: Awaited<ReturnType<typeof unitSubtree>>;

  try {
    subtree = await unitSubtree(unit, callerOf(signed));
  } catch (error) {
    throw organizationFailure(error);
  }

  const people = new Map<string, { name: string; unit: { id: number; name: string }; home: boolean }>();
  const place = (user: string, name: string, at: { id: number; name: string }, home: boolean): void => {
    const held = people.get(user);

    if (held === undefined || (home && !held.home)) people.set(user, { name, unit: at, home });
  };

  for (const one of subtree.units) {
    const at = { id: one.id, name: one.name };

    for (const member of one.members) if (!member.left) place(member.user, member.name, at, true);
    for (const head of one.heads) place(head.user, head.name, at, false);
    for (const post of one.concurrent) place(post.user, post.name, at, false);
  }

  const administrators = await Promise.all([...people.keys()].map(async (user) => [user, await userOf(user).then((found) => found?.administrator === true, () => false)] as const));
  const administrator = new Map(administrators);

  return [...people]
    .map(([user, one]) => ({ user, name: one.name, unit: one.unit, administrator: administrator.get(user) ?? false }))
    .toSorted((one, other) => one.name.localeCompare(other.name) || one.user.localeCompare(other.user));
}
