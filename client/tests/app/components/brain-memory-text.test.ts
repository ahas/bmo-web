import { describe, expect, test } from "bun:test";

// A brain memory as the console's modal reads it (docs/web.md, the room screen's brain chip, and 「The original, and
// its translation in its place」): the text as the brain keeps it, its reading a press away in the same place.

const read = async (path: string) => await Bun.file(new URL(`../../../apps/web/${path}`, import.meta.url)).text();

const text = await read("app/components/BrainMemoryText.vue");
const modal = await read("app/components/BrainReadDialog.vue");

describe("a memory's words in the modal", () => {
  test("stand as the brain keeps them, and the modal draws them through this component", () => {
    expect(text).toContain("data-brain-read-text");
    expect(modal).toContain('<BrainMemoryText v-else-if="text !== null" :text="text" />');
    expect(modal).not.toContain("data-brain-read-text");
  });

  test("stand the original or its reading in one place, through the translated text's toggle", () => {
    expect(text).toContain('<TranslatedText :text="props.text">');
    expect(text).toContain("{{ standing }}");
    expect(text).not.toContain("translation_of");
  });
});
