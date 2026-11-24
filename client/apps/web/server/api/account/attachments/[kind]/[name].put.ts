import { wording } from "#shared/wording";

import { HOLDER_KINDS, writeAttachments } from "../../../../utils/attachments";
import { fail } from "../../../../utils/fail";

import type { AttachmentHolder } from "#shared/attachments";

// What one of the signed-in reader's agents is given, its skills and its MCP items written whole, answered with the
// agent as it then stands (docs/web.md, 「Organisation」, the agents tab at the reader's own node).
export default defineEventHandler(async (event): Promise<AttachmentHolder> => {
  const kind = getRouterParam(event, "kind");
  const name = getRouterParam(event, "name");
  const body = (await readBody<{ skills?: unknown; mcp?: unknown }>(event)) ?? {};
  const listed = (value: unknown): value is string[] => Array.isArray(value) && value.every((one) => typeof one === "string");

  if (!(HOLDER_KINDS as readonly unknown[]).includes(kind) || name === undefined || name === "") throw fail(404, wording("attachments.error.not_found"));
  if (!listed(body.skills) || !listed(body.mcp)) throw fail(400, wording("common.error.bad_action"));

  return await writeAttachments(await signedInUser(event), kind as (typeof HOLDER_KINDS)[number], decodeURIComponent(name), { skills: body.skills, mcp: body.mcp });
});
