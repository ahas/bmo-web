import { describe, expect, test } from "bun:test";

import english from "../../apps/web/i18n/locales/en.yaml";
import japanese from "../../apps/web/i18n/locales/ja.yaml";
import chinese from "../../apps/web/i18n/locales/zh-CN.yaml";
import { acceptedTags, browserLanguage, CONSOLE_LANGUAGES, languageOfTag, ownName } from "../../apps/web/shared/languages";
import { subjectOf } from "../../apps/web/shared/particles";
import { packEntries, wordingIn } from "../../apps/web/shared/wording";

import KO from "../fixtures/i18n/languages.test.ko.json";

import type { Pack } from "../../apps/web/shared/wording";

// The console speaks four languages (`docs/web.md`, "Wording and the language pack"): Korean, the source the wording
// guide governs, and English, Japanese and Simplified Chinese, each holding the source's keys in its order with the
// marks each of its values carries, none of them Korean, every value one the engine reads.

const SOURCE = packEntries();
const TRANSLATIONS: [string, Pack][] = [
  ["en", english as Pack],
  ["ja", japanese as Pack],
  ["zh-CN", chinese as Pack]
];
const HANGUL = /\p{Script=Hangul}/u;
const marks = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map(([, name]) => name!).sort();

describe.each(TRANSLATIONS)("the %s pack", (language, pack) => {
  const entries = packEntries(pack);
  const values = new Map(entries);

  test("holds the source's keys, in the source's order", () => {
    expect(entries.map(([key]) => key)).toEqual(SOURCE.map(([key]) => key));
  });

  test("carries the marks each of the source's values carries", () => {
    const unlike = SOURCE.filter(([key, value]) => JSON.stringify(marks(value)) !== JSON.stringify(marks(values.get(key) ?? ""))).map(([key]) => key);

    expect(unlike).toEqual([]);
  });

  test("holds no Korean and no value that begins or ends with a space or a separator", () => {
    expect(entries.filter(([, value]) => HANGUL.test(value)).map(([key]) => key)).toEqual([]);
    expect(entries.filter(([, value]) => /^[\s·]|[\s·]$/.test(value)).map(([key]) => key)).toEqual([]);
  });

  // The build compiles each pack strictly, and a value holding what reads as a markup tag stops it.
  test("holds no value that reads as markup", () => {
    expect(entries.filter(([, value]) => /<\/?[A-Za-z]/.test(value)).map(([key]) => key)).toEqual([]);
  });

  test("holds only values the engine reads as they are written", () => {
    const say = wordingIn(language as (typeof CONSOLE_LANGUAGES)[number]);
    const broken: string[] = [];

    for (const [key, value] of entries) {
      if (value.replace(/\{'[^']*'\}/g, "").includes("|")) broken.push(`${key}: a bare |`);

      try {
        say(key, Object.fromEntries(marks(value).map((name) => [name, "x"])));
      } catch (error) {
        broken.push(`${key}: ${(error as Error).message.split("\n")[0]}`);
      }
    }

    expect(broken).toEqual([]);
  });
});

describe("a reader's language", () => {
  test("is the one their browser asks for by its primary subtag, and English where it asks for none the console speaks", () => {
    expect(["ko-KR", "ja", "zh-TW", "zh-Hans-CN", "en-GB"].map(languageOfTag)).toEqual(["ko", "ja", "zh-CN", "zh-CN", "en"]);
    expect(languageOfTag("fr")).toBeNull();
    expect(browserLanguage(["fr-FR", "ja-JP", "ko"])).toBe("ja");
    expect(browserLanguage(["fr-FR", "de"])).toBe("en");
    expect(browserLanguage([])).toBe("en");
  });

  test("is read from an Accept-Language header by its weights", () => {
    expect(acceptedTags("fr;q=0.4, ko-KR, ja;q=0.8, en;q=0")).toEqual(["ko-KR", "ja", "fr"]);
    expect(browserLanguage(acceptedTags("de-DE,de;q=0.9,zh-CN;q=0.8"))).toBe("zh-CN");
  });

  test("is named in its own script whatever the console speaks", () => {
    expect(CONSOLE_LANGUAGES.map(ownName)).toEqual(KO.own_names);
  });

  test("joins a name to the subject particle in Korean alone", () => {
    for (const language of ["en", "ja", "zh-CN"] as const) {
      expect(subjectOf(wordingIn(language), "BMO")).toBe("BMO");
      expect(subjectOf(wordingIn(language), "Bob")).toBe("Bob");
    }

    expect(subjectOf(wordingIn("ko"), "BMO")).toBe(wordingIn("ko")("common.label.subject_unread", { name: "BMO" }));
  });
});
