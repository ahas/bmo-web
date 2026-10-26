<template>
  <!-- Every provider's model for every tier at once: a tier to a row, a provider to a column, a
       turned-off provider included. A cell's dropdown sets that one mapping. -->
  <section class="flex min-w-0 flex-col" :aria-label="$t('agents.title.tiers')">
    <DataTableSkeleton v-if="!data && !error" :headers="tableHeaders(columns)" :rows="6" :label="$t('agents.status.tiers_loading')" />
    <ReadFailure
      v-else-if="error && !data"
      class="mx-4 my-4 w-auto"
      :failure="readFailure"
      :message="failureText(error, $t('agents.error.tiers_read_failed'))"
      :reading="status === 'pending'"
      @retry="refresh()"
    />

    <DataTable v-if="data" :data="rows" :columns="columns">
      <template #tier-cell="{ row }">
        <span :id="settingsAnchor(`tier-${row.original.tier}`)" :class="CELL_TEXT" class="ps-4 font-medium text-highlighted">
          <SearchText :text="row.original.tier" :query="props.query" />
        </span>
      </template>

      <template v-for="name in providerNames" :key="name" #[`${name}-header`]>
        <span class="flex items-center gap-2">
          {{ labelOf(name) }}
          <UBadge v-if="!enabled(name)" color="neutral" variant="subtle" size="sm" :label="$t('common.label.off')" />
        </span>
      </template>

      <template v-for="name in providerNames" :key="name" #[`${name}-cell`]="{ row }">
        <SettingsPopoverCell
          :label="$t('agents.aria.model_of', { tier: row.original.tier, provider: labelOf(name) })"
          :busy="savingAt === placeKey(row.original.tier, name)"
          @update:open="(now: boolean) => now && openCell(row.original.tier, name)"
        >
          <template v-if="cellOf(row.original.tier, name) !== null">
            <span class="flex min-w-0 items-center gap-1">
              <UTooltip v-if="unlistedAt(row.original.tier, name)" :text="UNLISTED_MARK">
                <span role="img" :aria-label="UNLISTED_MARK" class="flex">
                  <UIcon name="i-material-symbols-warning-outline" class="size-4 shrink-0 text-warning" />
                </span>
              </UTooltip>
              <SearchText class="min-w-0 text-highlighted" :text="cellOf(row.original.tier, name)!.model" :query="props.query" />
            </span>
            <SearchText class="text-muted" :text="cellOf(row.original.tier, name)!.detail" :query="props.query" />
          </template>
          <span v-else class="flex items-center gap-1 text-error">
            <UIcon name="i-material-symbols-error-outline" class="size-4" />{{ $t("agents.status.no_mapping") }}
          </span>

          <template #content>
            <p v-if="!enabled(provider)" class="text-sm text-toned">{{ $t("agents.label.provider_off") }}</p>

            <div v-if="catalogueError" role="alert" class="flex flex-wrap items-center gap-2 text-sm text-error">
              <span class="min-w-0">{{ catalogueError }}</span>
              <UButton class="ms-auto" size="sm" :label="$t('common.action.refresh')" color="neutral" variant="outline" :loading="catalogueLoading" @click="loadModels" />
            </div>

            <USwitch v-if="provider === 'openrouter'" v-model="freeOnly" :label="$t('agents.label.free_only')" />

            <UFormField
              :label="$t('common.label.model')"
              name="model"
              :error="unlisted ? $t('agents.error.model_unlisted') : undefined"
              :help="staleReadAt === null ? undefined : $t('agents.label.last_read_list', { time: formatStamp(toUnixSeconds(staleReadAt)) })"
            >
              <USelectMenu
                v-model="model"
                :content="{ align: 'start' }"
                :items="modelItems"
                value-key="value"
                :loading="catalogueLoading"
                :disabled="saving || !!catalogueError || catalogueLoading"
                class="w-full min-w-0"
                :aria-label="$t('common.label.model')"
                :placeholder="$t('agents.aria.choose_model')"
                @update:model-value="saveIfReady"
              />
            </UFormField>

            <template v-if="capsTokens(provider)">
              <UFormField label="Token Size" name="answerTokens">
                <USelect v-model="answerTokens" :content="{ align: 'start' }" :items="tokenItems" value-key="value" class="w-full" :disabled="saving" aria-label="Token Size" @update:model-value="saveIfReady" />
              </UFormField>
              <!-- A provider whose runs think by a default of their own offers that default beside on and off. -->
              <UFormField v-if="threeWay(provider)" :label="$t('agents.label.thinking')" name="thinking">
                <USelect v-model="thinkingChoice" :content="{ align: 'start' }" :items="thinkingItems" value-key="value" class="w-full" :disabled="saving || !chosenModel" :aria-label="$t('agents.label.thinking')" @update:model-value="saveIfReady" />
              </UFormField>
              <USwitch v-else v-model="thinking" :label="$t('agents.label.thinking')" :disabled="saving || !chosenModel?.efforts.includes('thinking')" @update:model-value="saveIfReady" />
            </template>

            <UFormField v-else label="effort" name="effort" :error="invalidEffort ? $t('agents.error.effort_unsupported') : undefined">
              <USelect v-model="effort" :content="{ align: 'start' }" :items="effortItems" value-key="value" :disabled="saving || !chosenModel || catalogueLoading" class="w-full" aria-label="effort" @update:model-value="saveIfReady" />
            </UFormField>

            <div class="flex flex-col gap-1 text-sm">
              <p class="text-muted">{{ $t("agents.label.applies_to") }}</p>
              <p class="break-words text-toned">{{ affected || $t("agents.status.no_assigned_work") }}</p>
            </div>

            <p v-if="saveError" role="alert" class="break-words text-sm text-error">{{ saveError }}</p>
          </template>
        </SettingsPopoverCell>
      </template>
    </DataTable>
  </section>
