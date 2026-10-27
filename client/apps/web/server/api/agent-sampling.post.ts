import { isAgentName } from "#shared/config";
import { wording } from "#shared/wording";

import type { components } from "@agency/client/schema";
import type { AgentSamplingView } from "#shared/agency";

type WorkerChange = components["schemas"]["WorkerChange"];

interface SamplingBody {
  agent?: unknown;
  sampling?: unknown;
}

// One save of a worker's own sampling, each setting named with its value or null for the engine's default (the
// agency's `docs/api.md`, 「workers」). The bounds are the agency's to check, and a refusal comes back with the
// setting it is about.
export default defineEventHandler(async (event): Promise<AgentSamplingView> => {
  await requireUserSession(event);
  const body = await readBody<SamplingBody>(event);

  if (!isAgentName(body?.agent)) throw fail(400, wording("agents.error.no_such_agent_name"));

  const change: WorkerChange = { sampling: body.sampling, nodeName: null, node: null, label: null, cwd: null, icon: null, role: null, stand: null, bench: null };
  const worker = await agencyCall(agency().PATCH("/workers/{workerName}", { params: { path: { workerName: body.agent } }, body: change }));

  return samplingView(worker.sampling, worker.name);
});
