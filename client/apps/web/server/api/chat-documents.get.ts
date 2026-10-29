import type { ChatDocumentsView } from "#shared/agency";

// The chat agent's own documents — its opening, the absolute rules and the manual — each as it stands now,
// from its file or from the text the owner saved (the agency's `docs/api.md`, 「chat-documents」).
export default defineEventHandler(async (event): Promise<ChatDocumentsView> => {
  await requireUserSession(event);

  return await agencyRoute<ChatDocumentsView>("GET", "/chat-documents");
});
