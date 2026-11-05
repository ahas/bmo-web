import type { MachineHardware } from "#shared/types";

// Every machine's latest recorded reading in one answer, for the monitor overview's tiles (docs/web.md, 「Monitor
// screen」). The node service's list is the recorder's own and reads no machine, so no machine's record can hold
// another tile's request while it is being probed.
export default defineEventHandler(async (event): Promise<MachineHardware[]> => {
  await requireUserSession(event);

  return await machineReadings();
});
