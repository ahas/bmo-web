// The languages the console speaks (docs/web.md, 「Wording and the language pack」): Korean, the source the wording
// guide governs, and English, Japanese and Simplified Chinese, each a pack holding the same keys. A reader reads the
// console in the language their account chose, and where it chose none, in the one their browser asks for.

export const CONSOLE_LANGUAGES = ["ko", "en", "ja", "zh-CN"] as const;

export type ConsoleLanguage = (typeof CONSOLE_LANGUAGES)[number];

/** The language every pack is written from, and the one a unit asking on its own account is answered in. */
export const SOURCE_LANGUAGE: ConsoleLanguage = "ko";

/** The cookie a browser carries the language it reads the console in, so the server answers each request in it. */
export const LANGUAGE_COOKIE = "bmo-language";

/** How long the cookie is kept from the last time it was written: a year, as the screen mode's is. */
export const LANGUAGE_COOKIE_SECONDS = 365 * 24 * 60 * 60;

/** What the rest of the page reads a language by: the tag figures and the document's `lang` are written in, the
 * dayjs locale dates' words are, and the tag its own name is written in, in its own script. */
export interface LanguageLook {
  tag: string;
  dateLocale: string;
  ownScript: string;
}

export const LANGUAGE_LOOKS: Record<ConsoleLanguage, LanguageLook> = {
  ko: { tag: "ko-KR", dateLocale: "ko", ownScript: "ko" },
  en: { tag: "en-US", dateLocale: "en", ownScript: "en" },
  ja: { tag: "ja-JP", dateLocale: "ja", ownScript: "ja" },
  "zh-CN": { tag: "zh-CN", dateLocale: "zh-cn", ownScript: "zh-Hans" }
};

export function isConsoleLanguage(value: unknown): value is ConsoleLanguage {
  return typeof value === "string" && (CONSOLE_LANGUAGES as readonly string[]).includes(value);
}

/** The console's language a BCP 47 tag asks for, by its primary subtag: Korean, Japanese and Chinese of any region
 * or script to their own, English to English; null for any other. */
export function languageOfTag(tag: string): ConsoleLanguage | null {
  const primary = tag.trim().split(/[-_]/)[0]!.toLowerCase();

  if (primary === "ko") return "ko";
  if (primary === "ja") return "ja";
  if (primary === "zh") return "zh-CN";
  if (primary === "en") return "en";

  return null;
}

/** The language a browser asks for, from the tags it lists in the order it prefers them — `navigator.languages`, or
 * an `Accept-Language` header read by weight — the first the console speaks, and English where it speaks none. */
export function browserLanguage(tags: readonly string[]): ConsoleLanguage {
  for (const tag of tags) {
    const language = languageOfTag(tag);

    if (language !== null) return language;
  }

  return "en";
}

/** The tags an `Accept-Language` header lists, by their weights, the heaviest first; a tag weighed 0 is refused. */
export function acceptedTags(header: string | null | undefined): string[] {
  return (header ?? "")
    .split(",")
    .map((part, place) => {
      const [tag = "", ...rest] = part.split(";").map((piece) => piece.trim());
      const weight = rest.find((piece) => piece.startsWith("q="));

      return { tag, weight: weight === undefined ? 1 : Number(weight.slice(2)), place };
    })
    .filter(({ tag, weight }) => tag !== "" && tag !== "*" && Number.isFinite(weight) && weight > 0)
    .sort((left, right) => right.weight - left.weight || left.place - right.place)
    .map(({ tag }) => tag);
}

/** A language's name in its own script, as the runtime names it, so no pack
 * holds another language's words. */
export function ownName(language: ConsoleLanguage): string {
  const script = LANGUAGE_LOOKS[language].ownScript;

  return new Intl.DisplayNames([script], { type: "language" }).of(script) ?? language;
}
