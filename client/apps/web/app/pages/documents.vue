<template>
  <!-- One screen in three parts: the list, the document, and its table of contents with the
       question box. Where there is room they stand side by side with boundaries the component
       library draws, and the two at the sides fold away; where there is not, the document stands
       alone and the other two rise from the bottom edge. -->
  <UDashboardPanel id="documents" :ui="{ body: 'p-0 sm:p-0 gap-0 sm:gap-0 overflow-y-hidden [&>*]:max-w-none' }">
    <template #header>
      <UDashboardNavbar :title="$t('screens.label.documents')" icon="i-material-symbols-library-books-outline">
        <template #right>
          <DeployMark />
          <TodoOpenButton />
          <UsageMeters />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p v-if="listFailure !== ''" role="alert" class="p-4 text-sm text-error">{{ listFailure }}</p>

      <div v-if="narrow" class="flex min-h-0 flex-1 flex-col">
        <DocumentPane
          ref="pane"
          :selected="selected"
          :document="current"
          :failure="documentFailure"
          :text="shownText"
          :headings="headings"
          :view="view"
          :narrow="narrow"
          :translated="translated"
          :translatable="list?.translation === true"
          :translation="translation"
          :translation-failure="translationFailure"
          :asking="translationAsking"
          :waiting="composed?.waiting ?? []"
          :untranslated="composed?.failed ?? []"
          :pieces="pieces"
          :tabs="docTabs"
          :list-tool="listTool"
          :toc-tool="tocTool"
          :tools="tools"
          @tab="switchDocument"
          @close-tabs="closeDocuments"
          @move-tab="moveDocument"
          @pin-tab="pinDocument"
          @retry="loadDocument"
          @view="setView"
          @language="setLanguage"
          @translate="askTranslation"
          @talk="talkOpen = true"
          @active="active = $event"
          @ask="onAsk"
          @open="onOpenLink"
          @ready="onReady"
        />

        <!-- The list, up from the bottom edge on a phone: it only chooses what the body shows. -->
        <UDrawer v-model:open="listDrawer" :title="$t('documents.action.list')" :ui="FULL_SHEET">
          <template #body>
            <ContentSkeleton v-if="list === null" class="p-3" :rows="10" listClass="flex flex-col" :label="$t('documents.status.list_loading')">
              <template #default="{ index }">
            <div class="flex h-8 items-center gap-2 px-2">
              <SkeletonBar class="size-4 shrink-0 rounded-sm" />
              <SkeletonBar class="h-4" :class="index % 3 === 0 ? 'w-2/3' : index % 3 === 1 ? 'w-1/2' : 'w-3/5'" />
            </div>
              </template>
            </ContentSkeleton>
            <DocumentTree v-else class="min-h-0 flex-1" :list="list" :selected="selected" @open="openFromList" />
          </template>
        </UDrawer>

        <!-- The contents and the question box, up from the bottom edge on a phone. -->
        <UDrawer v-model:open="tocDrawer" :title="$t('common.label.toc')" :ui="FULL_SHEET">
          <template #body>
            <DocumentSide
              :selected="selected"
              :opened="current !== null"
              :headings="headings"
              :active="active"
              :heading-text="headingText"
              @go="goToPick"
              @select="goToHeading"
            />
          </template>
        </UDrawer>
      </div>

      <USplitter
        v-else
        ref="sides"
        id="documents-splitter"
        auto-save-id="bmo-documents-splitter"
        :items="SIDES"
        :ui="{ handle: SPLIT_HANDLE }"
        class="min-h-0 flex-1"
        @collapse="onSideFold($event, false)"
        @expand="onSideFold($event, true)"
      >
        <template #list>
          <div class="flex min-h-0 min-w-0 flex-1 flex-col">
            <ContentSkeleton v-if="list === null" class="p-3" :rows="12" listClass="flex flex-col" :label="$t('documents.status.list_loading')">
              <template #default="{ index }">
            <div class="flex h-8 items-center gap-2 px-2">
              <SkeletonBar class="size-4 shrink-0 rounded-sm" />
              <SkeletonBar class="h-4" :class="index % 3 === 0 ? 'w-2/3' : index % 3 === 1 ? 'w-1/2' : 'w-3/5'" />
            </div>
              </template>
            </ContentSkeleton>
            <DocumentTree v-else class="min-h-0 flex-1" :list="list" :selected="selected" @open="openFromList" />
          </div>
        </template>

        <template #document>
          <div class="flex min-h-0 min-w-0 flex-1 flex-col">
            <DocumentPane
              ref="pane"
              :selected="selected"
              :document="current"
              :failure="documentFailure"
              :text="shownText"
              :headings="headings"
              :view="view"
              :narrow="narrow"
              :translated="translated"
              :translatable="list?.translation === true"
              :translation="translation"
              :translation-failure="translationFailure"
              :asking="translationAsking"
              :waiting="composed?.waiting ?? []"
              :untranslated="composed?.failed ?? []"
              :pieces="pieces"
              :tabs="docTabs"
              :list-tool="listTool"
              :toc-tool="tocTool"
              :tools="tools"
              @tab="switchDocument"
              @close-tabs="closeDocuments"
              @move-tab="moveDocument"
              @pin-tab="pinDocument"
              @retry="loadDocument"
              @view="setView"
              @language="setLanguage"
              @translate="askTranslation"
              @talk="talkOpen = true"
              @active="active = $event"
              @ask="onAsk"
              @open="onOpenLink"
              @ready="onReady"
            />
          </div>
        </template>

        <template #toc>
          <div class="flex min-h-0 min-w-0 flex-1 flex-col">
            <DocumentSide
              :selected="selected"
              :opened="current !== null"
              :headings="headings"
              :active="active"
              :heading-text="headingText"
              @go="goToPick"
              @select="goToHeading"
            />
          </div>
        </template>
      </USplitter>

      <DocumentTalk
        v-model:open="talkOpen"
        v-model:quote="quote"
        :document="selected"
        :title="current?.title ?? ''"
        @jump="jumpToHeadingText"
      />
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { DOCUMENT_VIEW } from "#shared/config";
import {
  composeTranslation,
  documentKey,
  headingByText,
  headingsOf,
  indexLinks,
  isReaderView,
  readKeptDocumentTabs
} from "~/domain/documents";
import { failureText } from "bmo-ui/app/domain/errors";
import { useLiveRefresh } from "~/domain/events";
import { useIsland } from "bmo-ui/app/domain/island";
import { FULL_SHEET, SPLIT_HANDLE } from "bmo-ui/app/domain/side-parts";
import { useNarrow } from "bmo-ui/app/domain/screen";
import { useKeptTabs } from "~/domain/tab-state";
import { fileTabLabel, lastSeen, mergeTabs, moveTab, openInTabs, pinTab } from "bmo-ui/app/domain/tabs";

