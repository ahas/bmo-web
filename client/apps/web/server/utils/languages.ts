import { isConsoleLanguage } from "#shared/languages";

import type { ConsoleLanguage } from "#shared/languages";

// The language each account reads the console in, kept against the account so it follows the person to every
// browser and device (docs/web.md, 「Wording and the language pack」).

// The account's language: null where it never chose one, or chose one the console no longer speaks, so its browser's
// stands.
export async function readLanguage(user: string): Promise<ConsoleLanguage | null> {
  const row = (await useWebSql().get("SELECT language FROM web_languages WHERE user_name = $1", user)) as { language: string } | null;

  return row !== null && isConsoleLanguage(row.language) ? row.language : null;
}

// The account's language replaced. The row names the signed-in user on the multi-user model, and is the platform's
// where none is named.
export async function saveLanguage(user: string, language: ConsoleLanguage, now: number, userId: number | null): Promise<void> {
  await useWebSql().run(`INSERT INTO web_languages (user_name, language, updated_at, user_id) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_name) DO UPDATE SET language = excluded.language, updated_at = excluded.updated_at, user_id = excluded.user_id`, user, language, now, userId);
}
