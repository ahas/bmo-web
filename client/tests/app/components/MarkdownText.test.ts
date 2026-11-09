import { describe, expect, test } from "bun:test";

// What a markdown text stands as before and after the renderer is in the browser. The component is
// read rather than mounted, as the console's other components are: which element holds the text
// and which the HTML is what the file that ships decides.

const source = await Bun.file(new URL("../../../apps/web/app/components/MarkdownText.vue", import.meta.url)).text();
const template = source.slice(0, source.indexOf("<script"));
const script = source.slice(source.indexOf("<script"));
const loader = await Bun.file(new URL("../../../apps/web/app/domain/markdown-load.ts", import.meta.url)).text();

describe("a markdown text", () => {
  test("stands as the characters it was written as until there is HTML to stand instead", () => {
    expect(template).toContain('<component :is="tag" v-if="html === null"');
    expect(template).toContain("'break-words whitespace-pre-wrap'\">{{ props.text }}</component>");
    expect(template).toMatch(/<component :is="tag" v-else ref="shown" v-bind="\$attrs" class="markdown" :class="`markdown--\$\{props\.kind\}`" @click="pressed" @keydown\.enter="uncovered" v-html="html" \/>/);
    // A press is a spoiler's to uncover first, and a code block's copy button's otherwise.
    expect(source).toMatch(/function pressed\(event: MouseEvent\): void \{\s*if \(!uncovered\(event\)\) \{\s*void copyFromPress\(t, event, copyText\);/);
  });

  // A fenced block's copy button is drawn with the text, so the press on it is taken where the
  // text is put on the screen: every place that shows such a text has it working.
  test("takes a press on a fenced block's copy button", () => {
    expect(script).toContain('import { copyFromPress } from "bmo-ui/app/domain/code-copy";');
    expect(script).toContain('import { copyText } from "~/domain/copy";');
    expect(template.match(/v-html/g)).toHaveLength(1);
  });

  test("says when its formatted form is on the page, with the element that holds it", () => {
    expect(script).toContain('defineEmits<{ rendered: [element: HTMLElement] }>()');
    expect(script).toContain('emit("rendered", shown.value)');
  });

  test("draws the diagrams in its text once it is on the page, and again when the theme switches", () => {
    expect(script).toContain('import { drawDiagrams } from "bmo-ui/app/domain/diagram";');
    expect(script).toContain("void drawDiagrams(shown.value, dark.value);");
    expect(script).toContain("void drawDiagrams(shown.value, inDark);");
  });

  // A text mounted with the renderer already in the browser — a message arriving in an open room —
  // has its HTML from the start, and is settled all the same.
  test("colours its code blocks when it is mounted with its HTML already drawn, and lets them go as the text is replaced or leaves", () => {
    expect(script).toContain("colourCode(shown.value, dark.value);");
    expect(script).toContain("{ flush: \"post\", immediate: true }");
    expect(script.match(/forgetCode\(shown\.value\)/g)).toHaveLength(2);
  });

  test("stands inline in both of its forms when it is a line, and as a block otherwise", () => {
    expect(script).toContain('const tag = computed(() => (props.kind === "line" ? "span" : "div"));');
    expect(template).toContain(":class=\"props.kind === 'line' ? '' : 'break-words whitespace-pre-wrap'\"");
  });

  test("draws the plain text while the page is hydrated, so the browser's first pass agrees with the server's", () => {
    expect(script).toContain("useNuxtApp().isHydrating ? null : markdownRenderer()");
  });

  test("gets its HTML from the renderer alone, which the browser fetches and the server never carries", () => {
    expect(script).toContain("renderer.value.renderMarkdown(t, props.text, props.kind)");
    expect(script).toContain("await loadMarkdownRenderer()");
    expect(script).not.toMatch(/^import (?!type )[^\n]*domain\/markdown"/m);
    expect(loader).toContain("if (!import.meta.client)");
    expect(loader).toContain('import("./markdown")');
  });

  test("is read as words unless the place says it is a document", () => {
    expect(script).toContain('withDefaults(defineProps<Props>(), { kind: "words" })');
  });
});
