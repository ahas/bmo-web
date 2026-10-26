import { wording } from "#shared/wording";

import type { components } from "@agency/client/schema";

type WorkerChange = components["schemas"]["WorkerChange"];
import type { WorkerChanged } from "#shared/types";
import type { WorkerSent } from "../../utils/agency";

interface WorkerNodeBody {
  action?: unknown;
  name?: unknown;
  node?: unknown;
  path?: unknown;
}

// Where a worker's checkout stands on the nodes (the agency's `docs/api.md`, 「workers」): a checkout on a node
// added or removed, or a worker of its own placed on a node or brought back. The rows are the agency's to write,
// so this asks the agency, and its refusals are said by the pack's sentence for their code.
export default defineEventHandler(async (event): Promise<WorkerChanged> => {
  await requireUserSession(event);

  const body = await readBody<WorkerNodeBody>(event);
  const action = body?.action;
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (action !== "add-checkout" && action !== "remove-checkout" && action !== "place") {
    throw fail(400, wording("common.error.bad_action"));
  }

  if (name === "") {
    throw fail(400, wording("agents.error.worker_name_empty"));
  }

  const node = typeof body?.node === "string" ? body.node : null;
  const path = typeof body?.path === "string" ? body.path : null;
  const change: WorkerSent<WorkerChange> = {
    sampling: null,
    nodeName: action === "remove-checkout" ? null : node,
    node,
    label: null,
    cwd: action === "remove-checkout" ? null : path,
    icon: null,
    role: null,
    stand: null,
    bench: null
  };

  await agencyCall(agency().PATCH("/workers/{workerName}", { params: { path: { workerName: name } }, body: change as WorkerChange }));

  return { ok: true };
});
