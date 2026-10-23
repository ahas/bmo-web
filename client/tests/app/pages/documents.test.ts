import { describe, expect, test } from "bun:test";

import { SCREENS } from "../../../apps/web/app/domain/screens";

// How the document viewer is put together, read off the files that ship, as the graph screen's
// arrangement is: which parts reuse the console's renderer and editor, where the boundaries come
// from, and what the layout does on a narrow screen. What the panes do when scrolled is checked in a
// browser.

const read = async (path: string): Promise<string> => Bun.file(new URL(path, import.meta.url)).text();
const page = await read("../../../apps/web/app/pages/documents.vue");
const reader = await read("../../../apps/web/app/components/DocumentReader.vue");
const pane = await read("../../../apps/web/app/components/DocumentPane.vue");
const toc = await read("../../../apps/web/app/components/DocumentToc.vue");
const talk = await read("../../../apps/web/app/components/DocumentTalk.vue");
const tree = await read("../../../apps/web/app/components/DocumentTree.vue");

describe("the page", () => {
  test("is one panel under one title", () => {
    expect(page.match(/<UDashboardPanel/g)).toHaveLength(1);
    expect(page.match(/<UDashboardNavbar/g)).toHaveLength(1);
  });

  test("stands the document alone with the list rising from the bottom on a narrow screen, and between library boundaries otherwise", () => {
    expect(page).toContain('<div v-if="narrow"');
    expect(page).not.toContain("<UTabs");
    expect(page).toContain('<UDrawer v-model:open="listDrawer"');
    expect(page).toContain('<UDrawer v-model:open="tocDrawer"');
    expect(page).toContain('id="documents-splitter"');
    expect(page).toContain('auto-save-id="bmo-documents-splitter"');
    expect(page).toContain('{ slot: "list", minSize: 14, defaultSize: 22, collapsible: true, collapsedSize: 0 }');
    expect(page).toContain('{ slot: "toc", minSize: 12, defaultSize: 20, collapsible: true, collapsedSize: 0 }');
    expect(page).not.toContain("pointermove");
  });

  test("keeps the open document, its language and its heading in the address", () => {
    expect(page).toContain("route.query.root");
    expect(page).toContain("route.query.path");
    expect(page).toContain('route.query.lang === "translated"');
    expect(page).toContain("route.hash");
  });

  test("keeps the translation toggle across documents and visits, and shows only a spinner while parts wait", () => {
    expect(page).not.toContain("lang: false");
    expect(page).toContain('window.localStorage.setItem(LANGUAGE_KEY, toTranslated ? "1" : "0")');
    expect(page).toContain("go(standing, { lang: rememberedLanguage() })");
    expect(pane).not.toContain("progressText");
    expect(pane).toContain('icon="i-material-symbols-progress-activity"');
  });

  test("says beside the failed parts' count what the translator said of them, each sentence once", () => {
    expect(pane).toContain('v-for="said in failureSentences"');
    expect(pane).toContain("new Set(");
    expect(pane).toContain("part.failure");
  });

  test("offers the translation only where a translator is served, and says why it is not", () => {
    expect(page).toContain('route.query.lang === "translated" && list.value?.translation === true');
    expect(pane).toContain(':disabled="!props.translatable"');
    expect(pane).toContain("documents.message.translation_unavailable");
  });

  test("stands a root another unit keeps as unread", () => {
    expect(tree).toContain("documents.label.root_unread");
    expect(tree).toContain("documents.message.root_unread");
  });

  test("does not offer the split on a narrow screen", () => {
    expect(page).toContain('narrow.value && chosenView.value === "split" ? "rendered"');
    expect(pane).toContain('!props.narrow || one.value !== "split"');
  });

  test("is reached from the sidebar beside the archive", () => {
    const searchesAt = SCREENS.findIndex((screen) => screen.to === "/archive");
    const viewerAt = SCREENS.findIndex((screen) => screen.label === "screens.label.documents" && screen.to === "/documents");

    expect(viewerAt).toBeGreaterThan(searchesAt);
    expect(searchesAt).toBeGreaterThan(-1);
  });
});

describe("the reader", () => {
  test("draws with the console's renderer as a book and shows the source in the console's editor", () => {
    expect(reader).toContain('kind="book"');
    expect(reader).toContain("<MarkdownText");
    expect(reader).toContain('import("bmo-ui/app/domain/monaco")');
    expect(reader).toContain("openSourceView");
  });

  test("keeps both panes mounted and folds one away rather than taking it down", () => {
    expect(reader).toContain("<USplitter");
    expect(reader).toContain("collapsible: true, collapsedSize: 0");
    expect(reader).toContain(':disabled="props.view !== \'split\'"');
    expect(reader).not.toMatch(/v-if="[^"]*view/);
  });

  test("never sends a scroll it made itself back to where it came from", () => {
    expect(reader).toContain("settling.rendered");
    expect(reader).toContain("settling.source");
  });

  test("puts a selection to the chat agent only through the page", () => {
    expect(reader).toContain('emit("ask", picked.value)');
    expect(reader).not.toContain("$fetch");
  });
});

describe("the contents list", () => {
  test("marks the heading being read by more than colour", () => {
    expect(toc).toContain("aria-current");
    expect(toc).toContain("font-semibold");
    expect(toc).toContain("border-primary");
  });

});

describe("the talk", () => {
  test("reads back when the console says this document's talk moved", () => {
    expect(talk).toContain('on: ["document-talk"]');
    expect(talk).toContain("event.document === documentName.value");
  });

  test("keeps words the console refused in the box", () => {
    const failed = talk.indexOf("sendFailure.value = failureText");
    const cleared = talk.indexOf('text.value = ""');

    expect(cleared).toBeGreaterThan(-1);
    expect(cleared).toBeLessThan(failed);
  });
});
