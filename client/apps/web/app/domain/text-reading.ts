import { hasTranslator } from "bmo-ui/app/domain/translation";
import { textLanguage } from "#shared/translation";

import type { Reading } from "bmo-ui/app/domain/translation";
import type { DocumentLanguage } from "#shared/types";
import type { ComputedRef, Ref } from "vue";

// A text a worker or a job wrote, read in the reader's own language in the original's place (docs/web.md, 「The
// original, and its translation in its place」). The reading is asked of the gate's translating route through the console's own
// route; the gate keeps every translation under its original, this tab keeps every whole reading for its life, and
// two places asking for the same text at once share one ask, so a text is asked for once.

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

// Every whole reading made, by language and text, for the tab's life, and the asks out now, so a second place asking
// for a text already asked for waits on the same answer rather than asking again.
const kept = new Map<string, Reading>();
const asked = new Map<string, Promise<Reading>>();

// The busy answers waited out before a text is said to be untranslated, as bmo-ui's module waits them.
const BUSY_WAITS_MS = [2_000, 4_000, 8_000];

async function askedOnce(text: string, language: string): Promise<Reading> {
  for (let tried = 0; ; tried += 1) {
    try {
      const answer = await $fetch<{ readings: Reading[] }>("/api/translations", { method: "POST", body: { language, originals: [text] } });

      return answer.readings[0] ?? { text, whole: false, untranslated: true };
    } catch (error) {
      const status = (error as { statusCode?: number; status?: number }).statusCode ?? (error as { status?: number }).status;

      if (status !== 503 && status !== 504) throw error;
      if (tried === BUSY_WAITS_MS.length) return { text, whole: false, untranslated: true };

      await new Promise((done) => setTimeout(done, BUSY_WAITS_MS[tried]));
    }
  }
}

function readingOf(text: string, language: string): Promise<Reading> {
  const key = `${language}\u0000${text}`;
  const whole = kept.get(key);

  if (whole !== undefined) return Promise.resolve(whole);

  const out = asked.get(key);

  if (out !== undefined) return out;

  const ask = askedOnce(text, language)
    .then((read) => {
      if (read.whole) kept.set(key, read);

      return read;
    })
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

/** Why a press cannot ask for a reading now: the console names no translator, or the translator answered too busy. */
export type ReadingBlock = "absent" | "busy";

/** One text's reading in the reader's language, asked when `ask` is pressed and asked again on the same press. */
export function useAskedReading(
  text: () => string,
  language: () => DocumentLanguage
): { reading: Ref<TextReading>; blocked: Ref<ReadingBlock | null>; ask: () => void } {
  const reading = ref<TextReading>({ kind: "none" });
  const blocked = ref<ReadingBlock | null>(null);
  let generation = 0;

  async function ask(): Promise<void> {
    const original = text();
    const into = language();
    const mine = ++generation;

    blocked.value = null;

    if (!hasTranslator()) {
      blocked.value = "absent";

      return;
    }

    if (!wantsReading(original, into)) {
      reading.value = { kind: "none" };

      return;
    }

    reading.value = { kind: "asking" };

    try {
      const read = await readingOf(original, into);

      if (mine !== generation) return;

      if (read.untranslated === true) {
        blocked.value = "busy";
        reading.value = { kind: "busy" };

        return;
      }

      reading.value = { kind: "read", text: read.text, whole: read.whole };
    } catch {
      if (mine !== generation) return;

      reading.value = { kind: "failed" };
    }
  }

  // Another text is another reading: the one pressed for before stands no longer.
  watch(text, () => {
    generation += 1;
    reading.value = { kind: "none" };
    blocked.value = null;
  });

  return { reading, blocked, ask: () => void ask() };
}

// The cookie this browser keeps whether a text in another language opens already read in the reader's own.
const AUTO_TRANSLATE_COOKIE = "console_auto_translate";
// How long the choice is kept: a year, renewed each time it is changed.
const AUTO_TRANSLATE_KEPT_S = 365 * 24 * 60 * 60;

/** Whether a text a worker or a job wrote in another language opens already read in the reader's own, as this browser
 * keeps it (docs/web.md, 「The original, and its translation in its place」): on unless it is turned off. */
export function useAutoTranslate(): Ref<boolean> {
  return useCookie<boolean>(AUTO_TRANSLATE_COOKIE, { default: () => true, maxAge: AUTO_TRANSLATE_KEPT_S, sameSite: "lax" });
}

/** A short text read in the reader's language exactly while `follow` says so, as a text beside a TranslatedText that
 * carries the one line for both: its reading is asked as that text opens where this browser translates on its own,
 * else once `follow` turns, and the original stands otherwise. */
export function useFollowedReading(text: () => string, follow: () => boolean): ComputedRef<string> {
  const { locale } = useI18n();
  const language = computed(() => readerLanguage(locale.value));
  const { reading, ask } = useAskedReading(text, () => language.value);
  const auto = useAutoTranslate();

  watch(
    [text, auto, follow],
    () => {
      if (wantsReading(text(), language.value) && (auto.value || follow()) && reading.value.kind === "none") ask();
    },
    { immediate: true }
  );

  return computed(() => (follow() && reading.value.kind === "read" ? reading.value.text : text()));
}

/** Short texts that stand where no line has room — names in a list — each read in the reader's language where it
 * takes a reading and this browser reads on opening, by its original; a text whose reading has not come, did not come
 * or is not wanted is absent, its original standing. Each reading is asked once, as every other reading is. */
export function useOpenedReadings(texts: () => readonly string[]): ComputedRef<ReadonlyMap<string, string>> {
  const { locale } = useI18n();
  const language = computed(() => readerLanguage(locale.value));
  const auto = useAutoTranslate();
  // Every reading that came, by language and original.
  const came = ref(new Map<string, string>());

  watch(
    [texts, language, auto],
    () => {
      if (!import.meta.client || !auto.value || !hasTranslator()) return;

      for (const text of new Set(texts())) {
        const into = language.value;
        const key = `${into}\u0000${text}`;

        if (!wantsReading(text, into) || came.value.has(key)) continue;

        readingOf(text, into)
          .then((read) => {
            if (read.untranslated !== true) came.value = new Map(came.value).set(key, read.text);
          })
          .catch(() => undefined);
      }
    },
    { immediate: true }
  );

  return computed(() => {
    if (!auto.value) return new Map();

    return new Map(
      texts().flatMap((text) => {
        const read = came.value.get(`${language.value}\u0000${text}`);

        return read === undefined ? [] : [[text, read] as const];
      })
    );
  });
}
