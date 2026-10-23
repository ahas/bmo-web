<template>
  <!-- The document in one or two panes. Both panes are always mounted and a view that shows one
       folds the other away, so moving between views keeps the editor, the drawn text and the place
       being read. The boundary is the component library's own and only moves in the split view. -->
  <div class="relative flex min-h-0 min-w-0 flex-1 flex-col" :aria-busy="!drawn || (showsSource && !editorReady)">
    <USplitter
      ref="splitter"
      :id="`document-reader-${props.idSuffix}`"
      auto-save-id="bmo-document-reader"
      :items="PANES"
      :disabled="props.view !== 'split'"
      :ui="{ handle: props.view === 'split' ? SPLIT_HANDLE : 'hidden' }"
      class="min-h-0 flex-1"
      @layout="onLayout"
    >
      <template #source>
        <!-- A folded pane is out of reach as well as out of sight. -->
        <div class="flex min-h-0 min-w-0 flex-1 flex-col" :inert="props.view === 'rendered'">
          <p v-if="editorFailed !== ''" class="p-4 text-sm text-error">{{ editorFailed }}</p>
          <ContentSkeleton v-else-if="!editorReady" class="p-4" :label="$t('documents.status.opening')">
            <SkeletonText :lines="8" size="sm" lastWidth="w-1/3" />
          </ContentSkeleton>
          <div
            v-show="editorReady"
            ref="box"
            role="region"
            :aria-label="$t('documents.label.view_source')"
            class="min-h-0 min-w-0 flex-1 overflow-hidden"
          />
        </div>
      </template>

      <template #rendered>
        <div
          ref="pane"
          :inert="props.view === 'source'"
          role="region"
          :aria-label="$t('common.label.rendered')"
          tabindex="0"
          class="relative min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4 focus-inset sm:px-6"
          @scroll.passive="onRenderedScroll"
          @click="onRenderedClick"
          @pointerup="noteSelection"
          @keyup="noteSelection"
        >
          <MarkdownText
            :text="props.text"
            kind="book"
            class="mx-auto max-w-3xl"
            @rendered="onRendered"
          />
        </div>
      </template>
    </USplitter>

    <!-- A selection in either pane can be asked about. The button stands beside where the
         selection ends and goes away with it. -->
    <UButton
      v-if="picked !== null"
      class="fixed z-50 shadow-md"
      :style="{ top: `${pickedTop}px`, left: `${pickedLeft}px` }"
      size="sm"
      color="primary"
      icon="i-material-symbols-contact-support-outline"
      :label="askLabel"
      @pointerdown.prevent
      @click="askPicked"
    />
  </div>
</template>

<script setup lang="ts">
import { SPLIT_HANDLE } from "bmo-ui/app/domain/side-parts";
import {
  currentHeading,
  headingAtLine,
  inRanges,
  linkedDocument,
  mapScroll,
  scrollAnchors
} from "~/domain/documents";
import { failureText } from "bmo-ui/app/domain/errors";
import { bmoLabel } from "~/domain/agents";

import type { ReaderView, ViewerHeading } from "~/domain/documents";
import type { SourceSelection, SourceView } from "bmo-ui/app/domain/monaco";
import type { SplitterItem } from "@nuxt/ui";

// One document read in the document viewer: the source in a read-only editor, the text drawn by
// the console's renderer, or both side by side. The two panes follow each other line by line, the
// heading being read is reported as the reader scrolls, and a selection in either can be put to
// the chat agent. What the text is — the original or a translation still arriving — is the caller's.

interface Range {
  from: number;
  to: number;
}

interface Props {
  text: string;
  headings: readonly ViewerHeading[];
  view: ReaderView;
  // The lines of a translation still standing in the original, and of parts that could not be
  // translated.
  waiting?: readonly Range[];
  untranslated?: readonly Range[];
  // The slugs of an index's pieces and the documents they name.
  pieces?: ReadonlyMap<string, string>;
  // The path of the document being read, for the links inside it.
  path: string;
  idSuffix?: string;
}

