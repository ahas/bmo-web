<template>
  <!-- The texts the system prompt of the supervisor whose turns its window makes is composed of — its opening, the
       absolute rules and the manual (the agency's docs/api.md, 「chat-documents」) — as a block of its settings form:
       each kept as the owner's own text or put back to its file, every change waiting for the form's one save. -->
  <div class="flex min-w-0 flex-col gap-4">
    <p v-if="failed" role="alert" class="text-sm text-error">{{ $t("agents.error.chat_documents_read_failed") }}</p>
    <ContentSkeleton v-else-if="documents === null" :rows="3" :label="$t('agents.status.chat_documents_loading')">
      <div class="flex flex-col gap-2">
        <SkeletonBar class="h-5 w-40" />
        <SkeletonBar class="h-24 w-full rounded-md" />
      </div>
    </ContentSkeleton>

    <template v-else>
      <div v-for="document in documents" :key="document.name" data-chat-document :data-document="document.name" class="flex flex-col gap-2">
        <div class="flex min-h-8 items-center gap-2">
          <span class="min-w-0 flex-1 break-words text-sm font-medium text-highlighted">{{ documentLabel(document.name) }}</span>
          <UButton
            v-if="shownSource(document) === 'stored'"
            class="shrink-0"
            :label="$t('agents.action.reset_document')"
            size="sm"
            color="neutral"
            variant="ghost"
            :disabled="busy"
            @click="toFile(document)"
          />
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UBadge
            :color="shownSource(document) === 'stored' ? 'primary' : 'neutral'"
            variant="subtle"
            size="sm"
            :label="$t(shownSource(document) === 'stored' ? 'agents.status.chat_document_stored' : 'agents.status.chat_document_file')"
          />
        </div>

        <GrowingTextarea v-model="drafts[document.name]" :rows="6" :disabled="busy || resets[document.name] === true" :aria-label="documentLabel(document.name)" class="w-full font-mono" :ui="{ base: 'text-sm' }" />
        <p v-if="resets[document.name] === true" class="text-sm text-muted">{{ $t("agents.message.document_to_file") }}</p>
        <p v-if="failure[document.name] !== undefined" role="alert" class="break-words text-sm text-error">{{ failure[document.name] }}</p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useFormPart, useOpenedWith } from "bmo-ui/app/domain/form-save";

import type { ChatDocumentView, ChatDocumentsView } from "#shared/agency";

const { t } = useI18n();

const documents = ref<ChatDocumentView[] | null>(null);
const drafts = reactive<Record<string, string>>({});
// The documents a save puts back to their file.
const resets = reactive<Record<string, boolean>>({});
const failure = reactive<Record<string, string | undefined>>({});
const failed = ref(false);
const busy = ref(false);

const DOCUMENT_LABELS: Record<string, string> = {
  opening: "agents.label.chat_document_opening",
  "absolute-rules": "agents.label.chat_document_absolute_rules",
  manual: "agents.label.chat_document_manual"
};

function documentLabel(name: string): string {
  const key = DOCUMENT_LABELS[name];

  return key === undefined ? name : t(key);
}

// Where a document stands once the form is saved: its file where it is put back to it.
function shownSource(document: ChatDocumentView): ChatDocumentView["source"] {
  return resets[document.name] === true ? "file" : document.source;
}

function toFile(document: ChatDocumentView): void {
  resets[document.name] = true;
  drafts[document.name] = document.text;
}

function took(document: ChatDocumentView): void {
  documents.value = (documents.value ?? []).map((one) => (one.name === document.name ? document : one));
  drafts[document.name] = document.text;
  resets[document.name] = false;
  failure[document.name] = undefined;
}

function hold(list: ChatDocumentView[]): void {
  documents.value = list;

  for (const document of list) {
    drafts[document.name] = document.text;
    resets[document.name] = false;
    failure[document.name] = undefined;
  }
}

const changedDocuments = (): ChatDocumentView[] => (documents.value ?? []).filter((one) => resets[one.name] === true || drafts[one.name] !== one.text);

// Each changed document saved or put back in turn; a refusal stops it and stands under its document.
async function save(): Promise<boolean> {
  busy.value = true;

  try {
    for (const document of changedDocuments()) {
      const body = resets[document.name] === true ? { action: "reset" } : { action: "save", text: drafts[document.name] };

      try {
        took(await $fetch<ChatDocumentView>(`/api/chat-documents/${encodeURIComponent(document.name)}`, { method: "PATCH", body }));
      } catch (error) {
        failure[document.name] = failureText(error, t("agents.error.chat_document_save_failed"));

        return false;
      }
    }

    return true;
  } finally {
    busy.value = false;
  }
}

// What the form holds of each document: its text, and whether a save puts it back to its file.
const changes = useOpenedWith(() => ({ drafts, resets }), { ready: () => documents.value !== null });

useFormPart({
  dirty: changes,
  save,
  discard: () => hold(documents.value ?? [])
});

onMounted(async () => {
  try {
    hold((await $fetch<ChatDocumentsView>("/api/chat-documents")).items);
  } catch {
    failed.value = true;
  }
});
</script>