import type { KeptDocumentTabs, OpenDocument, ReaderView } from "~/domain/documents";
import type { BarAction, BarTab } from "bmo-ui/app/domain/tabs";
import type { DocumentList, DocumentSeekPick, DocumentTranslation, DocumentView } from "#shared/types";
import type { SplitterItem } from "@nuxt/ui";

// The document viewer (docs/web.md, 「Document viewer screen」; docs/documents-viewer.md). Which document is
// open, in which language and at which heading lives in the address, so a place can be handed on;
// which view it is read in and how wide the parts are belong to this browser.

const SIDES: SplitterItem[] = [
  { slot: "list", minSize: 14, defaultSize: 22, collapsible: true, collapsedSize: 0 },
  { slot: "document", minSize: 35, defaultSize: 58 },
  { slot: "toc", minSize: 12, defaultSize: 20, collapsible: true, collapsedSize: 0 }
];

const VIEW_KEY = "bmo-documents-view";
// Whether documents are read translated, which stands across documents and visits.
const LANGUAGE_KEY = "bmo-documents-translated";

const route = useRoute();
const router = useRouter();
const narrow = useNarrow(`(max-width: ${DOCUMENT_VIEW.tabsMaxPx}px)`);
const { t } = useI18n();
const island = useIsland(t);

