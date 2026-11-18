<template>
  <!-- A supervisor's road in its cell (docs/web.md, 「Agent management screen」): one line, the provider by its word, the
       model whole and its effort, or a dash where it names no road. Pressed, it opens the road's own form, with one
       save, holding the whole road; a refusal keeps every field as written with the reason under the one it names. -->
  <button type="button" :class="CELL_BUTTON" :disabled="props.disabled" :aria-label="$t('agents.aria.road_of', { name: props.name })" @click="openForm">
    <span class="max-w-full truncate text-sm" :class="shown === null ? 'text-muted' : 'text-highlighted'">{{ shown ?? "—" }}</span>
  </button>

  <SettingsDialog v-model:open="open" wide :title="$t('agents.label.column_road')" :description="props.name" :dirty="changes">
    <RoadField v-model="road" :line="SUPERVISOR_LINE" :refusal="refusal" :disabled="saving" :runs-as-owner="props.runsAsOwner" />
    <p v-if="refusal !== null && !ROAD_FIELDS.has(refusal.field ?? '')" role="alert" class="mt-2 break-words text-sm text-error">{{ refusal.text }}</p>

    <template #footer="{ close }">
      <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="saving" @click="close()" />
      <UButton :label="$t('common.action.save')" :loading="saving" :disabled="saving || !changes.dirty.value || !complete" @click="void submit()" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { useOpenedWith } from "bmo-ui/app/domain/form-save";

import { emptyRoad, ROAD_FIELDS, roadText, SUPERVISOR_LINE, useProviders } from "~/domain/axes";
import { CELL_BUTTON } from "~/domain/settings-cells";

import type { RoadView } from "#shared/axes";

interface Props {
  road: RoadView | null;
  // What the row is called, which the form is titled by.
  name: string;
  disabled?: boolean;
  // Whether the supervisor runs as the owner's own user on this machine, which a road on an outside engine warns of.
  runsAsOwner?: boolean;
  // Saves the road whole; the refusal with the field it names, or null once it took it.
  save: (road: RoadView) => Promise<{ field: string | null; text: string } | null>;
}

const props = withDefaults(defineProps<Props>(), { disabled: false, runsAsOwner: false });
const { data: providers } = useProviders();

const open = ref(false);
const saving = ref(false);
const road = ref<RoadView>(emptyRoad());
const refusal = ref<{ field: string | null; text: string } | null>(null);

const shown = computed(() => (props.road === null ? null : roadText(providers.value, props.road)));
const changes = useOpenedWith(() => road.value, { open });
const complete = computed(() => road.value.provider !== "" && road.value.model !== "");

// Every opening starts from what the agency holds now.
function openForm(): void {
  road.value = { ...(props.road ?? emptyRoad()) };
  refusal.value = null;
  open.value = true;
}

async function submit(): Promise<void> {
  saving.value = true;
  refusal.value = null;

  try {
    const refused = await props.save(road.value);

    if (refused === null) open.value = false;
    else refusal.value = refused;
  } finally {
    saving.value = false;
  }
}
</script>
