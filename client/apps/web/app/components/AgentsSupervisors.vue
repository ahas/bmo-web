<template>
  <!-- The supervisors (docs/web.md, 「Agent management screen」, the supervisors tab; the agency's docs/supervisors.md): one row each
       in the agency's order, every value a cell of its own that saves it, the row's own presses at its trailing edge;
       under the table the draft process and its questions. -->
  <section class="flex min-w-0 flex-col" :aria-label="$t('agents.label.tab_supervisors')">
    <DataTableSkeleton v-if="supervisors === undefined && !error" :headers="tableHeaders(columns)" :rows="3" :label="$t('agents.status.supervisors_loading')" />
    <ReadFailure
      v-else-if="error && supervisors === undefined"
      class="mx-4 my-4 w-auto"
      :failure="readFailure"
      :message="failureText(error, $t('agents.error.supervisors_read_failed'))"
      :reading="status === 'pending'"
      @retry="refresh()"
    />
    <p v-else-if="supervisors !== undefined && supervisors.length === 0" class="px-4 py-3 text-sm text-muted">{{ $t("agents.status.no_supervisors") }}</p>

    <!-- The tab's body scrolls up and down around every table of the tab; each table scrolls sideways in its own box,
         and the screen holds its head at the body's top while its rows pass under it. -->
    <DataTable v-if="supervisors !== undefined && supervisors.length > 0" data-settings-table :data="supervisors" :columns="columns" :row-key="(row: SupervisorView) => row.name">
      <template #supervisor-cell="{ row }">
        <NuxtLink
          :id="settingsAnchor(`supervisor-${row.original.name}`)"
          :to="`/agents/${encodeURIComponent(row.original.name)}`"
          :class="CELL_TEXT"
          class="flex-row items-start justify-start gap-2 ps-4 transition-colors hover:bg-elevated active:bg-accented"
        >
          <UIcon :name="row.original.icon ?? SUPERVISOR_ICON" class="mt-0.5 size-5 shrink-0 text-muted" />
          <span class="flex min-w-0 flex-col">
            <SearchText class="truncate text-sm font-medium text-highlighted" :text="row.original.label" :query="props.query" />
            <SearchText class="truncate font-mono text-sm text-muted" :text="row.original.name" :query="props.query" />
            <SearchHit :match="aliasMatch(row.original)" :query="props.query" />
          </span>
        </NuxtLink>
      </template>

      <template #order-cell="{ row, held }">
        <ProviderOrderCell
          :order="row.original.order"
          :share="row.original.quotaShare"
          :line="SUPERVISOR_LINE"
          :name="row.original.label"
          :held="held"
          :save="(order, quotaShare) => change(row.original.name, { order, quotaShare })"
        />
      </template>

      <template #now-cell="{ row, held }">
        <span :class="[CELL_TEXT, held ? 'w-full' : 'w-max max-w-64']" class="text-sm">
          <span v-if="row.original.provider === null" class="text-muted">—</span>
          <span v-else class="truncate text-highlighted">{{ nowText(row.original) }}</span>
          <HintTip v-if="row.original.waitingFor !== null" :text="row.original.waitingFor" class="min-w-0">
            <span class="text-warning">{{ $t("agents.status.waiting_for_quota") }}</span>
          </HintTip>
        </span>
      </template>

      <!-- The providers its prefix is kept warm on, on one line; pressed, one switch per provider of its order, each
           taking effect as it is thrown. -->
      <template #warming-cell="{ row, held }">
        <SettingsPopoverCell :label="$t('agents.aria.warming_cell_of', { name: row.original.label })" :busy="warmingBusy.startsWith(`${row.original.name}:`)">
          <span v-if="warmedOf(row.original).length === 0" class="whitespace-nowrap text-sm text-muted">{{ $t("agents.label.switch_off") }}</span>
          <span v-else class="max-w-full text-sm text-highlighted" :class="held ? 'truncate' : 'whitespace-nowrap'">{{ warmedOf(row.original).join(" · ") }}</span>

          <template #content>
            <ul class="flex min-w-0 flex-col" :aria-label="$t('agents.label.column_warming')">
              <li v-for="entry in row.original.order" :key="entry.provider" class="flex min-h-10 items-center justify-between gap-4 text-sm">
                <span class="whitespace-nowrap text-toned">{{ providerWord(providers, entry.provider) }}</span>
                <HintTip :text="warmingBlock(entry.provider) ?? undefined" :disabled="warmingBlock(entry.provider) === null">
                  <USwitch
                    :model-value="row.original.warming[entry.provider] === true"
                    :loading="warmingBusy === `${row.original.name}:${entry.provider}`"
                    :disabled="warmingBusy !== '' || warmingBlock(entry.provider) !== null"
                    :aria-label="$t('agents.aria.warming_of', { name: row.original.label, provider: providerWord(providers, entry.provider) })"
                    @update:model-value="(on: boolean) => void switchWarming(row.original, entry.provider, on)"
                  />
                </HintTip>
              </li>
            </ul>
          </template>
        </SettingsPopoverCell>
      </template>

      <template #threshold-cell="{ row }">
        <SettingsInputCell
          :value="percentOf(row.original.foldRatio)"
          :label="$t('agents.aria.threshold_of', { name: row.original.label })"
          :min="1"
          :max="100"
          :step="1"
          :save="(value: string) => saved(change(row.original.name, { foldRatio: fractionOf(Number(value)) }))"
        >
          <span class="text-sm tabular-nums text-highlighted">{{ thresholdText($t, row.original.foldRatio, defaultThreshold(providers, row.original.order)) }}</span>
        </SettingsInputCell>
      </template>

      <template #rooms-cell="{ row, held }">
        <span :class="[CELL_TEXT, held ? 'w-full' : 'w-max max-w-72']" class="text-sm">
          <span v-if="roomsOf(row.original).length === 0" class="text-muted">—</span>
          <span v-else class="truncate text-highlighted">{{ roomsOf(row.original).join(" · ") }}</span>
        </span>
      </template>

      <template #actions-cell="{ row }">
        <span class="flex h-full min-h-12 items-center justify-end pe-2">
          <UDropdownMenu :items="menuOf(row.original)" :content="{ align: 'end' }">
            <UTooltip :text="$t('common.aria.menu_of', { name: row.original.label })">
              <UButton color="neutral" variant="ghost" size="sm" icon="i-material-symbols-more-vert" :loading="removing === row.original.name" :aria-label="$t('common.aria.menu_of', { name: row.original.label })" />
            </UTooltip>
          </UDropdownMenu>
        </span>
      </template>
    </DataTable>

    <p v-if="removeFailed !== ''" role="alert" class="px-4 py-2 break-words text-sm text-error">{{ removeFailed }}</p>

    <AgentsDraftProcesses class="mt-6" :query="props.query" />

    <SupervisorSettingsDialog v-if="editing !== ''" v-model:open="editingOpen" :name="editing" :reread="rereadAll" />

    <!-- A supervisor added as a companion added on the console is, with a room of the console's own that it answers
         alone; a refusal stands under the field it names. -->
    <SettingsDialog v-model:open="adding" wide :title="$t('agents.title.supervisor_add')" :dirty="addDirty">
      <form id="supervisor-add-form" class="flex flex-col gap-4" @submit.prevent="void add()">
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField :label="$t('common.label.name')" name="name" :error="addErrorAt('name')">
            <UInput v-model="draft.name" class="w-full font-mono" :aria-label="$t('common.label.name')" />
          </UFormField>
          <UFormField :label="$t('agents.label.display_name')" name="label" :error="addErrorAt('label')">
            <UInput v-model="draft.label" class="w-full" :aria-label="$t('agents.label.display_name')" />
          </UFormField>
        </div>

        <UFormField :label="$t('agents.label.order')" name="order">
          <ProviderOrderField v-model="draft.order" v-model:share="draft.quotaShare" :line="SUPERVISOR_LINE" :refusal="orderRefusal" :disabled="addBusy" />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField :label="$t('agents.label.work_repository')" name="repository" :error="addErrorAt('worker') ?? addErrorAt('repository')">
            <USelect v-model="draft.repository" :items="repositoryItems" value-key="value" class="w-full" :aria-label="$t('agents.label.work_repository')" />
          </UFormField>
          <UFormField :label="$t('agents.label.companion_room')" name="room" :error="addErrorAt('room')">
            <UInput v-model="draft.room" class="w-full" :aria-label="$t('agents.label.companion_room')" />
          </UFormField>
        </div>

        <p v-if="addRefusal !== null && !ADD_FIELDS.has(addRefusal.field ?? '') && orderRefusal === null" role="alert" class="break-words text-sm text-error">{{ addRefusal.text }}</p>
      </form>

      <template #footer="{ close }">
        <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="addBusy" @click="close()" />
        <UButton type="submit" form="supervisor-add-form" :label="$t('common.action.add')" :loading="addBusy" :disabled="addBusy || !addComplete" />
      </template>
    </SettingsDialog>
  </section>
</template>

<script setup lang="ts">
import { matchFields } from "bmo-ui/shared/search";
import { tableHeaders } from "bmo-ui/app/domain/column-widths";
import { failureText } from "bmo-ui/app/domain/errors";
import { useIsland } from "bmo-ui/app/domain/island";

import { settingsAnchor } from "~/domain/agent-settings";
import { DEFAULT_QUOTA_SHARE, defaultThreshold, fractionOf, orderRefusalEntry, percentOf, providerWord, refusalOf, SUPERVISOR_LINE, thresholdText, useProviders } from "~/domain/axes";
import { useConfirm } from "~/domain/confirm";
import { useReadFailure } from "~/domain/events";
import { useRoomList } from "~/domain/room-list";
import { CELL_TEXT } from "~/domain/settings-cells";

import type { CompanionAdded, CompanionView } from "#shared/agency";
import type { OrderEntryView, RepositoryView, SupervisorView } from "#shared/axes";
import type { DropdownMenuItem, TableColumn } from "@nuxt/ui";

const props = withDefaults(defineProps<{ query?: string }>(), { query: "" });
const { t } = useI18n();
const island = useIsland(t);
const askFirst = useConfirm();

// The mark a supervisor stands under where the agency names none of its own.
const SUPERVISOR_ICON = "i-material-symbols-chat-bubble-outline";

// The page's search reads the same answers under the same keys.
const { data: supervisors, error, refresh, status } = useFetch<SupervisorView[]>("/api/supervisors", { key: "supervisors", lazy: true, server: false });
const { data: companions, refresh: rereadCompanions } = useFetch<CompanionView[]>("/api/companions", { key: "companions", lazy: true, server: false });
const { data: repositories } = useFetch<RepositoryView[]>("/api/repositories", { key: "repositories", lazy: true, server: false });
const { data: providers } = useProviders();
const { data: rooms } = useRoomList();
const readFailure = useReadFailure({ failed: () => !!error.value && supervisors.value === undefined, reading: () => status.value === "pending", reread: () => void refresh() });

const columns = computed<TableColumn<SupervisorView>[]>(() => [
  { id: "supervisor", header: t("agents.label.column_supervisor"), meta: { class: { th: "w-full" } } },
  { id: "order", header: t("agents.label.order") },
  { id: "now", header: t("agents.label.column_now") },
  { id: "warming", header: t("agents.label.column_warming") },
  { id: "threshold", header: t("agents.label.column_threshold") },
  { id: "rooms", header: t("agents.label.column_rooms") },
  { id: "actions", header: "" }
]);

function aliasMatch(supervisor: SupervisorView) {
  return matchFields([{ label: t("agents.label.alias"), text: supervisor.aliases ?? "", shown: false }], props.query);
}

// What its last turn went out on: the provider's word, the model whole and its effort.
function nowText(supervisor: SupervisorView): string {
  return [supervisor.provider === null ? null : providerWord(providers.value, supervisor.provider), supervisor.model, supervisor.effort].filter((part) => part !== null && part !== "").join(" · ");
}

// Why a provider's warming cannot be switched here: it is turned off, or cannot answer on this machine.
function warmingBlock(provider: string): string | null {
  const held = providers.value?.find((one) => one.name === provider);

  if (held === undefined) return null;
  if (!held.enabled) return t("agents.label.provider_off");

  return held.reason;
}

// The providers of its order its prefix is kept warm on, by their words, in the order's order.
function warmedOf(supervisor: SupervisorView): string[] {
  return supervisor.order.filter((entry) => supervisor.warming[entry.provider] === true).map((entry) => providerWord(providers.value, entry.provider));
}

// The rooms a supervisor answers: a companion's sessions' rooms and every room made for companions that names it;
// the default answerer's every room that names no answerer of its own.
function roomsOf(supervisor: SupervisorView): string[] {
  const listed = rooms.value ?? [];

  if (supervisor.defaultAnswerer) return listed.filter((room) => (room.companions ?? []).length === 0).map((room) => room.title);

  const companion = companions.value?.find((one) => one.agent === supervisor.name);
  const titleOf = (chatId: number): string => listed.find((room) => room.chatId === chatId)?.title ?? String(chatId);

  return [...new Set([
    ...(companion?.sessions ?? []).map((session) => session.title ?? titleOf(session.chatId)),
    ...listed.filter((room) => (room.companions ?? []).includes(supervisor.name)).map((room) => room.title)
  ])];
}

/** One change of a supervisor sent; the table stands as the agency answered it, or the refusal with its field. */
async function change(name: string, body: { order?: OrderEntryView[]; quotaShare?: number; foldRatio?: number; warming?: Record<string, boolean> }): Promise<{ field: string | null; text: string } | null> {
  try {
    const answered = await $fetch<SupervisorView>(`/api/supervisors/${encodeURIComponent(name)}`, { method: "PATCH", body });

    supervisors.value = (supervisors.value ?? []).map((one) => (one.name === name ? answered : one));

    return null;
  } catch (failure) {
    return refusalOf(t, failure);
  }
}

async function saved(asked: Promise<{ field: string | null; text: string } | null>): Promise<string | null> {
  return (await asked)?.text ?? null;
}

const warmingBusy = ref("");

// A provider's warming switched as it is pressed, the supervisor's warming sent whole; a refusal is said in a notice.
async function switchWarming(supervisor: SupervisorView, provider: string, on: boolean): Promise<void> {
  warmingBusy.value = `${supervisor.name}:${provider}`;

  try {
    const refused = await change(supervisor.name, { warming: { ...supervisor.warming, [provider]: on } });

    if (refused !== null) island.say({ key: `warming:${supervisor.name}`, title: t("common.error.not_saved_named", { name: t("agents.label.column_warming") }), description: refused.text, tone: "error" });
  } finally {
    warmingBusy.value = "";
  }
}

const editing = ref("");
const editingOpen = ref(false);

function edit(name: string): void {
  editing.value = name;
  editingOpen.value = true;
}

async function rereadAll(): Promise<void> {
  await Promise.all([refresh(), rereadCompanions()]);
}

// A supervisor the console added stands with its removal; one the deployment seeds, the default answerer among them,
// stands with it disabled and saying why, as the agency's `seeded` answers it.
function removable(supervisor: SupervisorView): boolean {
  return supervisor.seeded || companions.value?.some((one) => one.agent === supervisor.name) === true;
}

// Its settings first, then its removal where it is one the console added or the deployment seeds.
function menuOf(supervisor: SupervisorView): DropdownMenuItem[] {
  const settings: DropdownMenuItem = { label: t("agents.action.settings"), icon: "i-material-symbols-settings-outline", onSelect: () => edit(supervisor.name) };

  if (!removable(supervisor)) return [settings];

  return [
    settings,
    {
      label: t("common.action.delete"),
      icon: "i-material-symbols-delete-outline",
      color: "error" as const,
      disabled: supervisor.seeded || removing.value !== "",
      ...(supervisor.seeded ? { description: t("agents.message.supervisor_seeded") } : {}),
      onSelect: () => void remove(supervisor)
    }
  ];
}

const removing = ref("");
const removeFailed = ref("");

// A removal is asked first, naming what goes and that the rooms it answered stay with their messages and documents.
async function remove(supervisor: SupervisorView): Promise<void> {
  const taken = await askFirst({ title: t("agents.message.companion_delete_confirm", { name: supervisor.label }), effect: t("agents.message.companion_delete_takes"), confirm: t("common.action.delete") });

  if (!taken) return;

  removing.value = supervisor.name;
  removeFailed.value = "";

  try {
    companions.value = await $fetch<CompanionView[]>("/api/companions/remove", { method: "POST", body: { agent: supervisor.name } });
    await refresh();
  } catch (failure) {
    removeFailed.value = failureText(failure, t("common.error.save_failed"));
  } finally {
    removing.value = "";
  }
}

// The add's fields, and the ones a refusal stands under.
const ADD_FIELDS = new Set(["name", "label", "worker", "repository", "room", "order", "provider", "model", "quotaShare"]);

interface SupervisorDraft {
  name: string;
  label: string;
  order: OrderEntryView[];
  quotaShare: number;
  repository: string;
  room: string;
}

function emptyDraft(): SupervisorDraft {
  return { name: "", label: "", order: [], quotaShare: DEFAULT_QUOTA_SHARE, repository: "", room: "" };
}

const adding = ref(false);
const addBusy = ref(false);
const draft = ref<SupervisorDraft>(emptyDraft());
const opened = ref(JSON.stringify(emptyDraft()));
const addDirty = computed(() => JSON.stringify(draft.value) !== opened.value);
const addComplete = computed(() =>
  draft.value.name.trim() !== "" && draft.value.label.trim() !== "" && draft.value.repository !== "" && draft.value.room.trim() !== "" && draft.value.order.length > 0 && draft.value.order.every((one) => one.model !== "")
);
const addRefusal = ref<{ field: string | null; text: string } | null>(null);
// A refusal of the order stands under the entry the agency names, the first where it names the provider or the model the
// room was made on.
const orderRefusal = computed(() => {
  const field = addRefusal.value?.field ?? "";

  if (addRefusal.value === null || !(field.startsWith("order") || ["provider", "model", "quotaShare"].includes(field))) return null;

  return { entry: field.startsWith("order") ? orderRefusalEntry(field) : 0, text: addRefusal.value.text };
});
const repositoryItems = computed(() => (repositories.value ?? []).map((one) => ({ label: one.label, value: one.name, description: one.name })));

function addErrorAt(field: string): string | undefined {
  return addRefusal.value?.field === field ? addRefusal.value.text : undefined;
}

// A new supervisor's order starts on the order of the default answerer, which it may change before it is added.
function openAdd(): void {
  const seed = supervisors.value?.find((one) => one.defaultAnswerer)?.order ?? [];

  draft.value = { ...emptyDraft(), order: seed.map((one) => ({ ...one })) };
  opened.value = JSON.stringify(draft.value);
  addRefusal.value = null;
  adding.value = true;
}

// An add whose name a removed companion's console room still stood under takes that room back with its record, and
// the notice says so and leads to it.
async function add(): Promise<void> {
  addBusy.value = true;
  addRefusal.value = null;

  try {
    const added = await $fetch<CompanionAdded>("/api/supervisors", { method: "POST", body: { ...draft.value, name: draft.value.name.trim(), label: draft.value.label.trim(), room: draft.value.room.trim() } });

    companions.value = added.companions;
    await refresh();

    if (added.room.takenBack) {
      island.say({ title: t("agents.status.companion_room_taken_back", { name: draft.value.label, title: draft.value.room }), to: `/rooms/${added.room.chatId}` });
    }

    opened.value = JSON.stringify(draft.value);
    adding.value = false;
  } catch (failure) {
    addRefusal.value = refusalOf(t, failure);
  } finally {
    addBusy.value = false;
  }
}

defineExpose({ openAdd, refresh });
</script>
