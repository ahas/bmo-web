<template>
  <!-- A row's provider order in its cell (docs/web.md, 「Agent management screen」): the providers in order, each by
       its word with its model named short and its effort, the first marked as where the row's runs go while it has
       quota. Pressed, it opens the order's own form, with one save; a refusal keeps every line as written with the
       reason under the entry it names. -->
  <button type="button" :class="CELL_BUTTON" :disabled="props.disabled" :aria-label="$t('agents.aria.order_of', { name: props.name })" @click="openForm">
    <span v-for="(entry, index) in props.order" :key="entry.provider" class="flex max-w-full items-center gap-1 text-sm" :class="index === 0 ? 'font-medium text-highlighted' : 'text-muted'">
      <UIcon v-if="index === 0" name="i-material-symbols-arrow-right-alt" class="size-4 shrink-0 text-primary" />
      <span v-else class="w-4 shrink-0 text-center tabular-nums">{{ index + 1 }}</span>
      <span :class="props.held ? 'truncate' : 'whitespace-nowrap'">{{ entryText(providers, entry) }}</span>
    </span>
  </button>

  <SettingsDialog v-model:open="open" wide :title="$t('agents.label.order')" :description="props.name" :dirty="dirty">
    <ProviderOrderField v-model="order" v-model:share="share" :line="props.line" :refusal="refusal" :disabled="saving" />

    <template #footer="{ close }">
      <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="saving" @click="close()" />
      <UButton :label="$t('common.action.save')" :loading="saving" :disabled="saving || !dirty || !complete" @click="void submit()" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { entryText, orderRefusalEntry, useProviders } from "~/domain/axes";
import { CELL_BUTTON } from "~/domain/settings-cells";

import type { OrderEntryView } from "#shared/axes";

interface Props {
  order: OrderEntryView[];
  share: number;
  line: string;
  // What the row is called, which the form is titled by.
  name: string;
  // Whether the table's widths are held by hand, which is when a line is cut inside its column's width.
  held?: boolean;
  disabled?: boolean;
  // Saves the order and the share whole; the refusal with the field it names, or null once it took them.
  save: (order: OrderEntryView[], share: number) => Promise<{ field: string | null; text: string } | null>;
}

const props = withDefaults(defineProps<Props>(), { held: false, disabled: false });
const { data: providers } = useProviders();

const open = ref(false);
const saving = ref(false);
const order = ref<OrderEntryView[]>([]);
const share = ref(0);
const refusal = ref<{ entry: number | null; text: string } | null>(null);

const dirty = computed(() => JSON.stringify(order.value) !== JSON.stringify(props.order) || share.value !== props.share);
const complete = computed(() => order.value.length > 0 && order.value.every((one) => one.model !== ""));

// Every opening starts from what the agency holds now.
function openForm(): void {
  order.value = props.order.map((one) => ({ ...one }));
  share.value = props.share;
  refusal.value = null;
  open.value = true;
}

async function submit(): Promise<void> {
  saving.value = true;
  refusal.value = null;

  try {
    const refused = await props.save(order.value, share.value);

    if (refused === null) open.value = false;
    else refusal.value = { entry: orderRefusalEntry(refused.field), text: refused.text };
  } finally {
    saving.value = false;
  }
}
</script>
