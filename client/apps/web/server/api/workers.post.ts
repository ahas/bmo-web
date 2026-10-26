import { wording } from "#shared/wording";

import type { components } from "@agency/client/schema";
import type { WorkerChanged } from "#shared/types";
import type { WorkerSent } from "../utils/agency";

type WorkerAdd = components["schemas"]["WorkerAdd"];
type WorkerChange = components["schemas"]["WorkerChange"];

interface WorkerBody {
  action?: unknown;
  name?: unknown;
  label?: unknown;
  path?: unknown;
  preamble?: unknown;
  devCommand?: unknown;
  keepaliveStopped?: unknown;
  supportCount?: unknown;
  supportKeepalive?: unknown;
  pinnedProvider?: unknown;
  prefixDocuments?: unknown;
}

const text = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

// The documents a worker's session prefix carries, in order, as the form sends them: each path trimmed and an empty
// one dropped. Absent where the form sends none, so a change that does not touch them leaves them as they stand.
function prefixDocuments(value: unknown): { prefixDocuments?: string[] } {
  if (!Array.isArray(value)) return {};

  return { prefixDocuments: value.flatMap((path) => (typeof path === "string" && path.trim() !== "" ? [path.trim()] : [])) };
}

// Adding, changing and removing a job worker. The workers are the agency's to keep (the agency's `docs/api.md`,
// 「workers」), so this asks it rather than writing a row of its own, and what each field may hold is the agency's to
// judge: a refusal is said in the pack's words for its code.
export default defineEventHandler(async (event): Promise<WorkerChanged> => {
  await requireUserSession(event);

  const body = await readBody<WorkerBody>(event);
  const action = body?.action;
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (action !== "add" && action !== "update" && action !== "remove") {
    throw fail(400, wording("common.error.bad_action"));
  }

  if (name === "") {
    throw fail(400, wording("agents.error.worker_name_empty"));
  }

  if (action === "add") {
    const added: WorkerSent<WorkerAdd> = {
      name,
      label: text(body?.label) ?? null,
      cwd: text(body?.path) ?? null,
      icon: null,
      role: null,
      nodeName: null,
      ...prefixDocuments(body?.prefixDocuments)
    };

    await agencyCall(agency().POST("/workers", { body: added as WorkerAdd }));
  } else if (action === "update") {
    const change: WorkerSent<WorkerChange> = {
      ...prefixDocuments(body?.prefixDocuments),
      sampling: null,
      nodeName: null,
      node: null,
      label: text(body?.label) ?? null,
      cwd: text(body?.path) ?? null,
      icon: null,
      role: null,
      stand: null,
      bench: null
    };

    await agencyCall(agency().PATCH("/workers/{workerName}", { params: { path: { workerName: name } }, body: change as WorkerChange }));
  } else {
    await agencyCall(agency().DELETE("/workers/{workerName}", { params: { path: { workerName: name } } }));
  }

  return { ok: true };
});
