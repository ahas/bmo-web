// A supervisor's registration ended, for the administrator (the agency's `docs/api.md`, 「supervisors」): its settings,
// sessions and person records go, its brain and the rooms it answered stay. One the deployment seeds, or one a turn
// holds now, is refused with the agency's reason.
export default defineEventHandler(async (event): Promise<void> => {
  await requireAdministrator(event);

  const name = axisName(getRouterParam(event, "name"));

  await agencyCall(agency().DELETE("/supervisors/{supervisorName}", { params: { path: { supervisorName: name }, query: {} } }));
  setResponseStatus(event, 204);
});
