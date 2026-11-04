import { DEFAULT_PALETTE, isPaletteId } from "bmo-ui/shared/palettes";

import { keepChoice, readKeptChoice, useKeptChoice } from "./kept-choice";

import type { Ref } from "vue";
import type { KeptChoice } from "./kept-choice";

// The palette the signed-in account's bubbles are drawn in (docs/web.md, 「Palettes」).
const PALETTE: KeptChoice = { key: "palette", address: "/api/account/palette", field: "palette", isChoice: isPaletteId, fallback: DEFAULT_PALETTE.id };

export function usePalette(): Ref<string> {
  return useKeptChoice(PALETTE);
}

export function readPalette(fetcher: (address: string) => Promise<unknown>): Promise<string | null> {
  return readKeptChoice(PALETTE, fetcher);
}

export function choosePalette(chosen: Ref<string>, palette: string): Promise<void> {
  return keepChoice(PALETTE, chosen, palette);
}
