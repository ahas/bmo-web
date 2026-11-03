<template>
  <!-- Settings the engine samples an answer with, each with what it is for and its bounds in full
       sight beside its box. A box or a switch the engine's own default stands in stays empty, with no word in it, since
       the service says only that it is the engine's own and no route says what it is (docs/web.md, 「The default among
       choices」); an emptied box is the engine's own again. Rows of the form's own may stand ahead of
       them in the same columns. -->
  <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 sm:grid-cols-[max-content_minmax(0,1fr)_auto]" role="group" :aria-labelledby="labelledby">
    <slot />

    <template v-for="one in settings" :key="one.name">
      <label :for="`${idPrefix}-${one.name}`" class="flex min-w-0 flex-col sm:contents">
        <span class="font-mono text-sm text-highlighted">{{ one.name }}</span>
        <span class="text-sm text-muted">
          {{ generationUse($t, one.name) }}<span v-if="!one.switch" class="tabular-nums"> · {{ generationBounds(one) }}</span>
        </span>
      </label>
      <USelect
        v-if="one.switch"
        :id="`${idPrefix}-${one.name}`"
        :model-value="draft[one.name] === '' ? undefined : draft[one.name]"
        :items="switchItems"
        value-key="value"
        class="w-full"
        :color="refusalAt(one.name) === '' ? undefined : 'error'"
        :highlight="refusalAt(one.name) !== ''"
        :disabled="disabled"
        @update:model-value="(value: string) => (draft[one.name] = value)"
      />
      <NumberInput
        v-else
        :id="`${idPrefix}-${one.name}`"
        :model-value="numberOf(draft[one.name])"
        :min="one.min"
        :max="one.max ?? undefined"
        :step="one.whole ? 1 : DECIMAL_STEP"
        :step-snapping="false"
        :format-options="{ maximumFractionDigits: one.whole ? 0 : DECIMAL_PLACES }"
        :digits="DIGITS"
        :color="refusalAt(one.name) === '' ? undefined : 'error'"
        :highlight="refusalAt(one.name) !== ''"
        :disabled="disabled"
        @update:model-value="(value: number | null | undefined) => (draft[one.name] = textOf(value))"
      />
      <p v-if="refusalAt(one.name) !== ''" role="alert" class="col-span-full break-words text-sm text-error">{{ refusalAt(one.name) }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { generationBounds, generationUse } from "~/domain/generation";

import type { GenerationSetting } from "#shared/agency";

interface Props {
  settings: readonly GenerationSetting[];
  // What each box's id opens with, so a label finds its own box among several such groups.
  idPrefix: string;
  // The id of the title the group is named by.
  labelledby: string;
  disabled?: boolean;
  // The refusal a save brought back about one setting, empty where there is none.
  refusalAt?: (field: string) => string;
}

withDefaults(defineProps<Props>(), { disabled: false, refusalAt: () => "" });

// Each setting's box as text, a switch's choice as on or off, either empty where nothing is set, held by the form until
// it saves.
const draft = defineModel<Record<string, string>>({ required: true });

// A setting that takes fractions steps by a hundredth and keeps up to six places as they are typed.
const DECIMAL_STEP = 0.01;
const DECIMAL_PLACES = 6;
// Every box of the group stands one width, so the column reads straight down: nine characters, as
// wide as a count of tokens, which a rarer longer value scrolls within.
const DIGITS = 9;

// The box holds a number, the form its text: an empty box is the engine's own.
function numberOf(text: string | undefined): number | null {
  return text === undefined || text.trim() === "" || !Number.isFinite(Number(text)) ? null : Number(text);
}

function textOf(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}
const { t } = useI18n();

const switchItems = computed(() => [
  { label: t("agents.label.switch_on"), value: "on" },
  { label: t("agents.label.switch_off"), value: "off" },
]);
</script>
