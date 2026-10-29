import { isAgentName } from "#shared/config";
import { wording } from "#shared/wording";

interface ModelBody {
  agent?: unknown;
  method?: unknown;
  registration?: unknown;
}

// A supervisor's model method (the agency's docs/model-tiers.md, 「A supervisor's own model」): its key's
// route, or a registered model kept as its pin. What is refused here is only a request of the wrong shape;
// which agent takes a route, and which model is registered, is the agency's word, its refusal said by the
// pack's sentence for its code.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  await requireUserSession(event);

  const body = await readBody<ModelBody>(event);

  if (!isAgentName(body?.agent)) {
    throw fail(400, wording("agents.error.no_such_agent_name"));
  }

  if (body.method !== "route" && body.method !== "fixed") {
    throw fail(400, wording("agents.error.bad_model_method"));
  }

  if (body.method === "fixed" && (typeof body.registration !== "string" || body.registration.trim() === "")) {
    throw fail(400, wording("agents.error.bad_model_registration"));
  }

  await agencyCall(
    agency().PATCH("/agents/{agentName}", {
      params: { path: { agentName: body.agent } },
      body: {
        gates: null,
        reasoning: null,
        role: null,
        voice: null,
        model: body.method === "route" ? { method: "route" } : { method: "fixed", registration: body.registration }
      }
    })
  );

  return { ok: true };
});
