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

  // A job's question card is read in the reader's language whole: its question under the one line, and its reason and
  // options following that line, so showing the original puts all of them back; the answer sent is the option as written.
  test("stands for a job's question card, its reason and options following its question", async () => {
    const ask = await Bun.file(new URL("../../../apps/web/app/components/QuestionAsk.vue", import.meta.url)).text();
    const inline = await Bun.file(new URL("../../../apps/web/app/domain/text-reading.ts", import.meta.url)).text();

    expect(ask).toContain('<TranslatedText :text="card.question" class="mt-1" @shown="readingShown[card.id] = $event" />');
    expect(ask).toContain(':text="card.why" :follow="readingShown[card.id] === true"');
    expect(ask).toContain('<TranslatedInline :text="option.text" :follow="readingShown[card.id] === true" />');
    expect(ask).toContain("@click=\"choose(card, option.number - 1)\"");
    expect(source).toContain('watch(shown, (now) => emit("shown", now), { immediate: true });');
    expect(inline).toContain('follow() && reading.value.kind === "read" ? reading.value.text : text()');
  });
});
