// One repository removed; one a job holds a checkout of is refused in the pack's words (the agency's `docs/api.md`,
// 「repositories, prefix-checks and room-holdings」).
export default defineEventHandler(async (event): Promise<null> => {
  await signedInUser(event);

  await removeRepository(axisName(getRouterParam(event, "name")));

  return null;
});