const list = ref<DocumentList | null>(null);
const listLoading = ref(false);
const listFailure = ref("");
const current = ref<DocumentView | null>(null);
const documentLoading = ref(false);
const documentFailure = ref("");
const translation = ref<DocumentTranslation | null>(null);
const translationFailure = ref("");
const translationAsking = ref(false);
const chosenView = ref<ReaderView>("rendered");
const active = ref<string | null>(null);
const talkOpen = ref(false);
const quote = ref<{ text: string; heading: string | null; translated: boolean } | null>(null);
const listOpen = ref(true);
// The documents open as tabs, in the order they stand, pinned or not. They are kept for the account
// on the server, with the one standing.
const openDocuments = ref<OpenDocument[]>([]);
const standingKey = ref<string | null>(null);
const tocOpen = ref(true);
const tocDrawer = ref(false);
const listDrawer = ref(false);

// The two side parts, each opened from its own side of the toolbar: folded on a wide screen, a
// sheet from the bottom edge on a phone.
const listTool = computed<BarAction>(() =>
  narrow.value
    ? { id: "list", label: t("documents.action.list"), icon: "i-material-symbols-list-alt-outline", pressed: listDrawer.value, onSelect: () => { listDrawer.value = true; } }
    : {
        id: "list",
        label: listOpen.value ? t("documents.action.list_collapse") : t("documents.action.list_expand"),
        icon: listOpen.value ? "i-material-symbols-left-panel-close-outline" : "i-material-symbols-left-panel-open-outline",
        pressed: listOpen.value,
        onSelect: () => toggleSide(0)
      }
);

const tocTool = computed<BarAction>(() =>
  narrow.value
    ? { id: "toc", label: t("common.label.toc"), icon: "i-material-symbols-toc", onSelect: () => { tocDrawer.value = true; } }
    : {
        id: "toc",
        label: tocOpen.value ? t("documents.action.toc_collapse") : t("documents.action.toc_expand"),
        icon: tocOpen.value ? "i-material-symbols-right-panel-close-outline" : "i-material-symbols-right-panel-open-outline",
        pressed: tocOpen.value,
        onSelect: () => toggleSide(2)
      }
);

// What the screen offers beside the document's own actions: a fresh read.
const tools = computed<BarAction[]>(() => [
  { id: "reread", label: t("common.action.refresh"), icon: "i-material-symbols-refresh", loading: listLoading.value || documentLoading.value, onSelect: () => void reread() }
]);

const reader = useTemplateRef<{ goTo: (slug: string) => void; goToLine: (line: number) => void }>("pane");
const sides = useTemplateRef<{ panelsRef: Array<{ collapse: () => void; expand: () => void; isCollapsed: boolean }> }>("sides");

function queryText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

const selected = computed(() => {
  const root = queryText(route.query.root);
  const path = queryText(route.query.path);

  return root === null || path === null ? null : { root, path };
});

// A document is read translated only where a translator is served; an address asking for it reads the original.
const translated = computed(() => route.query.lang === "translated" && list.value?.translation === true);

// The split is not offered on a narrow screen; a reader who chose it there reads the drawn text.
const view = computed<ReaderView>(() => (narrow.value && chosenView.value === "split" ? "rendered" : chosenView.value));

const composed = computed(() => (translated.value && translation.value !== null ? composeTranslation(translation.value.parts) : null));
const shownText = computed(() => composed.value?.text ?? current.value?.text ?? "");
const headings = computed(() => headingsOf(shownText.value));
const pieces = computed(() =>
  list.value === null || current.value === null ? new Map<string, string>() : indexLinks(list.value.documents, current.value.root, current.value.path)
);

