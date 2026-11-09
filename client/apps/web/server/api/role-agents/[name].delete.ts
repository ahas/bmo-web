// One agent removed; one that carries a run is refused in the pack's words (the agency's `docs/role-agents.md`,
// 「Changing the agents」).
export default defineEventHandler(async (event): Promise<null> => {
  await signedInUser(event);

  await removeRoleAgent(axisName(getRouterParam(event, "name")));

  return null;
});
