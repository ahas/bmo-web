<template>
  <!-- Every document by branch, with a search over names, titles and bodies above it. While a
       search stands the tree shows only what it found, unfolded, and a body match stands under its
       document as the line it was found on. -->
  <div class="flex min-h-0 flex-col">
    <!-- The search takes the panel's padding; the tree below reaches the panel's edges and lines its
         rows up with the search's text by its own padding. -->
    <div class="flex shrink-0 flex-col gap-2 p-3">
    <UInput
      v-model="query"
      size="sm"
      icon="i-material-symbols-search"
      :loading="searching"
      :placeholder="$t('common.action.find')"
      :aria-label="$t('documents.placeholder.find')"
      class="w-full"
      :ui="{ trailing: 'pe-1' }"
    >
      <template v-if="query !== ''" #trailing>
        <UTooltip :text="$t('common.action.clear_search')">
          <UButton size="sm" color="neutral" variant="link" icon="i-material-symbols-close" :aria-label="$t('common.action.clear_search')" @click="query = ''" />
        </UTooltip>
      </template>
    </UInput>

    <p v-if="searchFailure !== ''" class="text-sm text-error" role="alert">{{ searchFailure }}</p>
    <p v-else-if="matches !== null && tree.length === 0" class="text-sm text-muted" role="status">
      {{ $t("documents.status.no_documents_found") }}
    </p>
    <p v-else-if="matches !== null" class="text-sm tabular-nums text-muted" role="status">
      {{ $t("documents.status.documents_found", { n: countText(matchedDocuments) }) }}
    </p>
    </div>

    <UTree
      v-model:expanded="expanded"
      :items="tree"
      :get-key="(item) => item.value"
      size="sm"
      color="primary"
      :model-value="selectedItem"
      class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-3"
      :ui="{ linkLabel: 'min-w-0 truncate' }"
      :aria-label="$t('documents.aria.document_list')"
      @select="onSelect"
    >
      <template #item-leading="{ item, expanded: open }">
        <UIcon
          :name="(item as DocumentTreeItem).value.startsWith('root:') ? folderIcon((item as DocumentTreeItem).value.slice(5), open) : (item as DocumentTreeItem).icon!"
          class="size-4 shrink-0"
        />
      </template>

      <!-- A title, and a state where the row has one. A list that chooses what the body shows
           carries no counter beside its names; a fragment's counts are in its properties. A name
           the panel's width cuts short reads whole in a tooltip; a tap opens the row, so a finger
           rests on it to read it. -->
      <template #item-label="{ item }">
        <span class="flex min-w-0 flex-1 items-center gap-2">
          <HintTip
            :text="(item as DocumentTreeItem).label"
            cut
            press
            class="min-w-0 flex-1 truncate text-start"
            :class="[
              (item as DocumentTreeItem).document === undefined ? 'font-medium' : '',
              isDown(item as DocumentTreeItem) ? 'text-muted' : ''
            ]"
          >
            <SearchText :text="(item as DocumentTreeItem).label" :query="found" />
          </HintTip>
          <UTooltip v-if="(item as DocumentTreeItem).unread !== undefined" :text="(item as DocumentTreeItem).unread">
            <span class="shrink-0 text-xs text-muted">{{ $t("documents.label.root_unread") }}</span>
          </UTooltip>
          <UTooltip v-if="isDown(item as DocumentTreeItem)" :text="$t('documents.aria.pulled_fragments')">
            <UIcon name="i-material-symbols-do-not-disturb-on-outline" role="img" :aria-label="$t('documents.aria.pulled_fragments')" class="size-4 shrink-0 text-muted" />
          </UTooltip>
        </span>
      </template>
    </UTree>

    <!-- The lines a search found, each opening its document at that line. They stand apart from
         the tree so every one of them is a button of its own. -->
    <ul v-if="bodyMatches.length > 0" class="flex max-h-[40%] shrink-0 flex-col gap-1 overflow-y-auto border-t border-default px-1 py-2" :aria-label="$t('documents.aria.body_hits')">
      <li v-for="match in bodyMatches" :key="`${match.root}/${match.path}:${match.line}`">
        <button
          type="button"
          class="block w-full rounded-sm px-2 py-2 text-start transition-colors hover:bg-elevated active:bg-accented focus-inset"
          @click="emit('open', { root: match.root, path: match.path, line: match.line })"
        >
          <span class="block truncate text-sm text-muted">{{ $t("documents.label.hit_place", { title: match.title, line: match.line }) }}</span>
          <SearchText class="block text-sm break-words text-default" :text="match.snippet ?? ''" :query="found" />
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { branchesOf, branchValues, documentKey, documentTree } from "~/domain/documents";
import { failureText } from "bmo-ui/app/domain/errors";
import { folderIcon } from "bmo-ui/app/domain/file-icons";
import { countText } from "~/domain/numbers";

