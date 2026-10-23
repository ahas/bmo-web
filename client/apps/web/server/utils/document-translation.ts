import { createHash } from "node:crypto";

import { TRANSLATION_PART_TOKENS } from "#shared/translation-parts";

import { unitAt, unitFetch } from "./units";

import type { DocumentLanguage, DocumentTranslationFailure } from "#shared/types";

// A document's translation as the gate unit's translator keeps it (the gate's `docs/api.md`, 「Documents」;
// `docs/documents-viewer.md`, 「Asking to be taken somewhere, and reading a translation」): the parts of a document's
// version handed over, the parts kept with each failed part's sentence, and where the translator stands on the
// rest. The gate's address and token stand in the console's environment as `GATE_ADDRESS` and `GATE_TOKEN`; a
// console that names no gate offers no translation.

const UNIT = "GATE";

/** Whether the console names a translator to hand a document to. */
export function translatorNamed(): boolean {
  return unitAt(UNIT) !== null;
}

/** What a kept translation is tied to: the original's version and the size it was cut at, hashed into one version of
 * the same form, so parts cut at another size are never read against these. */
export function translationVersion(version: string, budget = TRANSLATION_PART_TOKENS): string {
  return createHash("sha256").update(`${version}\n${budget}`).digest("hex");
}

/** One part the translator has kept: its text, or that it failed and the sentence saying what its last answer lost. */
export interface KeptPart {
  part: number;
  text: string | null;
  failed: boolean;
  failure: string | null;
}

interface PartsPage {
  items?: { part: number; text?: string | null; failed?: boolean; failure?: string | null }[];
}

/** Every part the translator keeps of one version of a document in one language. */
export async function keptParts(document: string, version: string, target: DocumentLanguage): Promise<KeptPart[]> {
  const query = new URLSearchParams({ document, version, target });
  const page = await unitFetch<PartsPage>(UNIT, `/documents/translations/parts?${query}`);

  return (page.items ?? []).map((one) => ({ part: one.part, text: one.text ?? null, failed: one.failed === true, failure: one.failure ?? null }));
}

/** Where the translator stands on a document: how many parts it still holds, and why it last failed where it did. */
export async function translationState(document: string, target: DocumentLanguage): Promise<{ pending: number; failure: DocumentTranslationFailure | null }> {
  const query = new URLSearchParams({ document, target });
  const state = await unitFetch<{ pending?: number; failure?: DocumentTranslationFailure | null }>(UNIT, `/documents/translations/state?${query}`);

  return { pending: state.pending ?? 0, failure: state.failure ?? null };
}

/** Parts of one version handed to the translator, answered with how many it queued. */
export async function handOverParts(document: string, version: string, target: DocumentLanguage, partCount: number, wanted: { part: number; text: string }[]): Promise<number> {
  const answer = await unitFetch<{ taken?: number }>(
    UNIT,
    "/documents/translations",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ document, version, target, partCount, wanted }) },
    { carryReason: true }
  );

  return answer?.taken ?? 0;
}
