import { createI18n } from "vue-i18n";

import english from "../i18n/locales/en.yaml";
import japanese from "../i18n/locales/ja.yaml";
import pack from "../i18n/locales/ko.yaml";
import chinese from "../i18n/locales/zh-CN.yaml";
import { SOURCE_LANGUAGE } from "./languages";

import type { ConsoleLanguage } from "./languages";

// The console's words outside a component (`docs/web.md`, "Wording and the language pack"). A screen
// asks `useI18n()`; the server, and a test standing in for a screen, ask here. Both read the same
// packs through the same engine, so a key cannot read one way on a screen and another in a response.
// Client app code never imports this module: the screens' own instance is the module's.

export type WordingParams = Record<string, string | number>;

// What a pure function is handed when it has words to say. A screen passes its `t`; the server and
// the tests pass `wording`.
export type Translate = (key: string, params?: WordingParams) => string;

// The pack as it stands in the file: groups of groups, ending in the words.
export type Pack = { [key: string]: string | Pack };

// The language the source pack is written in, as a unit asked for words names it.
export const WORDING_LANGUAGE = SOURCE_LANGUAGE;

// One engine over the four packs, typed by the shape the pack stands in.
const i18n = createI18n({
  legacy: false,
  locale: WORDING_LANGUAGE,
  messages: { ko: pack as Pack, en: english as Pack, ja: japanese as Pack, "zh-CN": chinese as Pack },
  // A key the pack does not hold is a fault in the code that asked, never a word to show: left to
  // itself the engine would answer with the key, and a reader would see `mail.error.…` on a screen.
  missing: (_locale: string, key: string) => {
    throw new Error(`no such key in the language pack: ${key}`);
  },
  missingWarn: false,
  fallbackWarn: false
});

// The language the words asked now are said in: the source's until the server names how to tell the language of
// the request being answered (`server/plugins/language.ts`).
let speaking: () => ConsoleLanguage = () => WORDING_LANGUAGE;

/** Names how to tell the language the words asked now are said in. */
export function speakBy(resolver: () => ConsoleLanguage): void {
  speaking = resolver;
}

/** The language the words asked now are said in. */
export function spokenLanguage(): ConsoleLanguage {
  return speaking();
}

/** The console's words in one language; a key that language's pack lacks reads as the source's. */
export function wordingIn(language: ConsoleLanguage): Translate {
  return (key, params) => i18n.global.t(key, params ?? {}, { locale: i18n.global.te(key, language) ? language : WORDING_LANGUAGE });
}

/** The console's words in the language of the request being answered. */
export const wording: Translate = (key, params) => wordingIn(speaking())(key, params);

// Every key the pack holds with the words it holds, as dotted paths.
export function packEntries(from: Pack = pack as Pack, prefix = ""): [string, string][] {
  return Object.entries(from).flatMap(([name, value]) => {
    const key = prefix === "" ? name : `${prefix}.${name}`;

    return typeof value === "string" ? [[key, value] as [string, string]] : packEntries(value, key);
  });
}

// The keys whose words are exactly this text. A test that once looked for the words in a screen's
// source looks for one of these keys there instead, and so still says which words stand on it.
export function keysFor(text: string): string[] {
  return packEntries()
    .filter(([, value]) => value === text)
    .map(([key]) => key);
}
