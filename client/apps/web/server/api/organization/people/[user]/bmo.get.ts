import { permissionTreeOf, standingBmoOf } from "../../../../utils/account-service";
import { roadOf, supervisorOwner } from "../../../../utils/axes";
import { callerOf } from "../../../../utils/organization";
import { rosterFailure, rosterPersonAsked } from "../../../../utils/roster";

import type { RosterBmo } from "#shared/roster";

// A person's own BMO as its profile stands for them, read by the administrator or a head of the company they stand in
// (docs/web.md, 「Organisation」, the people tab): its name, call names, picture and persona each with where it came
// from, whether they may personalise it and what that follows, and the road of the supervisor that is their BMO.
export default defineEventHandler(async (event): Promise<RosterBmo> => {
  const { signed, person } = await rosterPersonAsked(event);
  const caller = callerOf(signed);

  try {
    const [standing, tree, supervisors] = await Promise.all([
      standingBmoOf(person.user, caller),
      permissionTreeOf(person.unit.id, caller).catch(() => null),
      agencyCall(agency().GET("/supervisors")).then((page) => page.items)
    ]);
    const own = supervisors.find((supervisor) => supervisorOwner(supervisor) === Number(person.user)) ?? null;
    const { own: _own, ...shown } = standing;

    return {
      hasBmo: own !== null,
      standing: shown,
      personalizeSetting: tree?.people.find((one) => one.user === person.user)?.setting ?? "inherit",
      picture: standing.picture.from !== "deployment",
      road: own === null ? null : roadOf(own),
      supervisor: own?.name ?? null
    };
  } catch (error) {
    throw rosterFailure(error);
  }
});
