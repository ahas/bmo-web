import type { SupervisorSettingsView } from "#shared/axes";

// A supervisor's own settings, for one whose turns its settings' pieces make (docs/web.md, 「Agent management screen」,
// the settings dialog). A supervisor the agency does not hold is refused with the agency's reason.
export default defineEventHandler(async (event): Promise<SupervisorSettingsView> => {
  await requireUserSession(event);

  return await readSupervisorSettings(axisName(getRouterParam(event, "name")));
});
