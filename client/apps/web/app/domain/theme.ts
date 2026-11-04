import { DEFAULT_THEME, isThemeId } from "bmo-ui/shared/themes";

import { keepChoice, readKeptChoice, useKeptChoice } from "./kept-choice";

import type { Ref } from "vue";
import type { KeptChoice } from "./kept-choice";

// The theme the signed-in account reads the console in (docs/web.md, 「Themes」).
const THEME: KeptChoice = { key: "theme", address: "/api/account/theme", field: "theme", isChoice: isThemeId, fallback: DEFAULT_THEME.id };

export function useTheme(): Ref<string> {
  return useKeptChoice(THEME);
}

export function readTheme(fetcher: (address: string) => Promise<unknown>): Promise<string | null> {
  return readKeptChoice(THEME, fetcher);
}

export function chooseTheme(chosen: Ref<string>, theme: string): Promise<void> {
  return keepChoice(THEME, chosen, theme);
}
