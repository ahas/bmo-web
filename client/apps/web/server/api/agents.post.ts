import { wording } from "#shared/wording";

import type { AgentRegistered } from "#shared/types";

// An agent of any kind registered through the agency, for the administrator (the agency's `docs/api.md`,
// 「agents」), owned by the login that adds it: its user on the account service is the agent's `ownerAccount`.
// The agency judges every field in its own order and a refusal names its field; a name already taken is said as
// such. What is not given goes as none, so the agency's own default for the kind stands.
const TEXT_FIELDS = ["role", "provider", "model", "worker", "cwd", "nodeName"] as const;

export default defineEventHandler(async (event): Promise<AgentRegistered> => {
  const signed = await requireAdministrator(event);
  const body = await readBody<Record<string, unknown>>(event);

  if (typeof body?.name !== "string" || typeof body.label !== "string" || typeof body.kind !== "string") {
    throw fail(400, wording("agents.error.agent_add_refused"));
  }

  const given = (field: (typeof TEXT_FIELDS)[number]): string | null => {
    const value = body[field];

    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
  };

  const created = await agencyCall(
    agency().POST("/agents", {
      body: {
        name: body.name.trim(),
        label: body.label.trim(),
        kind: body.kind,
        role: given("role"),
        ownerAccount: signed.id,
        icon: null,
        thinking: null,
        effort: null,
        provider: given("provider"),
        model: given("model"),
        worker: given("worker"),
        cwd: given("cwd"),
        nodeName: given("nodeName")
      }
    })
  );

  return { name: created.agent.name, brain: created.brain };
});