</template>

<script setup lang="ts">
import { tableHeaders } from "bmo-ui/app/domain/column-widths";
import { ANSWER_TOKEN_CHOICES, CELL_TEXT, mappingText, PROVIDER_COLUMNS, settingsAnchor, tokensText } from "~/domain/agent-settings";
import { failureText } from "bmo-ui/app/domain/errors";
import { useReadFailure } from "~/domain/events";
import { modeLabel } from "~/domain/status";
import { formatStamp, toUnixSeconds } from "bmo-ui/app/domain/time";

import type { TierProvider } from "#shared/agency";
import type { ModelTier } from "#shared/agency";
import type { TierCatalogueEntry, TierSettingsView } from "#shared/agency";
import type { TableColumn } from "@nuxt/ui";

interface Props {
  query?: string;
}

const props = withDefaults(defineProps<Props>(), { query: "" });
const { t } = useI18n();

// The place the table keeps is kept from the first frame, before the browser has asked for
// anything: the read is the browser's alone, so a place that stood up only once it had begun
// would be absent from the picture the server draws and would arrive as a jump. What it is
// waiting on is the answer itself rather than the read's own state, which is not the same on
// both sides of that picture.
const { data, error, refresh, status } = useFetch<TierSettingsView>("/api/model-tiers", { key: "model-tiers", server: false, lazy: true });
const readFailure = useReadFailure({ failed: () => !!error.value && !data.value, reading: () => status.value === "pending", reread: () => void refresh() });

const rows = computed(() => (data.value?.tiers ?? []).map((tier) => ({ tier })));

// The providers the bot reports, each a column under its own label; before the report lands, every
// provider the bot carries, so the skeleton already has the table's columns.
const providerNames = computed<TierProvider[]>(() => data.value?.providers.map((one) => one.provider) ?? [...PROVIDER_COLUMNS]);

