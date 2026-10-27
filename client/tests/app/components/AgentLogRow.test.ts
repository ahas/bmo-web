import { describe, expect, test } from "bun:test";

// One line of an agent's log (docs/web.md, 「Agent screen」): a call is one block in the terminal look, its result and
// the change it made inside it, and nothing of it stands as its raw JSON; every other line stands as the words or the
// record it is. Which element holds what is read off the files that ship.

const read = async (name: string): Promise<string> => Bun.file(new URL(`../../../apps/web/app/components/${name}`, import.meta.url)).text();
const source = await read("AgentLogRow.vue");
const template = source.slice(0, source.indexOf("<script"));
const call = await read("AgentToolCall.vue");
const result = await read("AgentToolResult.vue");
const diff = await read("AgentLogDiff.vue");

describe("a call", () => {
  test("is the one terminal block, with no head row of its own and no fold of its arguments", () => {
    expect(template).toContain('<AgentToolCall v-if="line.kind === \'tool\'" :row="props.row" />');
    expect(template).toContain(`<div v-if="line.kind !== 'tool'" class="flex flex-wrap items-center gap-2">`);
    // The one fold a row has is a line of a kind the console does not know.
    expect(template.match(/<UChatTool/g)?.length).toBe(1);
    expect(template).toContain('<UChatTool v-else-if="!known"');
    expect(call).not.toContain("UChatTool");
    expect(call).not.toContain("line.text }}");
  });

  test("stands its description on top, then the prompt and the command whole, wrapped", () => {
    expect(call.indexOf("{{ top }}")).toBeLessThan(call.indexOf("data-tool-command"));
    expect(call).toContain("text-(--ansi-blue)");
    expect(call).toContain("❯");
    expect(call).toMatch(/class="min-w-0 grow break-words whitespace-pre-wrap text-highlighted" data-tool-command/);
    // A shell command is coloured as zsh colours it; any other call's command stands plain.
    expect(call).toContain('<span v-for="(token, index) in tokens" :key="index" :class="SHELL_COLOURS[token.part]">{{ token.text }}</span>');
    expect(call).toContain("<template v-else>{{ command }}</template>");
  });

  test("stands an edit's change under its head, folded until pressed, and a pane program's settling in words", () => {
    expect(call).toContain("callChange(t, line.value.name, line.value.text, cwd.value)");
    expect(call).toContain('<AgentLogDiff v-if="changeOpen" :view="change" bare');
    expect(call).toContain("data-tool-settled");
  });

  test("stands a recorded change as the terminal draws it, and any other result under its fold", () => {
    expect(call).toContain('<AgentLogDiff :view="file" bare />');
    expect(call).toContain('<AgentToolResult v-else-if="result.line.text.trim() !== \'\'"');
    expect(result).toContain("resultParts(props.text)");
    expect(result).toContain("$t('agents.label.result_more', { n: countText(parts.hiddenCount) })");
    expect(result).toContain("colourCode(root.value, dark.value)");
  });
});

describe("a line that is not a call", () => {
  const rest = template.slice(template.indexOf("<template v-else>"), template.indexOf("</li>"));

  test("stands whole as it was stored when it is not words, wrapping rather than clamped or folded", () => {
    expect(rest).toContain('<MarkdownText v-else-if="look.words"');
    expect(rest).toMatch(/<pre v-else class="[^"]*font-mono[^"]*break-words whitespace-pre-wrap[^"]*"/);
    expect(rest).not.toContain("line-clamp");
  });

  test("stands a record that is a JSON object or list as its named fields, never as its text", () => {
    expect(rest).toContain('<dl v-else-if="recordFields.length > 0" class="pair-list');
    expect(source).toContain("jsonFields(t, value)");
  });

  test("wears its badge off the one look every line of this screen takes", () => {
    expect(template).toContain(':label="look.label"');
    expect(source).toContain("lineLook(t, line.value)");
  });
});

describe("the diff", () => {
  test("stands in monospace with numbers that line up, a long line wrapping in place", () => {
    expect(diff).toContain("font-mono");
    expect(diff.match(/tabular-nums/g)?.length).toBe(2);
    expect(diff).toContain("break-words whitespace-pre-wrap");
    expect(diff).not.toContain("overflow-x");
  });

  test("an added line and a removed one wear the success and error tones", () => {
    expect(diff).toContain('"bg-success/10"');
    expect(diff).toContain('"bg-error/10"');
  });
});
