import { describe, expect, test } from "bun:test";

// A brain memory as the console's modal reads it (docs/web.md, the room screen's brain chip, and the translated texts
// section): the text as the brain keeps it, a translate action beside it, and the gate's reading under the original. The
// action asks nothing until it is pressed, and stands disabled with its reason where it cannot ask.

const read = async (path: string) => await Bun.file(new URL(`../../../apps/web/${path}`, import.meta.url)).text();

const text = await read("app/components/BrainMemoryText.vue");
const modal = await read("app/components/BrainReadDialog.vue");
const domain = await read("app/domain/text-reading.ts");

describe("a memory's words in the modal", () => {
  test("stand as the brain keeps them, and the modal draws them through this component", () => {
    expect(text).toContain("data-brain-read-text");
    expect(modal).toContain('<BrainMemoryText v-else-if="text !== null" :text="text" />');
    expect(modal).not.toContain("data-brain-read-text");
  });

  test("carry a translate action that asks nothing until it is pressed", () => {
    expect(text).toContain("data-brain-translate");
    expect(text).toContain('$t(\'common.action.translate\')');
    expect(text).toContain("@click=\"ask\"");
    expect(domain).toContain("export function useAskedReading");
    expect(domain).toContain("if (!hasTranslator()) {");
  });

  test("stand the reading under the original, headed by the reader's language", () => {
    expect(text).toContain("data-reading");
    expect(text).toContain('$t("documents.label.translation_of"');
    expect(text).toContain("data-brain-read-translation");
    expect(text).toContain('$t(\'common.action.retry_translation\')');
  });

  test("disable the action with its reason where no translator is named or it answered too busy", () => {
    expect(text).toContain(':disabled="blockedText !== \'\' || asking"');
    expect(text).toContain('<UTooltip :text="blockedText" :disabled="blockedText === \'\'">');
    // A disabled button takes no pointer, so the tooltip hangs on the wrapper that holds it.
    expect(text).toContain('data-brain-translate-holder');
    expect(text).toContain('blocked.value === "absent"');
    expect(text).toContain('blocked.value === "busy"');
    expect(domain).toContain('blocked.value = "busy";');
  });
});
