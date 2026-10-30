<template>
  <!-- One thing asked of the research unit by its category, its name and the address of its maker's page
       (docs/web.md, 「Research screen」). The unit queues it at once; its refusal stands under the dialog. -->
  <SettingsDialog v-model:open="open" :title="$t('research.title.ask')" :dirty="dirty">
    <form id="research-ask-form" class="flex flex-col gap-4" @submit.prevent="void ask()">
      <UFormField :label="$t('research.label.category')" name="categoryName">
        <USelect v-model="draft.categoryName" :items="categoryItems" value-key="value" class="w-full" :aria-label="$t('research.label.category')" />
      </UFormField>

      <UFormField :label="$t('common.label.name')" name="name">
        <UInput v-model="draft.name" class="w-full" :aria-label="$t('common.label.name')" />
      </UFormField>

      <UFormField :label="$t('research.label.address')" name="address">
        <UInput v-model="draft.address" type="url" class="w-full font-mono" :aria-label="$t('research.label.address')" />
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

import type { ResearchAsk, ResearchItem } from "#shared/research";

const props = defineProps<{
  // The categories the unit holds, in its order.
  categories: readonly string[];
}>();

const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ asked: [ResearchItem] }>();

const { t } = useI18n();

function emptyDraft(): ResearchAsk {
  return { categoryName: props.categories[0] ?? "", name: "", address: "" };
}

const draft = ref<ResearchAsk>(emptyDraft());
const busy = ref(false);
const refusal = ref<string | null>(null);
const dirty = computed(() => draft.value.name.trim() !== "" || draft.value.address.trim() !== "");
const complete = computed(() => draft.value.categoryName !== "" && draft.value.name.trim() !== "" && draft.value.address.trim() !== "");
const categoryItems = computed(() => props.categories.map((name) => ({ value: name, label: name })));

watch(open, (opened) => {
  if (!opened) return;

  draft.value = emptyDraft();
  refusal.value = null;
});

async function ask(): Promise<void> {
  if (!complete.value) return;

  busy.value = true;
  refusal.value = null;

  try {
    const asked = await $fetch<ResearchItem>("/api/research/queue", { method: "POST", body: draft.value });

    emit("asked", asked);
    draft.value = emptyDraft();
    open.value = false;
  } catch (error) {
    refusal.value = failureText(error, t("research.error.ask_failed"));
  } finally {
    busy.value = false;
  }
}
</script>
