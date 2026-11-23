<template>
  <!-- The supply tab's agent supply (docs/web.md, 「Organisation」, the supply tab): the unit chosen in the tree, the
       company where none is — which of the three supply sources stand open under it, each closed here or following
       above with what the links below may do, and the unit's own keys where it holds organisation supply. A key's
       value is typed once into the form and goes to the unit's secret store; a row says of a key its name alone. -->
  <div v-if="!withheld" class="flex flex-col gap-4" data-agent-supply>
    <ContentSkeleton v-if="view === null && failure === ''" :rows="3" list-class="flex flex-col divide-y divide-default" :label="$t('supply.status.loading')">
      <div class="flex items-center gap-4 py-3">
        <SkeletonLine width="w-1/3" />
        <SkeletonBar class="ms-auto h-5 w-9 shrink-0 rounded-full" />
      </div>
    </ContentSkeleton>

    <div v-else-if="view === null" class="flex flex-col items-end gap-3">
      <UAlert class="w-full" color="error" variant="subtle" :description="failure" />
      <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" :loading="reading" @click="read" />
    </div>

    <template v-else>
      <SettingsGroup :title="$t('org_agents.title.sources')">
        <SettingsRow v-if="view.companyOpened !== null" :label="$t('org_agents.label.company_provided')" data-agent-supply-company>
          <USwitch :model-value="view.companyOpened" :loading="busy === 'company'" :disabled="busy !== ''" :aria-label="$t('org_agents.label.company_provided')" @update:model-value="(on: boolean) => void openCompany(on)" />
        </SettingsRow>
        <SettingsRow v-for="row in view.sources" :key="row.source" :label="sourceName(row.source)" :description="sourceLine(row)" :data-agent-source="row.source">
          <div class="flex flex-wrap items-center justify-end gap-2">
            <ChoiceSelect
              :model-value="row.delegation"
              :items="delegations"
              value-key="value"
              class="w-40"
              :disabled="busy !== '' || !row.writable"
              :aria-label="$t('org_agents.aria.delegation', { name: sourceName(row.source) })"
              @update:model-value="(value: unknown) => void delegate(row, value)"
            />
            <USwitch
              :model-value="row.stands"
              :loading="busy === row.source"
              :disabled="busy !== '' || !row.writable || (!row.stands && !row.closedHere)"
              :aria-label="$t('org_agents.aria.source_switch', { name: sourceName(row.source) })"
              @update:model-value="(on: boolean) => void close(row, !on)"
            />
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup v-if="view.items !== null" :title="$t('org_agents.title.keys')">
        <template #aside>
          <UTooltip :text="$t('org_agents.title.key_add')">
            <UButton size="sm" color="neutral" variant="ghost" icon="i-material-symbols-add" :aria-label="$t('org_agents.title.key_add')" :disabled="busy !== '' || !organisationOpen" data-agent-key-add @click="openAdd" />
          </UTooltip>
        </template>
        <SettingsRow v-if="!organisationOpen && view.items.length === 0" :label="$t('org_agents.label.keys_closed')" />
        <SettingsRow v-else-if="view.items.length === 0" :label="$t('org_agents.label.keys_none')" />
        <SettingsRow v-for="one in view.items" :key="one.id" :label="one.secret" :data-agent-key="one.secret">
          <template #description>
            <span class="flex min-w-0 flex-wrap items-center gap-x-2 text-sm">
              <span class="text-muted">{{ roadName(one.road) }}</span>
              <span :class="keyTone(one)">{{ keyStatus(one) }}</span>
            </span>
          </template>
          <IconButton size="xs" color="error" icon="i-material-symbols-delete-outline" :label="$t('org_agents.aria.key_remove', { name: one.secret })" :disabled="busy !== ''" @click="void remove(one)" />
          <USwitch :model-value="one.enabled" :loading="busy === one.id" :disabled="busy !== ''" :aria-label="$t('org_agents.aria.key_switch', { name: one.secret })" @update:model-value="(on: boolean) => void switchKey(one, on)" />
        </SettingsRow>
      </SettingsGroup>

      <p v-if="failure !== ''" role="alert" class="break-words text-sm text-error" data-agent-supply-failure>{{ failure }}</p>
    </template>

    <!-- A key of the unit's added: the provider, the name it is kept under in the unit's secret store, and the key once. -->
    <SettingsDialog v-model:open="adding" :title="$t('org_agents.title.key_add')" :dirty="addChanges">
      <form id="agent-key-form" class="flex flex-col gap-4" @submit.prevent="void add()">
        <UFormField :label="$t('org_agents.label.road')" name="road">
          <ChoiceSelect v-model="road" :items="roads" value-key="value" class="w-full" :aria-label="$t('org_agents.label.road')" />
        </UFormField>
        <UFormField :label="$t('org_agents.label.name')" name="name" :help="$t('org_agents.label.name_note')">
          <UInput v-model="name" class="w-full" autocomplete="off" data-agent-key-name />
        </UFormField>
        <UFormField :label="$t('org_agents.label.value')" name="value">
          <UInput v-model="value" class="w-full" type="password" autocomplete="off" data-agent-key-value />
        </UFormField>
        <p v-if="addFailure !== ''" role="alert" class="break-words text-sm text-error">{{ addFailure }}</p>
      </form>
      <template #footer="{ close: shut }">
        <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy !== ''" @click="shut()" />
        <UButton type="submit" form="agent-key-form" :label="$t('common.action.add')" :loading="busy === 'add'" :disabled="busy !== '' || !namePlain || value.trim() === ''" />
      </template>
    </SettingsDialog>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useOpenedWith } from "bmo-ui/app/domain/form-save";