function reported(name: TierProvider) {
  return data.value?.providers.find((one) => one.provider === name);
}

function labelOf(name: TierProvider): string {
  return reported(name)?.label ?? modeLabel(t, name);
}

// Whether this provider's mapping carries an answer ceiling and a thinking switch, as the provider
// itself says.
function capsTokens(name: TierProvider): boolean {
  return reported(name)?.capsAnswerTokens ?? false;
}

// Whether this provider's thinking is on, off, or left to a default of the model's own — the
// registry's, whose registrations each carry one.
function threeWay(name: TierProvider): boolean {
  return reported(name)?.efforts.includes("no-thinking") ?? false;
}

const columns = computed<TableColumn<{ tier: ModelTier }>[]>(() => [
  { accessorKey: "tier", header: t("agents.label.tier"), meta: { class: { th: "w-28" } } },
  ...providerNames.value.map((name) => ({ id: name, header: labelOf(name) }))
]);

// The mapping the open dropdown edits, and what it holds.
const tier = ref<ModelTier>("Frontier");
const provider = ref<TierProvider>("claude-code");
const model = ref("");
const effort = ref("unset");
const thinking = ref(false);
const thinkingChoice = ref<"unset" | "thinking" | "no-thinking">("unset");
const thinkingItems = [
  { value: "unset", label: t("agents.label.thinking_choice_default") },
  { value: "thinking", label: t("agents.label.thinking_choice_on") },
  { value: "no-thinking", label: t("agents.label.thinking_choice_off") }
];
const answerTokens = ref(0);
const freeOnly = ref(true);
const saving = ref(false);
const savingAt = ref("");
const saveError = ref("");
const catalogue = ref<TierCatalogueEntry[]>([]);
const catalogueLoading = ref(false);
const catalogueError = ref("");
// The last list each provider answered with, kept so every cell of that provider can say whether
// the model it holds is still one the provider names. A provider nothing has been read from yet
// marks nothing: a mark is only ever made against a list actually in hand.
const known = reactive<Partial<Record<TierProvider, TierCatalogueEntry[]>>>({});

// What the mark on a cell says, to the pointer and to a reader alike: the model saved there is one
// the provider's list no longer names.
const UNLISTED_MARK = t("agents.label.model_unlisted");

function placeKey(at: ModelTier, name: TierProvider): string {
  return `${at}:${name}`;
}

function enabled(name: TierProvider): boolean {
  return reported(name)?.enabled ?? false;
}

function mappingOf(at: ModelTier, name: TierProvider) {
  return data.value?.mappings.find((one) => one.provider === name && one.tier === at) ?? null;
}

function cellOf(at: ModelTier, name: TierProvider) {
  return mappingText(t, mappingOf(at, name), capsTokens(name), threeWay(name));
}

// Whether the model this cell holds is one the provider's own list no longer names. It stays as it
// is and keeps launching runs; what the mark says is that nobody would find it in the picker.
function unlistedAt(at: ModelTier, name: TierProvider): boolean {
  const saved = mappingOf(at, name);
  const list = known[name];

  return saved !== null && list !== undefined && !list.some((one) => one.model === saved.model);
}

const affected = computed(() => data.value?.assignments.filter((one) => one.tier === tier.value).map((one) => one.key).join(", ") ?? "");
const chosenModel = computed(() => catalogue.value.find((one) => one.model === model.value));
const unlisted = computed(() => model.value !== "" && !catalogueLoading.value && !catalogueError.value && !chosenModel.value);
const chosenEffort = computed<string | null>(() => {
  if (threeWay(provider.value)) return thinkingChoice.value === "unset" ? null : thinkingChoice.value;
  if (capsTokens(provider.value)) return thinking.value ? "thinking" : null;

  return effort.value === "unset" ? null : effort.value;
});
const invalidEffort = computed(() => !!chosenModel.value && !chosenModel.value.efforts.includes(chosenEffort.value));

