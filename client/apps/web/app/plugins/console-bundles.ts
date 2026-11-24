import { withoutBase } from "ufo";

import { mergeWords, openScreen, screenAt, useConsoleScreens, useScreensReader } from "~/domain/console-screens";
import { standUnavailable } from "~/domain/screen-unavailable";
import { useSignedLogin } from "~/domain/signed-login";

// The screens units bring (docs/web.md, 「Screens a unit brings」): the list the reader may open is read once per
// page, on the server where the page is drawn there, and handed on with it, and again as the login changes — a sign-in,
// a sign-out or one login handing over to another (docs/web.md, 「Access」); its words are merged into the pack on both
// sides. A page opened at a bundle's screen path loads that bundle before the app first resolves its address,
// so the address finds the bundle's route; one that does not load has the list read again first (docs/web.md,
// 「Screens a unit brings」).
export default defineNuxtPlugin({
  name: "console-bundles",
  async setup(nuxtApp) {
    const screens = useConsoleScreens();
    const read = useState<boolean>("console-screens-read", () => false);
    const path = withoutBase(useRequestURL().pathname, useRuntimeConfig().app.baseURL);

    const login = useSignedLogin();
    const i18n = nuxtApp.$i18n as { mergeLocaleMessage: (locale: string, words: Record<string, unknown>) => void };
    const reader = useScreensReader();

    // A list that cannot be read stands as no screens at all.
    async function readScreens(): Promise<void> {
      if ((await reader(path)) === null) screens.value = [];
    }

    if (!read.value) {
      await readScreens();
      read.value = true;
    } else {
      mergeWords((locale, words) => i18n.mergeLocaleMessage(locale, words), screens.value);
    }

    // A login, its end or another login in its place changes which screens the reader may open, with no new page to
    // read them on.
    if (import.meta.client) watch(login, () => void readScreens());

    if (import.meta.client) {
      const screen = screenAt(screens.value, path);

      if (screen !== null) await openScreen(useRouter(), screen, () => reader(path)).catch(() => standUnavailable(useRouter(), screen));
    }
  }
});