const { t } = useI18n();
// What asking about a selection is called: asking the chat agent, by the label it goes by.
const askLabel = computed(() => t("documents.action.ask_agent", { agent: bmoLabel(t) }));
const props = withDefaults(defineProps<Props>(), {
  waiting: () => [],
  untranslated: () => [],
  pieces: () => new Map(),
  idSuffix: "main"
});

const emit = defineEmits<{
  active: [slug: string | null];
  ask: [passage: { text: string; heading: string | null }];
  open: [target: { path: string; hash: string | null }];
  ready: [];
}>();

// Both panes can fold to nothing; which one is folded is the view's.
const PANES: SplitterItem[] = [
  { slot: "source", minSize: 20, defaultSize: 50, collapsible: true, collapsedSize: 0, class: "overflow-hidden" },
  { slot: "rendered", minSize: 20, defaultSize: 50, collapsible: true, collapsedSize: 0, class: "overflow-hidden" }
];

const splitter = useTemplateRef<{ panelsRef: Array<{ collapse: () => void; expand: () => void; isCollapsed: boolean }> }>("splitter");
const box = useTemplateRef<HTMLElement>("box");
const pane = useTemplateRef<HTMLElement>("pane");
const colorMode = useColorMode();

const editorReady = ref(false);
const editorFailed = ref("");
const drawn = ref(false);
let source: SourceView | null = null;

const showsSource = computed(() => props.view !== "rendered");
const showsRendered = computed(() => props.view !== "source");

// What the drawn text is made of: each top-level block with the source line it starts on, and each
// heading element with its mark.
let blocks: Array<{ line: number; element: HTMLElement }> = [];
let headingElements: Array<{ slug: string; element: HTMLElement }> = [];

// A scroll this component made in a pane, so the pane's answering scroll event is not taken for the
// reader's own and sent back.
const settling: { source: number | null; rendered: number | null } = { source: null, rendered: null };

function renderedEnd(): number {
  return pane.value === null ? 0 : Math.max(0, pane.value.scrollHeight - pane.value.clientHeight);
}

function blockTop(element: HTMLElement): number {
  return element.offsetTop;
}

function anchorsFromRendered() {
  if (source === null) {
    return [];
  }

  const view = source;

  return scrollAnchors(
    blocks.map((block) => ({ from: blockTop(block.element), to: view.lineTop(block.line) })),
    { from: renderedEnd(), to: view.scrollHeight() }
  );
}

function anchorsFromSource() {
  if (source === null) {
    return [];
  }

  const view = source;

  return scrollAnchors(
    blocks.map((block) => ({ from: view.lineTop(block.line), to: blockTop(block.element) })),
    { from: view.scrollHeight(), to: renderedEnd() }
  );
}

function settleSource(top: number): void {
  if (source === null) {
    return;
  }

  const rounded = Math.round(top);

  if (Math.abs(source.scrollTop() - rounded) < 1) {
    return;
  }

  settling.source = rounded;
  source.setScrollTop(rounded);
}

function settleRendered(top: number): void {
  if (pane.value === null) {
    return;
  }

  const rounded = Math.round(top);

  if (Math.abs(pane.value.scrollTop - rounded) < 1) {
    return;
  }

  settling.rendered = rounded;
  pane.value.scrollTop = rounded;
}

// The heading being read, from whichever pane is on the screen — the drawn text where it stands.
function reportActive(): void {
  if (showsRendered.value && pane.value !== null && headingElements.length > 0) {
    emit(
      "active",
      currentHeading(
        headingElements.map((heading) => ({ slug: heading.slug, top: blockTop(heading.element) })),
        pane.value.scrollTop
      )
    );

    return;
  }

  if (source !== null) {
    emit("active", headingAtLine(props.headings, source.topLine())?.slug ?? props.headings[0]?.slug ?? null);
  }
}

function onRenderedScroll(): void {
  const top = pane.value?.scrollTop ?? 0;

  if (settling.rendered !== null && Math.abs(top - settling.rendered) <= 2) {
    settling.rendered = null;
    reportActive();

    return;
  }

  settling.rendered = null;

  if (props.view === "split") {
    settleSource(mapScroll(anchorsFromRendered(), top));
  }

  reportActive();
}

