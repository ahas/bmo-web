import { DEFAULT_PALETTE, paletteDeclarations, paletteOf } from "bmo-ui/shared/palettes";
import { DEFAULT_THEME, themeDeclarations, themeOf } from "bmo-ui/shared/themes";

import { readPalette, usePalette } from "~/domain/palette";
import { readTheme, useTheme } from "~/domain/theme";

// The page in the signed-in account's theme and palette from its first frame (docs/web.md, 「Both on
// the page」): the server reads both for the page it sends and states their colours in the page's
// head, over the library's own, and the browser reads them again whenever somebody signs in or out, as the tab starts and when it is looked at again.
export default defineNuxtPlugin(async () => {
  const theme = useTheme();
  const palette = usePalette();
  const { loggedIn } = useUserSession();

  // What could not be read says nothing of the choice, so it leaves what is held standing.
  async function read(fetcher: (address: string) => Promise<unknown>): Promise<void> {
    const [themeRead, paletteRead] = await Promise.all([readTheme(fetcher), readPalette(fetcher)]);

    if (themeRead !== null) theme.value = themeRead;
    if (paletteRead !== null) palette.value = paletteRead;
  }

  if (import.meta.server && loggedIn.value) await read(useRequestFetch());

  if (import.meta.client) {
    const again = () => read($fetch as (address: string) => Promise<unknown>);

    watch(loggedIn, async (signedIn) => {
      if (signedIn) {
        await again();
      } else {
        [theme.value, palette.value] = [DEFAULT_THEME.id, DEFAULT_PALETTE.id];
      }
    });

    // A page drawn while the account service could not answer stands in the defaults, and another device may have
    // chosen since: the tab reads both as it starts and whenever it is looked at again.
    if (loggedIn.value) onNuxtReady(() => void again());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && loggedIn.value) void again();
    });
  }

  useHead({
    style: [
      {
        key: "bmo-appearance",
        tagPriority: "critical",
        innerHTML: computed(() => `:root { ${themeDeclarations(themeOf(theme.value))} ${paletteDeclarations(paletteOf(palette.value))} }`)
      }
    ]
  });
});
