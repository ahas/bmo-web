import { LANGUAGE_LOOKS } from "#shared/languages";

import { browserDefault, listedTags, readAccountLanguage, useLanguage, useLanguageCookie } from "~/domain/language";

import type { ConsoleLanguage } from "#shared/languages";

// The page in the reader's language from its first frame (docs/web.md, 「Wording and the language pack」): the server
// reads the account's choice for the page it sends, else the browser's cookie or the languages its request lists, and
// the browser reads the account's again whenever somebody signs in or out, as the tab starts and when it is looked at
// again. Whatever the language is, the i18n module speaks it — every locale switch the module makes is turned to it —
// the document's `lang`, the figures and the dates follow it, and the cookie carries it to the server.
export default defineNuxtPlugin({
  name: "bmo:language",
  dependsOn: ["i18n:plugin"],
  async setup(nuxtApp) {
    const language = useLanguage();
    const cookie = useLanguageCookie();
    const { loggedIn } = useUserSession();
    const i18n = nuxtApp.$i18n;
    const appConfig = useAppConfig();
    // The languages the browser lists, read while the plugin still stands in the app's context.
    const tags = listedTags();
    const fetchOnServer = import.meta.server ? useRequestFetch() : null;

    // The module switches locale of its own as a page is entered; every switch lands on the reader's language.
    nuxtApp.hook("i18n:beforeLocaleSwitch", (switching) => {
      switching.newLocale = language.value;
    });

    async function speak(chosen: ConsoleLanguage): Promise<void> {
      language.value = chosen;
      cookie.value = chosen;
      appConfig.bmoUi.locale = LANGUAGE_LOOKS[chosen].tag;
      appConfig.bmoUi.dateLocale = LANGUAGE_LOOKS[chosen].dateLocale;
      await i18n.setLocale(chosen);
    }

    // What the account says, and the browser's own where it says nothing; what could not be read leaves what is held
    // standing.
    async function read(fetcher: (address: string) => Promise<unknown>): Promise<ConsoleLanguage | null> {
      const account = await readAccountLanguage(fetcher);

      if (account === null) return null;

      return account === "none" ? browserDefault(cookie.value, tags) : account;
    }

    // The document's `lang` follows the language, stated while the plugin stands in the app's context.
    useHead({ htmlAttrs: { lang: computed(() => LANGUAGE_LOOKS[language.value].tag) } });

    if (import.meta.server) {
      const asked = loggedIn.value && fetchOnServer !== null ? await read(fetchOnServer) : null;

      await speak(asked ?? browserDefault(cookie.value, tags));
    } else {
      await speak(language.value);
    }

    watch(language, (chosen) => void speak(chosen));

    if (import.meta.client) {
      const again = async () => {
        const asked = await read($fetch as (address: string) => Promise<unknown>);

        if (asked !== null && asked !== language.value) language.value = asked;
      };

      watch(loggedIn, (signedIn) => {
        if (signedIn) void again();
      });
      if (loggedIn.value) onNuxtReady(() => void again());
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && loggedIn.value) void again();
      });
    }
  }
});
