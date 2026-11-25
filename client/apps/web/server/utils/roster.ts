import { wording } from "#shared/wording";
import { ROSTER_ROLES, ROSTER_STATES } from "#shared/roster";

import { AccountRefusal, rosterPerson } from "./account-service";
import { signedInUser } from "./accounts";
import { agency, agencyCall } from "./agency";
import { filedUnder } from "./agent-ownership";
import { supervisorOwner } from "./axes";
import { fail } from "./fail";
import { callerOf, organizationFailure } from "./organization";

import type { SignedIn } from "./accounts";
import type { RosterAsk, RosterDetail, RosterRole, RosterState } from "#shared/roster";
import type { H3Event } from "h3";

// The people roster's console routes (docs/web.md, 「System and organisation」, the people tab; docs/accounts.md, 「The people
// roster」): the account service decides who looks through whom, and a reader it refuses, or a person outside what they
// look through, is answered as if nothing stood there. The groups that quote what a person said or ran are the
// administrator's alone, and are asked only once the person is found among those he looks through.

/** What the console says of a roster call: a refusal or a person outside the reader's reach as nothing found. */
export function rosterFailure(error: unknown): Error {
  if (error instanceof AccountRefusal && (error.status === 403 || error.status === 404)) return fail(404, wording("people.error.not_found"));

  return organizationFailure(error);
}

const WHOLE = /^[1-9][0-9]*$/;

function word(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function whole(value: unknown): number | undefined {
  return typeof value === "string" && WHOLE.test(value) ? Number(value) : undefined;
}

/** A page's ask as an address names it; a field that does not read as its kind is left out. */
export function rosterAskOf(query: Record<string, unknown>): RosterAsk {
  const role = word(query.role);
  const state = word(query.state);

  return {
    q: word(query.q),
    company: whole(query.company),
    unit: whole(query.unit),
    kind: word(query.kind),
    role: ROSTER_ROLES.find((one): one is RosterRole => one === role),
    state: ROSTER_STATES.find((one): one is RosterState => one === state),
    after: word(query.after),
    limit: whole(query.limit)
  };
}

/** The person a route names, among those the signed-in reader looks through, with the reader; nothing found else. */
export async function rosterPersonAsked(event: H3Event): Promise<{ signed: SignedIn; person: RosterDetail }> {
  const signed = await signedInUser(event);
  const user = getRouterParam(event, "user") ?? "";

  if (!WHOLE.test(user)) throw fail(404, wording("people.error.not_found"));

  try {
    const person = await rosterPerson(user, callerOf(signed));

    if (person === null) throw fail(404, wording("people.error.not_found"));

    return { signed, person };
  } catch (error) {
    throw rosterFailure(error);
  }
}

/** The person a route of the administrator's groups names: the administrator alone asks, and only of a person he
 * looks through; anyone else is answered as if nothing stood there. */
export async function rosterPersonForAdministrator(event: H3Event): Promise<RosterDetail> {
  const signed = await signedInUser(event);

  if (!signed.administrator) throw fail(404, wording("people.error.not_found"));

  return (await rosterPersonAsked(event)).person;
}

/** The names of the agents filed under an account: its supervisors and its role agents. */
export async function personsAgents(account: number): Promise<string[]> {
  const [supervisors, roles] = await Promise.all([
    agencyCall(agency().GET("/supervisors")).then((page) => page.items),
    agencyCall(agency().GET("/roles")).then((answer) => answer.roles)
  ]);

  return [
    ...supervisors.filter((supervisor) => supervisorOwner(supervisor) === account).map((supervisor) => supervisor.name),
    ...roles.flatMap((role) => (role.agents ?? []).filter((agent) => filedUnder(agent) === account).map((agent) => agent.name))
  ];
}