// A document tab says the file's name, as a file tab does: the titles of one person's chunks all
// begin with that person's name, and a row of them cut short would read as one tab many times.
const docTabs = computed<BarTab[]>(() => {
  const paths = openDocuments.value.map((one) => one.path);

  return openDocuments.value.map((one) => {
    const key = documentKey(one.root, one.path);
    const title = list.value?.documents.find((entry) => entry.root === one.root && entry.path === one.path)?.title;

    return { id: key, label: fileTabLabel(paths, one.path), title: title === undefined ? key : `${title}\n${key}`, icon: "i-material-symbols-description-outline", pinned: one.pinned === true };
  });
});

// Where the reader goes once the text is drawn: a heading the address or a question named, a line a
// search found, or the same heading of the other language.
let pending: { slug: string } | { line: number } | { index: number } | null = null;

async function loadList(): Promise<void> {
  listLoading.value = true;
  listFailure.value = "";

  try {
    list.value = await $fetch<DocumentList>("/api/documents");
  } catch (error) {
    listFailure.value = failureText(error, t("documents.error.list_failed"));
  } finally {
    listLoading.value = false;
  }
}

let documentAsked = 0;

async function loadDocument(): Promise<void> {
  const target = selected.value;
  const mine = ++documentAsked;

  translation.value = null;
  translationFailure.value = "";

  if (target === null) {
    current.value = null;
    documentFailure.value = "";

    return;
  }

  documentLoading.value = true;
  documentFailure.value = "";

  try {
    const read = await $fetch<DocumentView>("/api/documents/file", { query: target });

    if (mine !== documentAsked) {
      return;
    }

    current.value = read;

    if (translated.value) {
      await loadTranslation(true);
    }
  } catch (error) {
    if (mine === documentAsked) {
      current.value = null;
      documentFailure.value = failureText(error, t("documents.error.read_failed"));
    }
  } finally {
    if (mine === documentAsked) {
      documentLoading.value = false;
    }
  }
}

let translationAsked = 0;

// Read the translation, and where parts are missing while the translator holds none of them and reports no
// failure, hand them over: that is a first request, a translation a restart cut off, or a new version
// ordered in between, and each carries on from the parts already kept.
async function loadTranslation(order: boolean): Promise<void> {
  const target = selected.value;
  const mine = ++translationAsked;

  if (target === null) {
    return;
  }

  try {
    const read = await $fetch<DocumentTranslation>("/api/documents/translation", { query: target });

    if (mine !== translationAsked) {
      return;
    }

    const missing = read.parts.some((part) => part.text === null && !part.failed);

    translation.value = read;
    // A translation already kept reads without the translator; only what is still missing needs it.
    translationFailure.value = read.pending === null && missing ? t("documents.error.translation_unreachable") : "";

    if (order && missing && read.pending === 0 && read.failure === null && !translationAsking.value) {
      await askTranslation(false);
    }
  } catch (error) {
    if (mine === translationAsked) {
      translationFailure.value = failureText(error, t("documents.error.translation_read_failed"));
    }
  }
}

async function askTranslation(retry: boolean): Promise<void> {
  const target = selected.value;

  if (target === null) {
    return;
  }

  translationAsking.value = true;
  translationFailure.value = "";

  try {
    await $fetch("/api/documents/translation", { method: "POST", body: { ...target, retry } });
    await loadTranslation(false);
  } catch (error) {
    translationFailure.value = failureText(error, t("documents.error.translation_ask_failed"));
  } finally {
    translationAsking.value = false;
  }
}

async function reread(): Promise<void> {
  await Promise.all([loadList(), loadDocument()]);
}

function go(target: { root: string; path: string }, extra: { hash?: string | null; lang?: boolean } = {}): void {
  const lang = extra.lang ?? translated.value;

  void router.push({
    query: { root: target.root, path: target.path, ...(lang ? { lang: "translated" } : {}) },
    hash: extra.hash === null || extra.hash === undefined ? "" : `#${extra.hash}`
  });
}

// On a narrow screen the sheet that chose is put away first, and the reader moved after that.
async function showDocumentTab(): Promise<void> {
  if (listDrawer.value) {
    listDrawer.value = false;
    await nextTick();
  }
}

