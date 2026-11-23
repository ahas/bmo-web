import { browserLanguage, acceptedTags, isConsoleLanguage, LANGUAGE_COOKIE, LANGUAGE_COOKIE_SECONDS, LANGUAGE_LOOKS } from "#shared/languages";

import type { Ref } from "vue";
import type { ConsoleLanguage } from "#shared/languages";

// The language a reader reads the console in (docs/web.md, 「Wording and the language pack」): the one their account
// chose, kept against the account on the server, and where it chose none, the one their browser asks for. The page
// is drawn in it from the first frame, every bundle's words follow it, and the browser carries it to the server in a
// cookie, so each request is answered in it.

const ACCOUNT_ADDRESS = "/api/account/language";

/** The language the console is read in now. */
export function useLanguage(): Ref<ConsoleLanguage> {
  return useState<ConsoleLanguage>("language", () => "ko");
}

/** The cookie the browser carries the language in. */
export function useLanguageCookie(): Ref<string | null | undefined> {
  return useCookie<string | null | undefined>(LANGUAGE_COOKIE, { maxAge: LANGUAGE_COOKIE_SECONDS, sameSite: "lax", path: "/" });
}

/** The account's own choice: the language it chose, none where it chose none, null where it could not be read, which
 * says nothing of the choice, so the caller keeps what it holds. */
export async function readAccountLanguage(fetcher: (address: string) => Promise<unknown>): Promise<ConsoleLanguage | "none" | null> {
  try {
    const answer = (await fetcher(ACCOUNT_ADDRESS)) as { language?: unknown };

    return isConsoleLanguage(answer.language) ? answer.language : "none";
  } catch {
    return null;
  }
}

/** The language a browser asks for where no account chose one: its kept cookie, else the languages it lists — the
 * page's own in the browser, the request's header on the server. */
export function browserDefault(kept: string | null | undefined, tags: readonly string[]): ConsoleLanguage {
  return isConsoleLanguage(kept) ? kept : browserLanguage(tags);
}

/** The tags the browser lists, in the order it prefers them, wherever the page is being drawn. */
export function listedTags(): string[] {
  if (import.meta.client) return [...(navigator.languages ?? [navigator.language])];

  return acceptedTags(useRequestHeaders(["accept-language"])["accept-language"]);
}

/** A language chosen in the settings: the console takes it at once, and it is kept against the account. Where the
 * server refuses it the console goes back to what it read before, and the refusal is thrown to the screen. */
export async function chooseLanguage(language: Ref<ConsoleLanguage>, chosen: ConsoleLanguage): Promise<void> {
  const before = language.value;

  language.value = chosen;

  try {
    await $fetch(ACCOUNT_ADDRESS, { method: "PUT", body: { language: chosen } });
  } catch (error) {
    language.value = before;
    throw error;
  }
}

/** The tag a language's figures and the document's `lang` are written in. */
export function languageTag(language: ConsoleLanguage): string {
  return LANGUAGE_LOOKS[language].tag;
}
