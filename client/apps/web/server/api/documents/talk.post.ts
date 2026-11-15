import { DOCUMENT_PASSAGE_LIMIT, TALK_LIMIT } from "#shared/config";
import { wording } from "#shared/wording";

import { signedInUser } from "../../utils/accounts";
import { isOwnerLogin } from "../../utils/owner";

interface TalkBody {
  root?: unknown;
  path?: unknown;
  text?: unknown;
  heading?: unknown;
  passage?: unknown;
  translated?: unknown;
}

function optional(value: unknown, limit: number): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim().slice(0, limit) : null;
}

// One turn of the talk about a document. The document is read here, so the turn carries the version the owner was
// looking at and the file the agent can open; the passage and its heading come as they selected them. The words
// are written down at once and the chat agent's answer later, and every tab hears the talk move. The talk is the
// owner's private chat, so any other account's words are refused before anything is written (docs/documents-viewer.md,
// 「Asking about a passage」).
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  await requireUserSession(event);

  if (!(await isOwnerLogin(await signedInUser(event)))) throw fail(403, wording("documents.error.talk_owner_only"));

  const body = await readBody<TalkBody>(event);
  const text = typeof body?.text === "string" ? body.text.trim() : "";

  if (text === "") {
    throw fail(400, wording("common.error.say_to_bmo_empty"));
  }

  if (text.length > TALK_LIMIT) {
    throw fail(400, wording("common.error.too_long", { n: TALK_LIMIT }));
  }

  const view = openDocument(body?.root, body?.path);

  await sayAboutDocument(
    { document: documentName(view.root, view.path), label: view.label, writer: view.writer, file: view.file, version: view.version },
    text,
    {
      heading: optional(body?.heading, 500),
      passage: optional(body?.passage, DOCUMENT_PASSAGE_LIMIT),
      version: view.version,
      translated: body?.translated === true
    }
  );

  return { ok: true };
});
