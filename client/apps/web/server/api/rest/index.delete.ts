import type { RestEndView } from "#shared/rest";

// The rest ended by hand (the agency's `docs/api.md`, 「accounts, rest and usage」, `DELETE /rest`): the platform
// administrator's alone. The answer is the deployment as it then stands, which may rest again where a login's window
// is read full again; the receiver notices the end on its own clock.
export default defineEventHandler(async (event): Promise<RestEndView> => {
  await requireAdministrator(event);

  return await endRest(event);
});
