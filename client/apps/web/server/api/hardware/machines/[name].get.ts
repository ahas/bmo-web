import type { MachineHardware } from "#shared/types";

// One machine with its latest reading (docs/web.md, 「Monitor screen」): `local` for this machine, a node by its name.
export default defineEventHandler(async (event): Promise<MachineHardware> => {
  await requireUserSession(event);

  return await machineHardware(machineNamed(getRouterParam(event, "name")));
});
