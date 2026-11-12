import { describe, expect, test } from "bun:test";

// A worker's or a job's text, read in the language it was written in or in the reader's own, one at a time in the
// same place (docs/web.md, 「The original, and its translation in its place」).

const source = await Bun.file(new URL("../../../apps/web/app/components/TranslatedText.vue", import.meta.url)).text();
const template = source.slice(0, source.indexOf("<script"));

describe("a translated text", () => {
  test("stands its line above it, and asks the reading as it opens where this browser translates on its own", () => {
    expect(template.indexOf("data-reading")).toBeLessThan(template.indexOf("<slot"));
    expect(template).toContain("$t('common.action.show_translation')");
    expect(source).toContain("useAskedReading");
    expect(source).toContain("const auto = useAutoTranslate();");
    expect(source).toContain("if (auto.value && wanted.value) show();");
    expect(source).toContain("{ immediate: true }");
  });

  test("puts the reading in the original's place, saying where it came from, and puts the original back", () => {
    expect(source).toContain('shown.value && reading.value.kind === "read" ? reading.value.text : props.text');
    expect(template).toContain('$t("common.label.translated_from"');
    expect(template).toContain("$t('common.action.show_original')");
    expect(template).toContain('@click="translated = false"');
    expect(template).not.toContain("translation_of");
  });

  test("says on the same line what did not come, with a retry, and why a line cannot ask", () => {
    expect(template).toContain("$t('common.action.retry_translation')");
    expect(source).toContain('blocked.value === "absent"');
    expect(template).toContain(':disabled="blockedText !== \'\'"');
  });

  // Each entry of an item's review turns — a report, a question, an answer, a rejection, a pass — is a text a worker
  // or a supervisor wrote, read as every other such text is.
  test("stands for each entry of an item's review turns", async () => {
    const detail = await Bun.file(new URL("../../../apps/web/app/components/TodoItemDetail.vue", import.meta.url)).text();

    expect(detail).toContain('<TranslatedText :text="entry.body" class="mt-1" />');
  });
});