function onSourceScroll(top: number): void {
  if (settling.source !== null && Math.abs(top - settling.source) <= 2) {
    settling.source = null;
    reportActive();

    return;
  }

  settling.source = null;

  if (props.view === "split") {
    settleRendered(mapScroll(anchorsFromSource(), top));
  }

  reportActive();
}

// The place being read as a source line, with how far into it: what a change of view or of text
// hands over.
function position(): number {
  if (showsRendered.value && pane.value !== null && blocks.length > 0 && source !== null) {
    const top = mapScroll(anchorsFromRendered(), pane.value.scrollTop);

    return lineAtOffset(top);
  }

  return source === null ? 1 : lineAtOffset(source.scrollTop());
}

function lineAtOffset(top: number): number {
  if (source === null) {
    return 1;
  }

  const count = source.lineCount();
  let low = 1;
  let high = Math.max(1, count);

  while (low < high) {
    const middle = Math.ceil((low + high) / 2);

    if (source.lineTop(middle) <= top) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  const start = source.lineTop(low);
  const end = low < count ? source.lineTop(low + 1) : start;

  return low + (end > start ? (top - start) / (end - start) : 0);
}

function restore(line: number): void {
  if (source === null) {
    return;
  }

  const whole = Math.floor(line);
  const start = source.lineTop(whole);
  const end = source.lineTop(whole + 1);
  const top = start + (line - whole) * (end - start);

  source.setScrollTop(top);

  if (showsRendered.value) {
    settleRendered(mapScroll(anchorsFromSource(), top));
  }

  reportActive();
}

// Going to a heading: the drawn text leads where it stands, and the source follows it.
function goTo(slug: string): void {
  const heading = props.headings.find((one) => one.slug === slug);

  if (heading === undefined) {
    return;
  }

  const element = headingElements.find((one) => one.slug === slug)?.element;

  if (showsRendered.value && pane.value !== null && element !== undefined) {
    pane.value.scrollTop = blockTop(element);
  } else {
    source?.revealLine(heading.line);
  }

  emit("active", slug);
}

// Going to a source line, as a search match asks.
function goToLine(line: number): void {
  restore(line);
}

// The drawn text is on the page: read its blocks, mark what a translation left in the original,
// and turn an index's slugs into links to the pieces.
function onRendered(element: HTMLElement): void {
  blocks = [];
  headingElements = [];

  for (const child of Array.from(element.children) as HTMLElement[]) {
    const line = Number(child.dataset.line);

    if (!Number.isInteger(line)) {
      continue;
    }

    blocks.push({ line, element: child });

    if (inRanges(props.waiting, line)) {
      child.dataset.waiting = "";
    } else if (inRanges(props.untranslated, line)) {
      child.dataset.untranslated = "";
    }

    if (child.dataset.heading !== undefined) {
      headingElements.push({ slug: child.dataset.heading, element: child });
    }
  }

  if (props.pieces.size > 0) {
    linkPieces(element);
  }

  drawn.value = true;
  emit("ready");
  reportActive();
}

function linkPieces(element: HTMLElement): void {
  for (const item of Array.from(element.querySelectorAll("li"))) {
    const first = item.firstChild;

    if (first === null || first.nodeType !== Node.TEXT_NODE) {
      continue;
    }

    const text = first.textContent ?? "";
    const slug = /^\s*([A-Za-z0-9-]+)/.exec(text)?.[1];
    const path = slug === undefined ? undefined : props.pieces.get(slug);

    if (slug === undefined || path === undefined) {
      continue;
    }

    const at = text.indexOf(slug);
    const link = document.createElement("a");

    link.textContent = slug;
    link.href = `#${slug}`;
    link.dataset.documentLink = path;
    item.insertBefore(document.createTextNode(text.slice(0, at)), first);
    item.insertBefore(link, first);
    first.textContent = text.slice(at + slug.length);
  }
}

// A link to another document of this root opens it here; any other link keeps its own way.
function onRenderedClick(event: MouseEvent): void {
  const link = (event.target as HTMLElement | null)?.closest("a");

  if (link === null || link === undefined) {
    return;
  }

  const piece = link.dataset.documentLink;

  if (piece !== undefined) {
    event.preventDefault();
    emit("open", { path: piece, hash: null });

    return;
  }

  const target = linkedDocument(props.path, link.getAttribute("href") ?? "");

  if (target !== null) {
    event.preventDefault();
    emit("open", target);
  }
}

// What is selected, and where the button to ask about it stands.
const picked = ref<{ text: string; heading: string | null } | null>(null);
const pickedTop = ref(0);
const pickedLeft = ref(0);

function place(rect: { top: number; left: number; height: number }): void {
  pickedTop.value = Math.min(window.innerHeight - 48, rect.top + rect.height + 6);
  pickedLeft.value = Math.max(8, Math.min(window.innerWidth - 150, rect.left));
}

function noteSelection(): void {
  const selection = window.getSelection();

  if (selection === null || selection.isCollapsed || pane.value === null || !pane.value.contains(selection.anchorNode)) {
    picked.value = null;

    return;
  }

  const text = selection.toString();

  if (text.trim() === "") {
    picked.value = null;

    return;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const startBlock = blocks.findLast((block) => block.element.contains(range.startContainer) || block.element === range.startContainer);

  picked.value = {
    text,
    heading: startBlock === undefined ? null : (headingAtLine(props.headings, startBlock.line)?.text ?? null)
  };
  place({ top: rect.top, left: rect.left, height: rect.height });
}

function onSourceSelection(selection: SourceSelection | null): void {
  if (selection === null) {
    picked.value = null;

    return;
  }

  picked.value = { text: selection.text, heading: headingAtLine(props.headings, selection.startLine)?.text ?? null };
  place(selection.rect);
}

function askPicked(): void {
  if (picked.value === null) {
    return;
  }

  emit("ask", picked.value);
  picked.value = null;
  window.getSelection()?.removeAllRanges();
}

function onSelectionChange(): void {
  const selection = window.getSelection();

  if (picked.value !== null && (selection === null || selection.isCollapsed) && document.activeElement?.closest?.(".monaco-editor") == null) {
    picked.value = null;
  }
}

// The view decides which pane is folded. The place being read is handed over, so a change of view
// never loses it.
async function applyView(): Promise<void> {
  const panels = splitter.value?.panelsRef ?? [];
  const [sourcePanel, renderedPanel] = panels;

  if (sourcePanel === undefined || renderedPanel === undefined) {
    return;
  }

  const line = position();

  source?.wrap(props.view !== "rendered");

  if (props.view === "rendered") {
    renderedPanel.expand();
    sourcePanel.collapse();
  } else if (props.view === "source") {
    sourcePanel.expand();
    renderedPanel.collapse();
  } else {
    sourcePanel.expand();
    renderedPanel.expand();
  }

  await nextTick();
  requestAnimationFrame(() => restore(line));
}

// The splitter lays its panes out once after mounting, and only from then can a pane be folded. The view is
// applied at that first layout, so the drawn text stands at its full width while the editor is still loading;
// once the editor is there, the view is applied again to hand the place over.
let laidOut = false;

function onLayout(): void {
  picked.value = null;

  if (!laidOut) {
    laidOut = true;
    void applyView();
  }
}

watch(() => props.view, () => void applyView());

// A new text — another document, or the other language — goes into the editor at once; the drawn
// text arrives by itself and says so.
watch(
  () => props.text,
  () => {
    drawn.value = false;
    picked.value = null;
    source?.show(props.text);
  }
);

watch(
  () => colorMode.value,
  (mode) => source?.paint(mode === "dark")
);

async function prepareEditor(): Promise<void> {
  try {
    const { openSourceView } = await import("bmo-ui/app/domain/monaco");

    if (box.value === null) {
      return;
    }

    source = openSourceView(box.value, colorMode.value === "dark");
    source.onScroll(onSourceScroll);
    source.onSelection(onSourceSelection);
    source.wrap(props.view !== "rendered");
    source.show(props.text);
    editorReady.value = true;
  } catch (error) {
    editorFailed.value = failureText(error, t("documents.error.editor_failed"));
  }
}

onMounted(async () => {
  document.addEventListener("selectionchange", onSelectionChange);
  await prepareEditor();
  await applyView();
});

onBeforeUnmount(() => {
  document.removeEventListener("selectionchange", onSelectionChange);
  source?.close();
  source = null;
});

defineExpose({ goTo, goToLine, position, restore });
</script>