import { useConfirm } from "~/domain/confirm";
import { UNIT_KEY } from "~/domain/organization";

import type { Organization } from "~/domain/organization";
import type { ChainDelegation, SourceKind, UnitSourceView, UnitSupplyItem, UnitSupplyView } from "#shared/organisation-supply";

interface Props {
  // The organisation chosen; the unit read is the one the tree chooses under it, the company itself where none is.
  company: Organization;
}

const props = defineProps<Props>();

const { t } = useI18n();
const route = useRoute();
const confirm = useConfirm();

const unit = computed(() => {
  const chosen = Number(route.query[UNIT_KEY]);

  return Number.isInteger(chosen) && chosen > 0 ? chosen : props.company.id;
});
const isCompany = computed(() => unit.value === props.company.id);
const view = ref<UnitSupplyView | null>(null);
// Whether the reader holds no link of the unit's sources, a credit manager who heads nothing among them: the groups
// stand for nobody else, so none is drawn.
const withheld = ref(false);
const failure = ref("");
const reading = ref(false);
const busy = ref("");
const adding = ref(false);
const road = ref("claude-code");
const name = ref("");
const value = ref("");
const addFailure = ref("");
const addChanges = useOpenedWith(() => ({ road: road.value, name: name.value, value: value.value }), { open: adding });

const delegations = computed(() =>
  (["inherit", "allow", "lock"] as const).map((one) => ({ value: one, label: t(`org_agents.label.delegation_${one}`) }))
);
// The roads a unit registers a key for: Claude Code on an Anthropic API key, and the gateway's roads.
const roads = computed(() => [
  { value: "claude-code", label: t("org_agents.label.road_claude") },
  { value: "codex", label: t("supply.label.road_codex") },
  { value: "deepseek", label: t("supply.label.road_deepseek") },
  { value: "openrouter", label: t("supply.label.road_openrouter") }
]);
const organisationOpen = computed(() => view.value?.sources.find((one) => one.source === "organisation")?.stands === true);
// A secret's name is one plain file name, as the secret store takes it.
const namePlain = computed(() => /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,199}$/.test(name.value.trim()) && !name.value.trim().endsWith(".previous"));

