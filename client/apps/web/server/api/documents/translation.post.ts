import { translationLanguage, translationParts } from "#shared/translation";
import { wording } from "#shared/wording";

interface TranslationBody {
  root?: unknown;
  path?: unknown;
  retry?: unknown;
}

// Asking for a document's translation (`docs/documents-viewer.md`, 「Asking to be taken somewhere, and reading a
// translation」): the parts of the version on disk that have none are handed to the translator, and with retry the
// parts it could not render as well. The parts arrive one by one as the translator's word; this answers with how
// many were handed over.
export default defineEventHandler(async (event): Promise<{ ok: true; taken: number }> => {
  await requireUserSession(event);

  if (!translatorNamed()) throw fail(503, wording("documents.error.translation_unavailable"));

  const body = await readBody<TranslationBody>(event);
  const view = openDocument(body?.root, body?.path);
  const document = documentName(view.root, view.path);
  const target = translationLanguage(view.language);
  const version = translationVersion(view.version);
  const kept = new Map((await keptParts(document, version, target)).map((row) => [row.part, row]));
  const parts = translationParts(view.text);
  const wanted = parts
    .map((text, part) => ({ part, text }))
    .filter(({ part }) => {
      const row = kept.get(part);

      return row === undefined || (body?.retry === true && row.failed);
    });

  if (wanted.length === 0) return { ok: true, taken: 0 };

  return { ok: true, taken: await handOverParts(document, version, target, parts.length, wanted) };
});