// What the picker offers: every model the provider's catalogue named, a superseded generation
// marked as one, and — where the saved model is no longer in that list — the saved value itself at
// the head, marked as a name the catalogue no longer carries.
const modelItems = computed(() => {
  const list = catalogue.value
    .filter((one) => provider.value !== "openrouter" || !freeOnly.value || one.free)
    .map((one) => ({ value: one.model, label: one.inService === false ? t("agents.label.model_retired", { model: one.model }) : one.model }));

  if (model.value !== "" && !list.some((one) => one.value === model.value)) {
    list.unshift({ value: model.value, label: t("agents.label.model_not_listed", { model: model.value }) });
  }

  return list;
});

// When the list on the screen was read, where the provider served the last list it had rather than
// a fresh one. Null while it is fresh, and for a provider that keeps no such mark.
const staleReadAt = computed<number | null>(() => catalogue.value.find((one) => one.staleReadAt !== undefined)?.staleReadAt ?? null);

const effortItems = computed(() => chosenModel.value?.efforts.map((one) => ({ value: one ?? "unset", label: one ?? t("agents.label.unset") })) ?? []);
const tokenItems = [{ value: 0, label: t("common.label.default_choice") }, ...ANSWER_TOKEN_CHOICES.map((value) => ({ value, label: tokensText(t, value) }))];

// Whether what the dropdown holds differs from the saved mapping.
const changed = computed(() => {
  const saved = mappingOf(tier.value, provider.value);
  const caps = capsTokens(provider.value);
  const tokens = caps ? (answerTokens.value === 0 ? null : answerTokens.value) : null;

  return saved === null || saved.model !== model.value || saved.effort !== chosenEffort.value || (caps && (saved.answerTokens ?? null) !== tokens);
});

let generation = 0;

async function loadModels(): Promise<void> {
  const run = ++generation;
  const name = provider.value;

  catalogueLoading.value = true;
  catalogueError.value = "";
  catalogue.value = [];

  try {
    const result = await $fetch<TierCatalogueEntry[]>("/api/model-tiers/models", { query: { provider: name } });

    if (run === generation) catalogue.value = result;
    known[name] = result;
  } catch (failure) {
    if (run === generation) catalogueError.value = failureText(failure, t("agents.error.models_read_failed"));
  } finally {
    if (run === generation) catalogueLoading.value = false;
  }
}

function openCell(at: ModelTier, name: TierProvider): void {
  const saved = mappingOf(at, name);

  tier.value = at;
  provider.value = name;
  model.value = saved?.model ?? "";
  effort.value = saved?.effort ?? "unset";
  thinking.value = saved?.effort === "thinking";
  thinkingChoice.value = saved?.effort === "thinking" || saved?.effort === "no-thinking" ? saved.effort : "unset";
  answerTokens.value = saved?.answerTokens ?? 0;
  saveError.value = "";
  void loadModels();
}

// A pick is saved as soon as the model and its effort make a pair the model supports; a model whose
// list lacks the current effort waits for an effort to be picked.
async function saveIfReady(): Promise<void> {
  await nextTick();

  if (!chosenModel.value || invalidEffort.value || catalogueLoading.value || catalogueError.value || saving.value || !changed.value) return;

  saving.value = true;
  savingAt.value = placeKey(tier.value, provider.value);
  saveError.value = "";

  try {
    await $fetch("/api/model-tiers", {
      method: "POST",
      body: {
        action: "set-mapping",
        provider: provider.value,
        tier: tier.value,
        model: model.value,
        effort: chosenEffort.value,
        ...(capsTokens(provider.value) ? { answerTokens: answerTokens.value === 0 ? null : answerTokens.value } : {})
      }
    });
    await refresh();
  } catch (failure) {
    saveError.value = failureText(failure, t("common.error.save_failed"));
  } finally {
    saving.value = false;
    savingAt.value = "";
  }
}

defineExpose({ refresh });
</script>
