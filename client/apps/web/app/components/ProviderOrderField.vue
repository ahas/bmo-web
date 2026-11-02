<template>
  <!-- A provider order as one field of a form (docs/web.md, 「Agent management screen」; the agency's
       docs/provider-order.md, 「What an order is」): one line per entry, carried by its handle or moved by its
       arrows, each naming its provider, its model, its effort, its thinking and, on the registry's provider, its
       answer ceiling; the providers it does not hold yet are added under them, and its quota share stands last. Every
       change waits for the form's one save. An order is never empty, so its last entry has no remove. -->
  <div class="flex min-w-0 flex-col gap-4">
    <ol ref="list" class="flex min-w-0 flex-col divide-y divide-default rounded-lg border border-default" :aria-label="$t('agents.label.order')">
      <li
        v-for="(entry, index) in order"
        :key="entry.provider"
        :data-order-index="index"
        :data-order-provider="entry.provider"
        class="flex min-w-0 flex-col gap-2 py-2 pe-2"
        :class="drag.mark(index)"
      >
        <div class="flex min-w-0 items-center gap-1">
          <span
            class="flex size-11 shrink-0 cursor-grab touch-none select-none items-center justify-center text-muted transition-colors hover:text-highlighted active:text-primary"
            role="img"
            :aria-label="$t('agents.aria.drag_reorder')"
            @pointerdown="drag.onHandleDown(index, $event)"
          >
            <UIcon name="i-material-symbols-drag-indicator" class="size-5" />
          </span>
          <span class="w-5 shrink-0 text-sm tabular-nums text-muted">{{ index + 1 }}</span>
          <span class="min-w-0 flex-1 truncate text-sm font-medium text-highlighted">{{ providerWord(providers, entry.provider) }}</span>
          <UTooltip :text="$t('common.aria.move_up_named', { name: providerWord(providers, entry.provider) })">
            <UButton color="neutral" variant="ghost" size="sm" icon="i-material-symbols-arrow-upward" :aria-label="$t('common.aria.move_up_named', { name: providerWord(providers, entry.provider) })" :disabled="index === 0 || props.disabled" @click="move(index, index - 1)" />
          </UTooltip>
          <UTooltip :text="$t('common.aria.move_down_named', { name: providerWord(providers, entry.provider) })">
            <UButton color="neutral" variant="ghost" size="sm" icon="i-material-symbols-arrow-downward" :aria-label="$t('common.aria.move_down_named', { name: providerWord(providers, entry.provider) })" :disabled="index === order.length - 1 || props.disabled" @click="move(index, index + 1)" />
          </UTooltip>
          <UTooltip v-if="order.length > 1" :text="$t('agents.aria.order_entry_remove', { name: providerWord(providers, entry.provider) })">
            <UButton color="neutral" variant="ghost" size="sm" icon="i-material-symbols-close" :aria-label="$t('agents.aria.order_entry_remove', { name: providerWord(providers, entry.provider) })" :disabled="props.disabled" @click="remove(index)" />
          </UTooltip>
        </div>

        <div class="grid min-w-0 gap-2 ps-12 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
          <USelect
            :model-value="entry.model === '' ? undefined : entry.model"
            :items="modelItems(entry)"
            value-key="value"
            class="w-full min-w-0"
            :loading="modelsOf(entry.provider).reading"
            :disabled="props.disabled"
            :aria-label="$t('agents.aria.order_model_of', { name: providerWord(providers, entry.provider) })"
            @update:model-value="(value: string) => change(index, { model: value, effort: keptEffort(entry, value) })"
          />
          <USelect
            v-if="effortItems(entry).length > 0"
            :model-value="entry.effort ?? undefined"
            :items="effortItems(entry)"
            value-key="value"
            class="w-full sm:w-28"
            :disabled="props.disabled"
            :aria-label="$t('agents.aria.order_effort_of', { name: providerWord(providers, entry.provider) })"
            @update:model-value="(value: string) => change(index, { effort: value })"
          />
          <USelect
            :model-value="thinkingShown(entry)"
            :items="thinkingItems(entry)"
            value-key="value"
            class="w-full sm:w-32"
            :disabled="props.disabled"
            :aria-label="$t('agents.aria.order_thinking_of', { name: providerWord(providers, entry.provider) })"
            @update:model-value="(value: string) => change(index, { thinking: thinkingKept(entry, value) })"
          />
          <NumberInput
            v-if="registeredProvider(entry.provider)"
            :model-value="entry.answerTokens ?? undefined"
            :min="1"
            :step="1024"
            :digits="13"
            :placeholder="ceilingPlaceholder(entry)"
            :aria-label="$t('agents.aria.order_ceiling_of', { name: providerWord(providers, entry.provider) })"
            :disabled="props.disabled"
            @update:model-value="(value: number | null | undefined) => change(index, { answerTokens: value ?? null })"
          />
        </div>

        <p v-if="staleText(entry) !== ''" class="ps-12 text-sm text-muted">{{ staleText(entry) }}</p>
        <p v-if="modelsOf(entry.provider).failure !== null" role="alert" class="ps-12 break-words text-sm text-error">{{ modelsOf(entry.provider).failure }}</p>
        <p v-if="props.refusal !== null && props.refusal.entry === index" role="alert" class="ps-12 break-words text-sm text-error">{{ props.refusal.text }}</p>
      </li>
    </ol>

    <div class="flex justify-end">
      <UDropdownMenu :items="addItems" :content="{ align: 'end' }" :disabled="props.disabled || addItems.length === 0">
        <UButton color="neutral" variant="subtle" icon="i-material-symbols-add" :label="$t('agents.action.provider_add')" :disabled="props.disabled || addItems.length === 0" />
      </UDropdownMenu>
    </div>

    <UFormField :label="$t('agents.label.quota_share')" name="quotaShare">
      <NumberInput
        :model-value="percentOf(share)"
        :min="0"
        :max="100"
        :step="1"
        :digits="3"
        :unit="markedDefault($t, '%', percentOf(share) === percentOf(DEFAULT_QUOTA_SHARE))"
        :aria-label="$t('agents.label.quota_share')"
        :disabled="props.disabled"
        @update:model-value="(value: number | null | undefined) => (share = fractionOf(value ?? 0))"
      />
    </UFormField>

    <p v-if="props.refusal !== null && props.refusal.entry === null" role="alert" class="break-words text-sm text-error">{{ props.refusal.text }}</p>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { formatStamp } from "bmo-ui/app/domain/time";

