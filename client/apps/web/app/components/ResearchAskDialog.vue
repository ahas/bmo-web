<template>
  <!-- One thing asked of the research unit by its category, its name and the address of its maker's page, with the
       owner's words for why, and, for a follow-up, the research it follows from named above the fields (docs/web.md,
       「Research screen」). The unit queues it at once; its refusal stands under the dialog. -->
  <SettingsDialog v-model:open="open" :title="$t(props.follows === null ? 'research.title.ask' : 'research.title.follow_up')" :dirty="changes">
    <form id="research-ask-form" class="flex flex-col gap-4" @submit.prevent="void ask()">
      <p v-if="props.follows !== null" class="flex min-w-0 items-start gap-1 text-sm text-muted">
        <UIcon name="i-material-symbols-subdirectory-arrow-right" class="mt-0.5 size-4 shrink-0" />
        <span class="min-w-0 break-words">{{ parentText($t, props.follows) }}</span>
      </p>

      <UFormField :label="$t('research.label.category')" name="categoryName">
        <ChoiceSelect v-model="draft.categoryName" :items="categoryItems" value-key="value" class="w-full" :aria-label="$t('research.label.category')" />
      </UFormField>

      <UFormField :label="$t('common.label.name')" name="name">
        <UInput v-model="draft.name" class="w-full" :aria-label="$t('common.label.name')" />
      </UFormField>

      <UFormField :label="$t('research.label.address')" name="address">
        <UInput v-model="draft.address" type="url" class="w-full font-mono" :aria-label="$t('research.label.address')" />
      </UFormField>

      <UFormField :label="$t('research.label.because')" :hint="$t('common.label.optional')" name="because">
        <UTextarea v-model="because" :rows="2" autoresize class="w-full" :aria-label="$t('research.label.because')" />
      </UFormField>

      <p v-if="refusal !== null" role="alert" class="break-words text-sm text-error">{{ refusal }}</p>
    </form>

    <template #footer="{ close }">
      <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy" @click="close()" />
      <UButton type="submit" form="research-ask-form" :label="$t('research.action.ask')" :loading="busy" :disabled="busy || !complete" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useOpenedWith } from "bmo-ui/app/domain/form-save";
import { followFields, parentText } from "~/domain/research";

import type { ResearchAsk, ResearchItem } from "#shared/research";
import type { ResearchFollow } from "~/domain/research";

const props = defineProps<{
  // The categories the unit holds, in its order.
  categories: readonly string[];
  // The research the ask follows from, null for an ask of its own.
  follows: ResearchFollow | null;
}>();

const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ asked: [ResearchItem] }>();

const { t } = useI18n();

// A follow-up starts from its parent's category, where the unit still holds it, and from its maker's address.
function emptyDraft(): ResearchAsk {
  const followed = props.follows?.categoryName ?? null;
  const categoryName = followed !== null && props.categories.includes(followed) ? followed : (props.categories[0] ?? "");

  return { categoryName, name: "", address: props.follows?.address ?? "" };
}

const draft = ref<ResearchAsk>(emptyDraft());
// The owner's words for why the thing is asked; left empty, the ask carries none.
const because = ref("");
const busy = ref(false);
const refusal = ref<string | null>(null);
const changes = useOpenedWith(() => ({ ...draft.value, because: because.value }), { open });
const complete = computed(() => draft.value.categoryName !== "" && draft.value.name.trim() !== "" && draft.value.address.trim() !== "");
const categoryItems = computed(() => props.categories.map((name) => ({ value: name, label: name })));

watch(open, (opened) => {
  if (!opened) return;

  draft.value = emptyDraft();
  because.value = "";
  refusal.value = null;
});

async function ask(): Promise<void> {
  if (!complete.value) return;

  busy.value = true;
  refusal.value = null;

  try {
    const asked = await $fetch<ResearchItem>("/api/research/queue", { method: "POST", body: { ...draft.value, ...followFields(props.follows, because.value) } });

    emit("asked", asked);
    draft.value = emptyDraft();
    because.value = "";
    open.value = false;
  } catch (error) {
    refusal.value = failureText(error, t("research.error.ask_failed"));
  } finally {
    busy.value = false;
  }
}
</script>