async function openFromList(target: { root: string; path: string; line: number | null }): Promise<void> {
  const same = selected.value !== null && documentKey(selected.value.root, selected.value.path) === documentKey(target.root, target.path);

  if (target.line !== null) {
    pending = { line: target.line };
  }

  await showDocumentTab();

  if (same) {
    if (target.line !== null) {
      reader.value?.goToLine(target.line);
      pending = null;
    }

    return;
  }

  go(target);
}

async function goToHeading(slug: string): Promise<void> {
  tocDrawer.value = false;
  await showDocumentTab();
  reader.value?.goTo(slug);
  void router.replace({ query: route.query, hash: `#${slug}` });
}

function jumpToHeadingText(text: string | null): void {
  const heading = text === null ? null : headingByText(headings.value, text);

  talkOpen.value = false;

  if (heading !== null) {
    void goToHeading(heading.slug);
  }
}

function goToPick(pick: DocumentSeekPick): void {
  tocDrawer.value = false;
  const here = selected.value !== null && pick.root === selected.value.root && pick.path === selected.value.path;

  if (here) {
    if (pick.heading !== null) {
      void goToHeading(pick.heading);
    }

    return;
  }

  if (pick.heading !== null) {
    pending = { slug: pick.heading };
  }

  void showDocumentTab();

  go(pick, { hash: pick.heading });
}

function headingText(pick: DocumentSeekPick): string | null {
  const here = selected.value !== null && pick.root === selected.value.root && pick.path === selected.value.path;

  return pick.heading === null ? null : here ? (headings.value.find((one) => one.slug === pick.heading)?.text ?? pick.heading) : pick.heading;
}

