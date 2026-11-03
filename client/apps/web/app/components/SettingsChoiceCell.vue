<template>
  <!-- A cell whose value is one of a list: pressing it drops the list down from the cell, and the
       value picked is saved at once. A long list stands in groups, each under its head. A refused save
       says why in a notice and the cell stays as the bot holds it. -->
  <USelect
    :model-value="props.value ?? undefined"
    :items="props.items"
    value-key="value"
    variant="none"
    :loading="saving || props.reading"
    :disabled="props.disabled || saving"
    :aria-label="props.label"
    :content="{ align: 'start', side: 'bottom', sideOffset: 0 }"
    :ui="{ base: `${CELL_BUTTON} pe-8 text-sm focus-visible:bg-elevated`, trailing: saving || props.reading ? undefined : 'hidden', group: 'w-auto', itemDescription: 'whitespace-normal' }"
    class="w-full"
    @update:model-value="pick"
    @update:open="(open: boolean) => open && emit('open')"
  >
    <template #default>
      <span class="flex min-w-0 flex-col items-start">
        <slot />
      </span>
    </template>
  </USelect>
</template>

<script setup lang="ts">
import { CELL_BUTTON } from "~/domain/settings-cells";
import { useIsland } from "bmo-ui/app/domain/island";

import type { CellChoice } from "~/domain/settings-cells";

const props = defineProps<{
  value: string | number | null;
  // The choices, or groups of them each led by its head.
  items: CellChoice[] | CellChoice[][];
  label: string;
  disabled?: boolean;
  // Whether what the list holds is still being read as it opens.
  reading?: boolean;
  // Saves the picked value; the bot's refusal in its own words, or null once it took it.
  save: (value: string | number) => Promise<string | null>;
}>();

const emit = defineEmits<{
  // The list opened, for a list read only once it is wanted.
  open: [];
}>();

const { t } = useI18n();
const island = useIsland(t);
const saving = ref(false);

async function pick(value: unknown): Promise<void> {
  if (value === props.value || value === undefined || value === null || saving.value) return;

  saving.value = true;

  try {
    const refused = await props.save(value as string | number);

    if (refused !== null) {
      island.say({ key: `settings:${props.label}`, title: t("common.error.not_saved_named", { name: props.label }), description: refused, tone: "error" });
    }
  } finally {
    saving.value = false;
  }
}
</script>
