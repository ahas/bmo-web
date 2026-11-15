import { wording } from "#shared/wording";

import { signedInUser } from "../../utils/accounts";
import { isOwnerLogin } from "../../utils/owner";

import type { DocumentTalk } from "#shared/types";

// The talk one document carries, oldest first, and where the chat agent stands on it: whether it is answering the
// last words now, and why they came back with nothing where they did. The talk is the owner's private chat, so any
// other account is refused before anything of it is read (docs/documents-viewer.md, 「Asking about a passage」).
export default defineEventHandler(async (event): Promise<DocumentTalk> => {
  await requireUserSession(event);

  if (!(await isOwnerLogin(await signedInUser(event)))) throw fail(403, wording("documents.error.talk_owner_only"));

  const asked = getQuery(event);
  const named = requireDocument(asked.root, asked.path);
  const document = documentName(named.root.key, named.path);

  return { turns: await readDocumentTalk(document), ...talkState(document) };
});
