import { wording } from "#shared/wording";

import type { SupervisorView } from "#shared/axes";

// A supervisor added on the console (the agency's `docs/api.md`, 「supervisors」): its name, its label, its whole order
// with its quota share and the repository its TODO items go to, registered in one ask. A refused field is said under
// that field, an order's under the entry the agency names.
export default defineEventHandler(async (event): Promise<SupervisorView> => {
  await requireAdministrator(event);

  const body = await readBody<Record<string, unknown>>(event);
  const fields = typeof body === "object" && body !== null ? body : {};
  const order = orderAsked(fields.order);
  const named = (field: string): string => (typeof fields[field] === "string" ? (fields[field] as string).trim() : "");

  if (order === null || order.length === 0 || typeof fields.quotaShare !== "number") throw fail(400, wording("agents.error.supervisor_add"));

  const registered = await agencyCall(
    agency().POST("/supervisors", {
      body: { name: named("name"), label: named("label"), order: orderBody(order), quotaShare: fields.quotaShare, repository: named("repository") === "" ? null : named("repository") }
    })
  );

  setResponseStatus(event, 201);

  return supervisorViewOf(registered.supervisor);
});
