// One role removed; one a run goes or waits under, or one the policy names as a default, is refused in the pack's
// words (the agency's `docs/api.md`, 「roles」).
export default defineEventHandler(async (event): Promise<null> => {
  await signedInUser(event);

  await removeRole(axisName(getRouterParam(event, "name")), event);

  return null;
});
