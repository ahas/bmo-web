import { wording } from "#shared/wording";

import { AccountRefusal, chainEntry } from "../utils/account-service";
import { callerOf } from "../utils/organization";
import { ownerHeaders } from "../utils/owner-key";

import type { components } from "@bmo/receiver-client/schema";
import type { SignedIn } from "../utils/accounts";
import type { SupervisorAddedView } from "#shared/axes";

// The receiver's add with the person it is filed under and the scope of the sessions it keeps. Its published schema
// leaves both out, while the route reads them beside the add's fields to file the supervisor's brain and ownership
// under that account and to let one session answer every room the person's supervisor speaks in.
type AddSupervisor = components["schemas"]["SupervisorRequest"] & {
  ownerAccount: number | null;
  ownerUnit?: number;
  sessionScope?: "agent";
};

// A refused add's field, by the receiver's code: the box it stands under in the add's form.
const ADD_FIELDS: Readonly<Record<string, string>> = {
  name: "name",
  "name-taken": "name",
  label: "label",
  room: "room",
  repository: "repository",
  provider: "provider",
  model: "model"
};

// A supervisor added on the console (the receiver's `docs/api.md`, 「Supervisors」, `POST /supervisors`): its name, its
// label, the title of the console room it answers alone, its road's provider and model, the repository its TODO items
// go to, the account it is filed under and the scope of its sessions, in one ask. The receiver makes the room and asks
// the agency for the supervisor's half, and takes no more of a road than its provider and model, so the rest of the
// road stands as its provider's own until the row sets it; a refused field is said under that field. The account is the
// signed-in person's user id, required of an organisation member, so the brain and ownership are filed under them
// rather than under the deployment. A person's supervisor keeps one session
// across every room it answers (the agency's `docs/supervisors.md`, 「Adding and removing a supervisor」); the console's
// own account, and an add naming no account, keep the agency's `room` scope.
//
// A member adds their own BMO alone: under their own name, `u<user>` (docs/accounts.md, 「Invitations and a person's
// machine」), filed under their own account. A supervisor under any other name — another account's BMO, a retired
// one's among them, whose name is guessable — is the administrator's act, and a member asking for one is refused
// before anything is asked. The add carries the signed-in login's `Owner-Key` and `Owner-Role`, so the receiver judges
// the same.
export default defineEventHandler(async (event): Promise<SupervisorAddedView> => {
  const signed = await signedInUser(event);

  const body = await readBody<Record<string, unknown>>(event);
  const fields = typeof body === "object" && body !== null ? body : {};
  const road = roadOf(fields.road);
  const named = (field: string): string => (typeof fields[field] === "string" ? (fields[field] as string).trim() : "");

  if (road === null) throw fail(400, wording("agents.error.supervisor_add"));

  const unit = typeof fields.ownerUnit === "number" && Number.isSafeInteger(fields.ownerUnit) && fields.ownerUnit > 0 ? fields.ownerUnit : null;

  if (unit !== null) {
    // A unit's supervisor: never a person's own name, and only from the unit's head or the administrator.
    if (/^u\d+$/.test(named("name"))) throw fail(400, wording("agents.error.supervisor_add"));
    if (!signed.administrator && !(await headsUnit(signed, unit))) throw fail(403, wording("agents.error.supervisor_unit_head_only"));
  } else if (!signed.administrator && (signed.id === null || named("name") !== `u${signed.id}`)) {
    throw fail(403, wording("agents.error.supervisor_own_only"));
  }

  // A person's supervisor holds one session across its rooms; the console's own account keeps the agency's default.
  const sessionScope: AddSupervisor["sessionScope"] = signed.id === null ? undefined : "agent";

  const add: AddSupervisor = {
    name: named("name"),
    label: named("label"),
    room: named("room"),
    provider: road.provider,
    model: road.model,
    repository: named("repository") === "" ? null : named("repository"),
    ownerAccount: unit === null ? signed.id : null,
    ...(unit === null ? {} : { ownerUnit: unit }),
    ...(sessionScope === undefined ? {} : { sessionScope })
  };

  const added = await receiverCall(
    receiver().POST("/supervisors", { body: add, headers: ownerHeaders(signed) }),
    {
      codes: SUPERVISOR_CODES,
      refusal: (refused) => {
        const field = ADD_FIELDS[refused.code ?? ""];

        return field === undefined ? refused : { ...refused, field };
      }
    }
  );

  setResponseStatus(event, 201);

  return { name: named("name"), roomId: added.room.id, takenBack: added.room.takenBack };
});

// The kind whose unit link the delegation chain answers its writers alone: a unit's heads, who change its resources
// (the agency's `docs/api.md`, 「Who a caller acts for」).
const UNIT_RESOURCES_KIND = "agency.unit-resources.manage";

/** Whether the signed-in login heads the unit, as the chain answers the unit's link to its writers alone; a check that
 * cannot be made answers no. */
async function headsUnit(signed: SignedIn, unit: number): Promise<boolean> {
  try {
    await chainEntry(UNIT_RESOURCES_KIND, `unit:${unit}`, callerOf(signed));

    return true;
  } catch (error) {
    if (error instanceof AccountRefusal) return false;

    throw fail(503, wording("agents.error.agency_access_unchecked"));
  }
}
