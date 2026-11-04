import { wording } from "#shared/wording";

import type { components } from "@bmo/receiver-client/schema";
import type { SupervisorAddedView } from "#shared/axes";

// The receiver's add with the person it is filed under and the scope of the sessions it keeps. Its published schema
// leaves both out, while the route reads them beside the add's fields to file the supervisor's brain and ownership
// under that account and to let one session answer every room the person's supervisor speaks in.
type AddSupervisor = components["schemas"]["SupervisorRequest"] & {
  ownerAccount: number | null;
  sessionScope?: "agent";
};

// A refused add's field, by the receiver's code: the box it stands under in the add's form, an order's member as the
// receiver names it.
const ADD_FIELDS: Readonly<Record<string, string>> = {
  name: "name",
  "name-taken": "name",
  label: "label",
  room: "room",
  repository: "repository",
  provider: "order",
  model: "order",
  "quota-share": "quotaShare"
};

// A supervisor added on the console (the receiver's `docs/api.md`, 「Supervisors」, `POST /supervisors`): its name, its
// label, the title of the console room it answers alone, its whole order with its quota share, the repository its
// TODO items go to, the account it is filed under and the scope of its sessions, in one ask. The receiver makes the
// room and asks the agency for the supervisor's half; a refused field is said under that field, an order's under the
// entry the receiver names. The account is the signed-in person's user id, required of an organisation member, so the
// brain and ownership are filed under them rather than under the deployment. A person's supervisor keeps one session
// across every room it answers (the agency's `docs/supervisors.md`, 「Adding and removing a supervisor」); the console's
// own account, and an add naming no account, keep the agency's `room` scope.
export default defineEventHandler(async (event): Promise<SupervisorAddedView> => {
  const signed = await signedInUser(event);

  const body = await readBody<Record<string, unknown>>(event);
  const fields = typeof body === "object" && body !== null ? body : {};
  const order = orderAsked(fields.order);
  const named = (field: string): string => (typeof fields[field] === "string" ? (fields[field] as string).trim() : "");

  if (order === null || order.length === 0 || typeof fields.quotaShare !== "number") throw fail(400, wording("agents.error.supervisor_add"));

  // A person's supervisor holds one session across its rooms; the console's own account keeps the agency's default.
  const sessionScope: AddSupervisor["sessionScope"] = signed.id === null ? undefined : "agent";

  const add: AddSupervisor = {
    name: named("name"),
    label: named("label"),
    room: named("room"),
    order: orderBody(order),
    quotaShare: fields.quotaShare,
    repository: named("repository") === "" ? null : named("repository"),
    ownerAccount: signed.id,
    ...(sessionScope === undefined ? {} : { sessionScope })
  };

  const added = await receiverCall(
    receiver().POST("/supervisors", { body: add }),
    {
      codes: SUPERVISOR_CODES,
      refusal: (refused) => {
        const member = (refused as { member?: unknown }).member;
        const field = refused.code === "order" ? (typeof member === "string" ? member : "order") : ADD_FIELDS[refused.code ?? ""];

        return field === undefined ? refused : { ...refused, field };
      }
    }
  );

  setResponseStatus(event, 201);

  return { name: named("name"), roomId: added.room.id, takenBack: added.room.takenBack };
});
