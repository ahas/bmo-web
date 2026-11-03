<template>
  <!-- What a supervisor or a role runs on now, in its now cell (docs/web.md, 「What a row runs on now」): one line, a
       compact mark of how the provider became active — forced by the owner or chosen by the order — then the
       provider's word, the model whole and its effort, and why its runs wait under it. Pressed, it drops the force's
       list: the entry leaving it to the order, the default, and every model the row's line may run on, grouped by
       provider; a pick is saved at once. -->
  <SettingsChoiceCell
    :value="chosen"
    :items="items"
    :label="$t('agents.aria.active_of', { name: props.name })"
    :reading="choices.reading.value"
    :save="pick"
    data-active-cell
    @open="() => void choices.read()"
  >
    <span class="flex max-w-full items-center gap-1 text-sm">
      <template v-if="props.road !== null">
        <UTooltip :text="markText">
          <UIcon
            :name="props.road.forced ? 'i-material-symbols-lock-outline' : 'i-material-symbols-format-list-numbered'"
            class="size-4 shrink-0"
            :class="props.road.forced ? 'text-warning' : 'text-muted'"
            role="img"
            :aria-label="markText"
            :data-active-forced="props.road.forced ? '' : undefined"
          />
        </UTooltip>
        <span class="truncate text-highlighted">{{ activeRoadText(providers, props.road) }}</span>
      </template>
      <span v-else class="text-muted">—</span>
    </span>
    <HintTip v-if="props.waitingFor !== null" :text="props.waitingFor" class="min-w-0">
      <span class="text-sm text-warning">{{ $t("agents.status.waiting_for_quota") }}</span>
    </HintTip>
  </SettingsChoiceCell>
</template>

<script setup lang="ts">
import { activeRoadText, markedDefault, useProviders } from "~/domain/axes";
import { ROAD_ORDER, roadParts, roadValue, useRoadChoices } from "~/domain/road-choices";

import type { ActiveProviderView } from "#shared/axes";
import type { ActiveRoad } from "~/domain/axes";

interface Props {
  // What the row runs on now and how it became active, or none where the agency names no active provider.
  road: ActiveRoad | null;
  // The provider the owner forced, as the agency holds it.
  active: ActiveProviderView | null;
  waitingFor: string | null;
  // The line the row's runs go out on, which a provider's program must carry to be offered.
  line: string;
  // What the row is called, which the cell's name says.
  name: string;
  // Saves the force, or clears it with null; the agency's refusal in the pack's words, or null once it took it.
  save: (active: ActiveProviderView | null) => Promise<string | null>;
}

const props = defineProps<Props>();
const { t } = useI18n();
const { data: providers } = useProviders();
const choices = useRoadChoices(t, () => props.line);

const markText = computed(() => (props.road?.forced === true ? t("agents.label.active_forced") : t("agents.label.order")));
const chosen = computed(() => (props.active === null ? ROAD_ORDER : roadValue(props.active.provider, props.active.model)));
const inUse = computed(() => (props.road === null || props.road.model === null ? null : roadValue(props.road.provider, props.road.model)));
const items = computed(() => choices.groups({ value: ROAD_ORDER, label: markedDefault(t, t("agents.label.active_to_order"), true) }, chosen.value, inUse.value));

async function pick(value: string | number): Promise<string | null> {
  const road = String(value) === ROAD_ORDER ? null : roadParts(String(value));

  if (road === null && String(value) !== ROAD_ORDER) return null;

  return await props.save(road);
}
</script>
