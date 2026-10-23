import { wording } from "#shared/wording";

import type { HardwareTrackingChanged } from "#shared/types";

// A machine's live tracking switched; the node service keeps the switch and its recorder follows it at once
// (docs/web.md, 「Monitor screen」). What is refused here is only a request that names no machine or no direction.
export default defineEventHandler(async (event): Promise<HardwareTrackingChanged> => {
  await requireUserSession(event);

  const body = await readBody<{ machine?: unknown; on?: unknown }>(event);

  if (typeof body?.machine !== "string" || body.machine === "" || typeof body.on !== "boolean") {
    throw fail(400, wording("hardware.error.tracking_direction"));
  }

  const machine = await changeMachine(body.machine, { tracking: body.on });

  return { machine: machine.name, on: machine.tracking };
});
