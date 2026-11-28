import { wording } from "#shared/wording";

import type { RoleAgentView } from "#shared/axes";

// One fallback road added to an agent, at a position or last (the agency's `docs/role-agents.md`, 「An agent's
// fallback roads」): a provider and a model, with its effort where named.
export default defineEventHandler(async (event): Promise<RoleAgentView> => {
  await signedInUser(event);

  const name = axisName(getRouterParam(event, "name"));
  const body = await readBody<unknown>(event);
  const fields = body !== null && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const text = (field: string): string | undefined => (typeof fields[field] === "string" && fields[field] !== "" ? (fields[field] as string) : undefined);
  const provider = text("provider");
  const model = text("model");
  const position = typeof fields.position === "number" && Number.isInteger(fields.position) && fields.position >= 0 ? fields.position : undefined;

  if (provider === undefined || model === undefined) throw fail(400, wording("common.error.bad_action"));

  return await addRoleAgentFallback(name, { provider, model, effort: text("effort") ?? null, thinking: text("thinking") ?? null, answerTokens: null, advisor: text("advisor") ?? null, position: position ?? null }, event);
});
