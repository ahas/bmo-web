<!-- A machine's CPU limit (bmo-node's docs/hardware.md, 「Temperature limits」): a button in the CPU card's head
     opening a small dialog with the limit in use, where it came from and the degrees each colour
     starts at, a field to set one, and a button to clear the one set. -->
<template>
  <UTooltip :text="$t('hardware.title.cpu_limit')">
    <UButton icon="i-material-symbols-device-thermostat" color="neutral" variant="ghost" :aria-label="$t('hardware.title.cpu_limit')" @click="opened" />
  </UTooltip>

  <SettingsDialog v-model:open="open" :title="$t('hardware.title.cpu_limit')" :dirty="changes">
    <p class="text-sm break-keep text-muted">{{ temperatureCriteria($t, control.limit.value) }}</p>

    <form :id="formId" @submit.prevent="void save(draft)">
      <NumberInput v-model="draft" :min="1" :max="126" :step="1" :digits="4" unit="°C" :aria-label="$t('hardware.title.cpu_limit')" />
    </form>

    <p v-if="control.failed.value !== null" role="alert" class="text-sm text-error">{{ control.failed.value }}</p>

    <template #footer>
      <UButton
        v-if="control.limit.value?.source === 'set'"
        :label="$t('common.action.delete')"
        color="neutral"
        variant="outline"
        :loading="pressed === 'clear'"
        :disabled="control.busy.value"
        @click="void save(null)"
      />
      <UButton type="submit" :form="formId" :label="$t('common.action.save')" :loading="pressed === 'save'" :disabled="draft == null || !changes.dirty.value || control.busy.value" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { useOpenedWith } from "bmo-ui/app/domain/form-save";

import { temperatureCriteria } from "~/domain/hardware";

import type { HardwareCpuLimit } from "~/domain/hardware";

const props = defineProps<{ control: HardwareCpuLimit }>();

const formId = useId();
const open = ref(false);
const draft = ref<number | null>(null);
const pressed = ref<"save" | "clear" | null>(null);

// The field opens on the limit in use, set or the chip's, and holds a change once it differs from that; a field
// emptied is alike to one that opened on none.
const changes = useOpenedWith(() => draft.value, { open });

function opened(): void {
  draft.value = props.control.limit.value?.celsius ?? null;
  open.value = true;
}

async function save(celsius: number | null): Promise<void> {
  pressed.value = celsius === null ? "clear" : "save";

  try {
    if (await props.control.set(celsius)) {
      open.value = false;
    }
  } finally {
    pressed.value = null;
  }
}
</script>