function rememberedLanguage(): boolean {
  try {
    return window.localStorage.getItem(LANGUAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function setView(next: ReaderView): void {
  chosenView.value = next;

  try {
    window.localStorage.setItem(VIEW_KEY, next);
  } catch {
    // A browser that refuses storage keeps the view for this visit.
  }
}

// Changing language keeps the reader at the same heading, counted in order: a translation keeps
// the number of headings.
function setLanguage(toTranslated: boolean): void {
  if (toTranslated === translated.value || selected.value === null) {
    return;
  }

  const index = headings.value.findIndex((heading) => heading.slug === active.value);

  pending = index < 0 ? null : { index };

  try {
    window.localStorage.setItem(LANGUAGE_KEY, toTranslated ? "1" : "0");
  } catch {
    // A browser that refuses storage keeps the choice in the address for this visit.
  }

  go(selected.value, { lang: toTranslated });
}

function onReady(): void {
  const hash = decodeURIComponent(route.hash.replace(/^#/, ""));

  if (pending === null && hash !== "" && headings.value.some((heading) => heading.slug === hash)) {
    pending = { slug: hash };
  }

  const next = pending;

  pending = null;

  if (next === null) {
    return;
  }

  requestAnimationFrame(() => {
    if ("slug" in next) {
      reader.value?.goTo(next.slug);
    } else if ("line" in next) {
      reader.value?.goToLine(next.line);
    } else {
      const heading = headings.value[next.index];

      if (heading !== undefined) {
        reader.value?.goTo(heading.slug);
      }
    }
  });
}

function onAsk(passage: { text: string; heading: string | null }): void {
  quote.value = { ...passage, translated: translated.value };
  talkOpen.value = true;
}

function onOpenLink(target: { path: string; hash: string | null }): void {
  if (current.value === null) {
    return;
  }

  if (target.hash !== null) {
    pending = { slug: target.hash };
  }

  go({ root: current.value.root, path: target.path }, { hash: target.hash });
}

function tabOf(key: string): { root: string; path: string } | null {
  return openDocuments.value.find((one) => documentKey(one.root, one.path) === key) ?? null;
}

function switchDocument(key: string): void {
  const target = tabOf(key);

  if (target !== null && (selected.value === null || documentKey(selected.value.root, selected.value.path) !== key)) {
    go(target);
  }
}

// Tabs closed from the bar; where the document standing is among them, the one looked at last of
// those left stands instead, and with none left the viewer is back to its empty page.
function closeDocuments(keys: string[]): void {
  const left = openDocuments.value.filter((one) => !keys.includes(documentKey(one.root, one.path)));

  openDocuments.value = left;

  if (selected.value !== null && keys.includes(documentKey(selected.value.root, selected.value.path))) {
    const next = lastSeen(left);

    if (next === null) {
      standingKey.value = null;
      void router.push({ query: {} });
    } else {
      go(next);
    }
  }
}

function moveDocument(from: number, to: number): void {
  openDocuments.value = moveTab(openDocuments.value, from, to, (one) => one.pinned === true);
}

function pinDocument(key: string, on: boolean): void {
  const at = openDocuments.value.findIndex((one) => documentKey(one.root, one.path) === key);

  if (at >= 0) {
    openDocuments.value = pinTab(openDocuments.value, at, on);
  }
}

useKeptTabs<KeptDocumentTabs>("documents", {
  read: () => ({ tabs: openDocuments.value, active: standingKey.value }),
  restore: (value) => {
    const kept = readKeptDocumentTabs(value, DOCUMENT_VIEW.openTabsMax);
    const sameDocument = (one: OpenDocument, other: OpenDocument): boolean => documentKey(one.root, one.path) === documentKey(other.root, other.path);

    openDocuments.value = mergeTabs(kept.tabs, openDocuments.value, sameDocument, DOCUMENT_VIEW.openTabsMax);

    const standing = openDocuments.value.find((one) => documentKey(one.root, one.path) === kept.active);

    if (selected.value === null && standing !== undefined) {
      go(standing, { lang: rememberedLanguage() });
    } else if (selected.value === null) {
      standingKey.value = kept.active;
    }
  }
});

function toggleSide(index: 0 | 2): void {
  const panel = sides.value?.panelsRef[index];

  if (panel === undefined) {
    return;
  }

  if (panel.isCollapsed) {
    panel.expand();
  } else {
    panel.collapse();
  }
}

function onSideFold(index: number, open: boolean): void {
  if (index === 0) {
    listOpen.value = open;
  } else if (index === 2) {
    tocOpen.value = open;
  }
}

watch(
  () => (selected.value === null ? null : documentKey(selected.value.root, selected.value.path)),
  () => {
    active.value = null;
    void loadDocument();
  }
);

// Whatever brings a document up — the list, a search, a link, the address — opens it as a tab.
watch(
  () => (selected.value === null ? null : documentKey(selected.value.root, selected.value.path)),
  (key) => {
    const target = selected.value;

    if (key === null || target === null) {
      return;
    }

    standingKey.value = key;
    openDocuments.value = openInTabs(
      openDocuments.value,
      (one) => documentKey(one.root, one.path) === key,
      { root: target.root, path: target.path, seenAt: Date.now() },
      DOCUMENT_VIEW.openTabsMax
    );
  },
  { immediate: true }
);

watch(translated, (now) => {
  if (now) {
    void loadTranslation(true);
  } else {
    translation.value = null;
    translationFailure.value = "";
  }
});

// A word that a part of this document arrived reads the translation again, and shows it at once.
useLiveRefresh(
  () => {
    if (translated.value) {
      void loadTranslation(true);
    }
  },
  {
    on: ["document-translation"],
    where: (event) =>
      event.type === "document-translation" && selected.value !== null && event.document === documentKey(selected.value.root, selected.value.path)
  }
);

onMounted(async () => {
  try {
    const stored = window.localStorage.getItem(VIEW_KEY);

    if (isReaderView(stored)) {
      chosenView.value = stored;
    }
  } catch {
    // Nothing remembered; the drawn text is the view.
  }

  // An address that names a document but no language opens it in the language last chosen.
  if (selected.value !== null && route.query.lang === undefined && rememberedLanguage()) {
    await router.replace({ query: { ...route.query, lang: "translated" }, hash: route.hash });
  }

  await Promise.all([loadList(), loadDocument()]);
});
</script>
