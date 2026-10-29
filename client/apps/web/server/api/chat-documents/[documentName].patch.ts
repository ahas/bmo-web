import { wording } from "#shared/wording";

import type { ChatDocumentView } from "#shared/agency";

// One chat document saved as the owner's text, or reset to its file, carried to the agency under the
// signed-in user, who it is kept as saved by (the agency's `docs/api.md`, 「chat-documents」).
export default defineEventHandler(async (event): Promise<ChatDocumentView> => {
  const session = await requireUserSession(event);
  const name = getRouterParam(event, "documentName") ?? "";
  const body = await readBody<Record<string, unknown>>(event);

  if (typeof body?.action !== "string") throw fail(400, wording("agents.error.chat_document_action"));

  return await agencyRoute<ChatDocumentView>("PATCH", `/chat-documents/${encodeURIComponent(name)}`, {
    action: body.action,
    text: typeof body.text === "string" ? body.text : null,
    by: session.user.name
  });
});
