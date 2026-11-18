<template>
  <!-- Asking where something is. The question goes to the document seeker; its first answer is
       opened, and the rest stand as chips under the box. -->
  <form class="flex flex-col gap-2" role="search" :aria-label="$t('documents.title.seek')" @submit.prevent="seek">
    <ChoiceSelect :content="{ align: 'start' }"
      v-model="scope"
      :items="SCOPES"
      value-key="value"
      :disabled="props.document === null"
      size="sm"
      class="self-start"
      :aria-label="$t('common.aria.search_scope')"
    />

    <UFieldGroup size="sm" class="w-full">
      <UInput
        v-model="question"
        class="min-w-0 flex-1"
        :maxlength="DOCUMENT_QUESTION_LIMIT"
        :placeholder="$t('documents.placeholder.seek')"
        :aria-label="$t('documents.placeholder.seek')"
      />
      <UButton type="submit" color="neutral" variant="subtle" :label="$t('common.action.find')" :loading="seeking" :disabled="question.trim() === ''" />
    </UFieldGroup>

    <p v-if="seeking" class="text-sm text-muted" role="status">{{ $t("documents.status.seeking") }}</p>
    <p v-else-if="failure !== ''" class="text-sm text-error" role="alert">{{ failure }}</p>
    <p v-else-if="asked && picks.length === 0" class="text-sm text-muted" role="status">
      {{ $t("documents.status.no_places_found") }}
    </p>

    <div v-if="picks.length > 1" class="flex flex-wrap gap-2" :aria-label="$t('documents.label.other_candidates')">
      <UButton
        v-for="(pick, index) in picks.slice(1)"
        :key="`${index}-${pick.root}/${pick.path}#${pick.heading}`"
        size="sm"
        color="neutral"
        variant="outline"
        class="max-w-full"
        :label="chipLabel(pick)"
        @click="emit('go', pick)"
      />
    </div>
  </form>
</template>

<script setup lang="ts">
import { DOCUMENT_QUESTION_LIMIT } from "#shared/config";
import { failureText } from "bmo-ui/app/domain/errors";

import type { DocumentSeekPick, DocumentSeekResult } from "#shared/types";
import type { SelectItem } from "@nuxt/ui";

// Where a question is answered, in the open document or in every document. What the seeker picks
// is handed up as places to go; opening them is the page's.

interface Props {
  document: { root: string; path: string } | null;
  headingText: (pick: DocumentSeekPick) => string | null;
}

const { t } = useI18n();
const props = defineProps<Props>();
const emit = defineEmits<{ go: [pick: DocumentSeekPick] }>();

const SCOPES: SelectItem[] = [
  { value: "document", label: t("documents.label.scope_this") },
  { value: "all", label: t("documents.label.scope_all") }
];

const question = ref("");
const scope = ref<"document" | "all">("document");
const seeking = ref(false);
const failure = ref("");
const asked = ref(false);
const picks = ref<DocumentSeekPick[]>([]);

watch(
  () => props.document,
  (document) => {
    if (document === null) {
      scope.value = "all";
    }
  },
  { immediate: true }
);

function chipLabel(pick: DocumentSeekPick): string {
  const heading = props.headingText(pick);
  const here = props.document !== null && pick.root === props.document.root && pick.path === props.document.path;

  return here ? (heading ?? pick.title) : `${pick.title}${heading === null ? "" : ` · ${heading}`}`;
}

async function seek(): Promise<void> {
  const asking = question.value.trim();

  if (asking === "" || seeking.value) {
    return;
  }

  seeking.value = true;
  failure.value = "";
  asked.value = false;

  try {
    const inDocument = scope.value === "document" && props.document !== null;
    const answer = await $fetch<DocumentSeekResult>("/api/documents/seek", {
      method: "POST",
      body: inDocument ? { question: asking, ...props.document } : { question: asking }
    });

    picks.value = answer.picks;
    asked.value = true;

    if (answer.picks[0] !== undefined) {
      emit("go", answer.picks[0]);
    }
  } catch (error) {
    picks.value = [];
    failure.value = failureText(error, t("documents.error.seek_failed"));
  } finally {
    seeking.value = false;
  }
}
</script>
