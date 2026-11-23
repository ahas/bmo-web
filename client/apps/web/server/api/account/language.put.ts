import { isConsoleLanguage, LANGUAGE_COOKIE, LANGUAGE_COOKIE_SECONDS } from "#shared/languages";
import { wording } from "#shared/wording";

import type { ConsoleLanguage } from "#shared/languages";

// The logged-in account's language replaced, kept as it is chosen, and this browser's cookie with it, so the answer
// and every request after it speak the language chosen.
export default defineEventHandler(async (event): Promise<{ language: ConsoleLanguage }> => {
  const signed = await signedInUser(event);
  const body = (await readBody(event)) as { language?: unknown } | null;
  const language = body?.language;

  if (!isConsoleLanguage(language)) {
    throw fail(400, wording("account.error.bad_language"));
  }

  await saveLanguage(signed.name, language, Math.floor(Date.now() / 1000), signed.id);
  setCookie(event, LANGUAGE_COOKIE, language, { path: "/", maxAge: LANGUAGE_COOKIE_SECONDS, sameSite: "lax" });
  event.context.language = language;

  return { language };
});
