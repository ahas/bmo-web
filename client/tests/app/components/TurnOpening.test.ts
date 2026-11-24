import { describe, expect, test } from "bun:test";

// The quiet instructions a turn carried, above its verdict cards (docs/web.md, the room screen's judgements section), read from
// the file that ships: what a rendered screen would not name is where the whole text comes from and
// when it is asked for.

const source = await Bun.file(new URL("../../../apps/web/app/components/TurnOpening.vue", import.meta.url)).text();
const template = source.slice(0, source.indexOf("<script"));
const script = source.slice(source.indexOf("<script"));

describe("a line of the turn's opening", () => {
  test("is the producer's sort, worded by the one rule every turn's line reads, its key in the administrator's tooltip where it has no word, and the one-line summary", () => {
    expect(template).toContain('<CodeWord class="truncate" :text="sortOf(instruction)" :code="sortCode(instruction.sort)" />');
    expect(template).toContain(":class=\"isOpen(instruction.id) ? 'wrap-anywhere' : 'truncate'\">{{ instruction.summary }}");
    expect(script).toContain("sortLabel(t, instruction.sort)");
  });

  test("spreads the whole text, read from the room's own route the first time it is asked for and never again", () => {
    expect(script).toContain("`/api/rooms/${props.chatId}/instructions/${id}`");
    expect(script).toContain("if (texts[id] !== undefined || loading.has(id))");
  });

  test("spread, stands the text's records as names and values with the text as handed folded under them, breaking where the bubble ends", () => {
    expect(script).toContain("parts[id] = instructionParts(text);");
    expect(template).toContain('<dl v-if="part.kind === \'facts\'" class="pair-list');
    expect(template).toContain('<dd class="min-w-0 wrap-anywhere');
    expect(template).toContain(`<UChatTool :text="$t('common.label.original')" chevron="leading">`);
    expect(template.match(/<pre[^>]* class="[^"]*whitespace-pre-wrap wrap-anywhere/g)).toHaveLength(2);
  });

  test("spins its mark while the text is read, and stands the text only once it is in", () => {
    expect(template).toContain("loading.has(instruction.id) ? 'i-material-symbols-progress-activity'");
    expect(template).toContain("animate-spin motion-reduce:animate-none");
    expect(script).toContain("return open.has(id) && !loading.has(id);");
  });
});