function sourceName(source: SourceKind): string {
  return t(`org_agents.label.source_${source}`);
}

// What a source's row says under its name: why it stands closed where it does, or that a lock above holds it.
function sourceLine(row: UnitSourceView): string {
  if (row.lockedBy !== null) return t("org_agents.label.locked_above");
  if (row.stands || row.closedHere) return "";

  return row.source === "organisation" ? t("org_agents.label.not_provided") : t("org_agents.label.closed_above");
}

function roadName(key: string): string {
  return roads.value.find((one) => one.value === key)?.label ?? key;
}

function keyStatus(one: UnitSupplyItem): string {
  if (!one.enabled) return t("org_agents.label.status_off");

  return one.refused ? t("org_agents.label.status_refused") : t("org_agents.label.status_ready");
}

function keyTone(one: UnitSupplyItem): string {
  if (!one.enabled) return "text-muted";

  return one.refused ? "text-error" : "text-success";
}

async function read(): Promise<void> {
  reading.value = true;
  failure.value = "";
  try {
    view.value = await $fetch<UnitSupplyView>(`/api/organization/units/${unit.value}/supply`, { query: { company: String(isCompany.value) } });
    withheld.value = false;
  } catch (error) {
    withheld.value = (error as { statusCode?: number }).statusCode === 403;
    failure.value = failureText(error, t("org_agents.error.forbidden"));
  } finally {
    reading.value = false;
  }
}

// One act of the tab's, the view read again after it; a refusal is said under the groups and the view read again,
// so a switch goes back to what stands.
async function act(key: string, work: () => Promise<unknown>): Promise<void> {
  busy.value = key;
  failure.value = "";
  try {
    await work();
  } catch (error) {
    failure.value = failureText(error, t("org_agents.error.forbidden"));
  } finally {
    busy.value = "";
  }
  await read();
}

async function close(row: UnitSourceView, closed: boolean): Promise<void> {
  await act(row.source, () => $fetch(`/api/organization/units/${unit.value}/supply/sources/${row.source}`, { method: "PUT", body: { closed } }));
}

async function delegate(row: UnitSourceView, chosen: unknown): Promise<void> {
  if (typeof chosen !== "string" || chosen === row.delegation) return;

  await act(row.source, () => $fetch(`/api/organization/units/${unit.value}/supply/sources/${row.source}`, { method: "PUT", body: { delegation: chosen as ChainDelegation } }));
}

async function openCompany(opened: boolean): Promise<void> {
  await act("company", () => $fetch(`/api/organization/units/${unit.value}/supply/company`, { method: "PUT", body: { opened } }));
}

async function switchKey(one: UnitSupplyItem, enabled: boolean): Promise<void> {
  await act(one.id, () => $fetch(`/api/organization/units/${unit.value}/supply/keys/${encodeURIComponent(one.id)}`, { method: "PATCH", body: { enabled } }));
}

async function remove(one: UnitSupplyItem): Promise<void> {
  if (!(await confirm({ title: t("org_agents.message.key_remove"), item: one.secret, effect: t("org_agents.message.key_remove_effect"), confirm: t("common.action.delete") }))) return;

  await act(one.id, () => $fetch(`/api/organization/units/${unit.value}/supply/keys/${encodeURIComponent(one.id)}`, { method: "DELETE" }));
}

function openAdd(): void {
  road.value = "claude-code";
  name.value = "";
  value.value = "";
  addFailure.value = "";
  adding.value = true;
}

async function add(): Promise<void> {
  busy.value = "add";
  addFailure.value = "";
  try {
    await $fetch(`/api/organization/units/${unit.value}/supply/keys`, { method: "POST", body: { road: road.value, name: name.value.trim(), value: value.value } });
    value.value = "";
    adding.value = false;
  } catch (error) {
    addFailure.value = failureText(error, t("org_agents.error.forbidden"));
  } finally {
    busy.value = "";
  }
  await read();
}

watch(unit, () => void read());
onMounted(() => void read());
</script>
