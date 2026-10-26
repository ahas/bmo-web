import { hasTranslator, translated } from "bmo-ui/app/domain/translation";
import { textLanguage } from "#shared/translation";

import type { Reading } from "bmo-ui/app/domain/translation";
import type { DocumentLanguage } from "#shared/types";
import type { Ref } from "vue";

// A text a worker or a job wrote, read in the reader's own language under the original (docs/web.md, 「The original,
// and its translation under it」). The reading is asked of the translator the console names, through bmo-ui's
// translation module; the gate keeps every translation under its original, the module keeps every whole reading for
// the tab's life, and two places asking for the same text at once share one ask, so a text is asked for once.

/** Where one text's reading stands. */
export type TextReading =
  // No reading is wanted: the text is empty, already in the reader's language, or the console names no translator.
  | { kind: "none" }
  | { kind: "asking" }
  // The reading came; `whole` is false where some parts stand in the original.
  | { kind: "read"; text: string; whole: boolean }
  // The translator stayed too busy after its waits, or refused or failed.
  | { kind: "busy" }
  | { kind: "failed" };

// The asks out now, by language and text, so a second place asking for a text already asked for waits on the same
// answer rather than asking again.
const asked = new Map<string, Promise<Reading>>();

function readingOf(text: string, language: string): Promise<Reading> {
  const key = `${language}\u0000${text}`;
  const out = asked.get(key);

  if (out !== undefined) return out;

  const ask = translated([text], language)
    .then((readings) => readings[0] ?? { text, whole: false, untranslated: true })
    .finally(() => asked.delete(key));

  asked.set(key, ask);

  return ask;
}

/** The language a reader reads, by the primary subtag of the console's locale. */
export function readerLanguage(locale: string): DocumentLanguage {
  return locale.split("-")[0]!.toLowerCase() === "en" ? "en" : "ko";
}

/** Whether a text takes a reading for a reader of a language: it holds words, and they are in another language. */
export function wantsReading(text: string, language: DocumentLanguage): boolean {
  return text.trim() !== "" && textLanguage(text) !== language;
}

/** One text's reading in the reader's language, asked as the text is given and asked again on `retry`. */
export function useTextReading(text: () => string, language: () => DocumentLanguage): { reading: Ref<TextReading>; retry: () => void } {
  const reading = ref<TextReading>({ kind: "none" });
  let generation = 0;

  async function ask(): Promise<void> {
    const original = text();
    const into = language();
    const mine = ++generation;

    if (!hasTranslator() || !wantsReading(original, into)) {
      reading.value = { kind: "none" };
      return;
    }

    reading.value = { kind: "asking" };

    try {
      const read = await readingOf(original, into);

      if (mine !== generation) return;

      reading.value = read.untranslated === true ? { kind: "busy" } : { kind: "read", text: read.text, whole: read.whole };
    } catch {
      // A translator that is named none, refused or failed leaves the original standing alone, and says so.
      if (mine !== generation) return;

      reading.value = { kind: "failed" };
    }
  }

  watch([text, language], () => void ask(), { immediate: true });

  return { reading, retry: () => void ask() };
}
