import { withoutBase } from "ufo";

import { mergeWords, openScreen, screenAt, useConsoleScreens } from "~/domain/console-screens";

import type { ConsoleScreen } from "#shared/console-bundles";

// The screens units bring (docs/web.md, 「Screens a unit brings」): the list the reader may open is read once per
// page, on the server where the page is drawn there, and handed on with it, and again as somebody signs in or out; its words are merged into the pack on
// both sides. A page opened at a bundle's screen path loads that bundle before the app first resolves its address,
// so the address finds the bundle's route.
export default defineNuxtPlugin({
  name: "console-bundles",
  async setup(nuxtApp) {
    const screens = useConsoleScreens();
    const read = useState<boolean>("console-screens-read", () => false);
    const path = withoutBase(useRequestURL().pathname, useRuntimeConfig().app.baseURL);

    const { loggedIn } = useUserSession();
    const i18n = nuxtApp.$i18n as { mergeLocaleMessage: (locale: string, words: Record<string, unknown>) => void };

    async function readScreens(): Promise<void> {
      // With no session only a share page's own bundle is answered, and only for the address it stands at.
      const query = loggedIn.value ? {} : { path };

      screens.value = await useRequestFetch()<ConsoleScreen[]>("/api/console-bundles", { query }).catch(() => []);
      mergeWords((locale, words) => i18n.mergeLocaleMessage(locale, words), screens.value);
    }

    if (!read.value) {
      await readScreens();
      read.value = true;
    } else {
      mergeWords((locale, words) => i18n.mergeLocaleMessage(locale, words), screens.value);
    }

    // A login or its end changes which screens the reader may open, with no new page to read them on.
    if (import.meta.client) watch(loggedIn, () => void readScreens());

    if (import.meta.client) {
      const screen = screenAt(screens.value, path);

      if (screen !== null) await openScreen(useRouter(), screen).catch(() => undefined);
    }
  }
});