import { ceilingDefault, DEFAULT_QUOTA_SHARE, effortChoices, fractionOf, markedDefault, percentOf, providerWord, thinkingDefault, useProviderModels, useProviders } from "~/domain/axes";
import { movedOrder } from "~/domain/agents";
import { useRowDrag } from "~/domain/row-drag";

import type { OrderEntryView } from "#shared/axes";
import type { DropdownMenuItem } from "@nuxt/ui";

interface Props {
  // The line the row's runs go out on, which a provider's program must carry to be offered.
  line: string;
  // A refusal the last save brought back: under the entry whose place it names, or under the field.
  refusal?: { entry: number | null; text: string } | null;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), { refusal: null, disabled: false });
const order = defineModel<OrderEntryView[]>({ required: true });
const share = defineModel<number>("share", { required: true });

const { t } = useI18n();
const { data: providers } = useProviders();
const models = useProviderModels();

const list = ref<HTMLElement | null>(null);
const drag = useRowDrag({ list, ready: () => !props.disabled, drop: (from, to) => move(from, to) });

// The thinking default the entry's model declares, as the switch's word: none where it declares none.
function thinkingDefaultOf(entry: OrderEntryView): "on" | "off" | null {
  const declared = thinkingDefault(modelsOf(entry.provider).view, entry.model);

  return declared === null ? null : declared ? "on" : "off";
}

// On and off, the one equal to the model's declared default marked as it.
function thinkingItems(entry: OrderEntryView): { label: string; value: string }[] {
  const fallback = thinkingDefaultOf(entry);

  return [
    { label: markedDefault(t, t("agents.label.switch_on"), fallback === "on"), value: "on" },
    { label: markedDefault(t, t("agents.label.switch_off"), fallback === "off"), value: "off" }
  ];
}

// An entry that leaves thinking to the provider stands at the model's declared default.
function thinkingShown(entry: OrderEntryView): string | undefined {
  return entry.thinking ?? thinkingDefaultOf(entry) ?? undefined;
}

