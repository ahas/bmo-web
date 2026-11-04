// A supervisor removed, for a reader who may write the supervisors tab (the receiver's `docs/api.md`, 「Supervisors」, `DELETE
// /supervisors/{supervisorName}`): the receiver asks the agency for its half — its settings, sessions and person records
// go, its brain stays — and lets every room's naming of it go, a room left naming none going to the default answerer.
// One the deployment seeds, the default answerer and one a turn holds now are refused with the receiver's reason.
export default defineEventHandler(async (event): Promise<void> => {
  const session = await signedInUser(event);
  const name = axisName(getRouterParam(event, "name"));

  await receiverCall(
    receiver().DELETE("/supervisors/{supervisorName}", { params: { path: { supervisorName: name }, query: { by: session.name } } }),
    { codes: SUPERVISOR_CODES }
  );
  setResponseStatus(event, 204);
});
