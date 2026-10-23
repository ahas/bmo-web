import { createI18n } from "vue-i18n";

import pack from "../i18n/locales/ko.yaml";

// The console's words outside a component (`docs/web.md`, "Wording and the language pack"). A screen
// asks `useI18n()`; the server, and a test standing in for a screen, ask here. Both read the one
// pack through the same engine, so a key cannot read one way on a screen and another in a response.
// Client app code never imports this module: the screens' own instance is the module's.

export type WordingParams = Record<string, string | number>;

// What a pure function is handed when it has words to say. A screen passes its `t`; the server and
// the tests pass `wording`.
export type Translate = (key: string, params?: WordingParams) => string;

// The pack as it stands in the file: groups of groups, ending in the words.
export type Pack = { [key: string]: string | Pack };

// One engine over the one pack, Korean, typed by the shape the pack stands in.
const i18n = createI18n({
  legacy: false,
  locale: "ko",
  messages: { ko: pack as Pack },
  // A key the pack does not hold is a fault in the code that asked, never a word to show: left to
  // itself the engine would answer with the key, and a reader would see `mail.error.…` on a screen.
  missing: (_locale: string, key: string) => {
    throw new Error(`no such key in the language pack: ${key}`);
  },
  missingWarn: false,
  fallbackWarn: false
});

export const wording: Translate = (key, params) => i18n.global.t(key, params ?? {});

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
