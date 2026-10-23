import { translationLanguage, translationParts } from "#shared/translation";
import { wording } from "#shared/wording";

import type { DocumentTranslation, DocumentTranslationFailure } from "#shared/types";

// A document's translation as it stands for the version on disk (`docs/documents-viewer.md`, 「Asking to be taken
// somewhere, and reading a translation」): every part of the original, each with its translation where the
// translator has kept one or the sentence saying why it failed, and where the translator stands on the rest. A
// translator that cannot be asked where it stands is reported as such, and the parts it kept still stand.
export default defineEventHandler(async (event): Promise<DocumentTranslation> => {
  await requireUserSession(event);

  if (!translatorNamed()) throw fail(503, wording("documents.error.translation_unavailable"));

  const asked = getQuery(event);
  const view = openDocument(asked.root, asked.path);
  const document = documentName(view.root, view.path);
  const target = translationLanguage(view.language);
  const kept = new Map((await keptParts(document, translationVersion(view.version), target)).map((row) => [row.part, row]));
  let pending: number | null = null;
  let failure: DocumentTranslationFailure | null = null;

  try {
    ({ pending, failure } = await translationState(document, target));
  } catch {
    // A translator that cannot be asked is translating nothing, and the viewer says so.
  }

  return {
    version: view.version,
    language: view.language,
    target,
    parts: translationParts(view.text).map((source, part) => ({
      part,
      source,
      text: kept.get(part)?.text ?? null,
      failed: kept.get(part)?.failed ?? false,
      failure: kept.get(part)?.failure ?? null
    })),
    pending,
    failure
  };
});
