import type { ConsoleLanguage } from "#shared/languages";

// The language the logged-in account reads the console in; null where it never chose one.
export default defineEventHandler(async (event): Promise<{ language: ConsoleLanguage | null }> => {
  const signed = await signedInUser(event);

  return { language: await readLanguage(signed.name) };
});
