import { wording } from "#shared/wording";

import type { HardwareCpuLimitChanged } from "#shared/types";

// A machine's CPU limit set, or cleared with null; the node service keeps it (docs/web.md, 「Monitor screen」).
// What is refused here is only a request that names no machine or no limit.
export default defineEventHandler(async (event): Promise<HardwareCpuLimitChanged> => {
  await requireUserSession(event);

  const body = await readBody<{ machine?: unknown; celsius?: unknown }>(event);

  if (typeof body?.machine !== "string" || body.machine === "" || (body.celsius !== null && typeof body.celsius !== "number")) {
    throw fail(400, wording("hardware.error.cpu_limit_body"));
  }

  const machine = await changeMachine(body.machine, { cpuLimit: body.celsius });

  return { machine: machine.name, celsius: machine.cpuLimit };
});