import type { DocumentTreeItem } from "~/domain/documents";
import type { DocumentList, DocumentMatch } from "#shared/types";

// The document viewer's list. The tree is made of what the list read holds; a search asks the
// server, since it reads the bodies, and the tree then stands only what it found.

interface Props {
  list: DocumentList;
  selected: { root: string; path: string } | null;
}

const { t } = useI18n();
const props = defineProps<Props>();
const emit = defineEmits<{ open: [target: { root: string; path: string; line: number | null }] }>();

const query = ref("");
const matches = ref<DocumentMatch[] | null>(null);
// The words the standing matches were found with, which is what their marks are drawn from.
const found = ref("");
const searching = ref(false);
const searchFailure = ref("");
const expanded = ref<string[]>([]);
let asked = 0;
let waiting: ReturnType<typeof setTimeout> | null = null;

const tree = computed(() => documentTree(props.list, matches.value));
const bodyMatches = computed(() => (matches.value ?? []).filter((match) => match.where === "body"));
const matchedDocuments = computed(() => new Set((matches.value ?? []).map((match) => documentKey(match.root, match.path))).size);

const selectedValue = computed(() => (props.selected === null ? null : `doc:${documentKey(props.selected.root, props.selected.path)}`));

// A reference fragment its gate is no longer offered. Nothing marks one that is offered, and a
// document that is no fragment is not a fragment switched off (`docs/documents-viewer.md`).
function isDown(item: DocumentTreeItem): boolean {
  return item.document?.fragment?.active === false;
}

function findItem(items: readonly DocumentTreeItem[], value: string | null): DocumentTreeItem | undefined {
  for (const item of items) {
    if (item.value === value) {
      return item;
    }

    const below = item.children === undefined ? undefined : findItem(item.children, value);

    if (below !== undefined) {
      return below;
    }
  }

  return undefined;
}

const selectedItem = computed(() => findItem(tree.value, selectedValue.value));

function onSelect(event: { preventDefault: () => void }, item: DocumentTreeItem): void {
  if (item.document === undefined) {
    return;
  }

  // The tree marks what is open from the address, not from the press.
  event.preventDefault();
  emit("open", { root: item.document.root, path: item.document.path, line: null });
}

async function search(words: string): Promise<void> {
  const mine = ++asked;

  searching.value = true;
  searchFailure.value = "";

  try {
    const hits = await $fetch<DocumentMatch[]>("/api/documents/search", { query: { q: words } });

    if (mine === asked) {
      matches.value = hits;
      found.value = words;
      expanded.value = branchValues(documentTree(props.list, hits));
    }
  } catch (error) {
    if (mine === asked) {
      searchFailure.value = failureText(error, t("documents.error.search_failed"));
    }
  } finally {
    if (mine === asked) {
      searching.value = false;
    }
  }
}

// Every keystroke would read every body on the server, so the search waits for typing to stop.
watch(query, (words) => {
  if (waiting !== null) {
    clearTimeout(waiting);
  }

  if (words.trim() === "") {
    asked++;
    matches.value = null;
    found.value = "";
    searching.value = false;
    searchFailure.value = "";
    expanded.value = selectedValue.value === null ? [] : branchesOf(tree.value, selectedValue.value);

    return;
  }

  waiting = setTimeout(() => void search(words.trim()), 300);
});

// The document opened from anywhere — an address, a link, a seek — is unfolded to in the tree.
watch(
  [selectedValue, () => props.list],
  ([value]) => {
    if (value === null || matches.value !== null) {
      return;
    }

    expanded.value = [...new Set([...expanded.value, ...branchesOf(tree.value, value)])];
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  if (waiting !== null) {
    clearTimeout(waiting);
  }
});
</script>
