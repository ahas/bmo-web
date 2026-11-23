import { acceptedTags, browserLanguage, isConsoleLanguage, LANGUAGE_COOKIE, SOURCE_LANGUAGE } from "#shared/languages";
import { speakBy } from "#shared/wording";

import type { H3Event } from "h3";
import type { ConsoleLanguage } from "#shared/languages";

// Every request answered in the reader's language (docs/web.md, 「Wording and the language pack」): the one the
// browser's cookie carries, which the page keeps to the account's choice, else the one its `Accept-Language` asks
// for, and the source language for a request naming none, as a unit asking on its own account does. The console's
// words are said in it, and the account service is asked in it.
export function requestLanguage(event: H3Event): ConsoleLanguage {
  const context = event.context as { language?: ConsoleLanguage };

  if (context.language !== undefined) return context.language;

  const kept = getCookie(event, LANGUAGE_COOKIE);
  const header = getRequestHeader(event, "accept-language");

  context.language = isConsoleLanguage(kept) ? kept : header === undefined || header.trim() === "" ? SOURCE_LANGUAGE : browserLanguage(acceptedTags(header));

  return context.language;
}

export default defineNitroPlugin(() => {
  speakBy(() => {
    try {
      return requestLanguage(useEvent());
    } catch {
      // Words asked outside any request — a push sent from the server's own timer — are said in the source language.
      return SOURCE_LANGUAGE;
    }
  });
});