// Picking the model's declared default leaves thinking to the provider, so the entry follows the model's own.
function thinkingKept(entry: OrderEntryView, value: string): string | null {
  return value === thinkingDefaultOf(entry) ? null : value;
}

// An emptied ceiling is the registration's own, which its placeholder names.
function ceilingPlaceholder(entry: OrderEntryView): string | undefined {
  const declared = ceilingDefault(modelsOf(entry.provider).view, entry.model);

  return declared === null ? undefined : markedDefault(t, declared.toLocaleString("ko-KR"), true);
}

function modelsOf(provider: string) {
  return models.stateOf(provider).value;
}

function readModels(provider: string): void {
  void models.read(provider, (error) => failureText(error, t("agents.error.provider_models_read_failed")));
}

// Each provider's models are read as its entry first stands in the field.
watch(() => order.value.map((one) => one.provider).join(" "), () => {
  for (const entry of order.value) readModels(entry.provider);
}, { immediate: true });

function providerOf(name: string) {
  return providers.value?.find((one) => one.name === name);
}

function registeredProvider(name: string): boolean {
  return providerOf(name)?.registered === true;
}

// The models the provider holds, the catalogue's superseded generations marked; one the entry names that the list
// does not carry still stands as its own choice.
function modelItems(entry: OrderEntryView): { label: string; value: string; description?: string }[] {
  const held = modelsOf(entry.provider).view?.models ?? [];
  const items = held.map((one) => ({ label: one.id, value: one.id, ...(one.inService === false ? { description: t("agents.label.model_superseded") } : {}) }));

  return entry.model === "" || items.some((one) => one.value === entry.model) ? items : [{ label: entry.model, value: entry.model }, ...items];
}

function effortItems(entry: OrderEntryView): { label: string; value: string }[] {
  return effortChoices(providerOf(entry.provider), modelsOf(entry.provider).view, entry.model).map((level) => ({ label: level, value: level }));
}

// A model chosen keeps the effort set where it takes it, and lets it go where it does not.
function keptEffort(entry: OrderEntryView, model: string): string | null {
  return entry.effort !== null && effortChoices(providerOf(entry.provider), modelsOf(entry.provider).view, model).includes(entry.effort) ? entry.effort : null;
}

function staleText(entry: OrderEntryView): string {
  const at = modelsOf(entry.provider).view?.staleReadAt ?? null;

  return at === null ? "" : t("agents.label.models_stale", { time: formatStamp(Math.floor(at / 1000)) });
}

function change(index: number, part: Partial<OrderEntryView>): void {
  order.value = order.value.map((one, at) => (at === index ? { ...one, ...part } : one));
}

function move(from: number, to: number): void {
  if (to < 0 || to >= order.value.length || from === to) return;

  order.value = movedOrder(order.value, from, to);
}

function remove(index: number): void {
  if (order.value.length <= 1) return;

  order.value = order.value.filter((_, at) => at !== index);
}

// Only the providers the order does not hold yet and whose program carries the row's line are offered; one that
// cannot answer now stands with its reason.
const addItems = computed<DropdownMenuItem[]>(() =>
  (providers.value ?? [])
    .filter((one) => !order.value.some((entry) => entry.provider === one.name) && (one.lines.length === 0 || one.lines.includes(props.line)))
    .map((one) => ({
      label: one.label,
      ...(one.reason === null ? {} : { description: one.reason }),
      onSelect: () => add(one.name)
    }))
);

// A provider added stands last, on the first model its catalogue serves once that is read.
function add(provider: string): void {
  order.value = [...order.value, { provider, model: "", effort: null, thinking: null, answerTokens: null }];
  readModels(provider);
}

watch(() => order.value.map((one) => `${one.provider}:${one.model}:${modelsOf(one.provider).view === null ? 0 : 1}`).join(" "), () => {
  const filled = order.value.map((entry) => {
    if (entry.model !== "") return entry;

    const first = modelsOf(entry.provider).view?.models.find((one) => one.inService !== false) ?? modelsOf(entry.provider).view?.models[0];

    return first === undefined ? entry : { ...entry, model: first.id };
  });

  if (filled.some((entry, at) => entry !== order.value[at])) order.value = filled;
});
</script>
