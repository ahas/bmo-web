<template>
  <!-- The supervisors (docs/web.md, 「Agent management screen」, the supervisors tab; the agency's docs/supervisors.md): one row each
       in the agency's order, every value a cell of its own that saves it, the row's own presses at its trailing edge;
       under the table the agents of the roles. A supervisor's draft process stands in its settings dialog. -->
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

    <!-- The default answerer, the supervisor that answers every room naming none, as the receiver's setting holds it:
         every supervisor offered, the one it names chosen; a choice is saved as it is made. -->
    <div v-if="supervisors !== undefined && supervisors.length > 0" class="px-4">
      <SettingsRow :label="$t('agents.label.default_answerer')">
        <ChoiceSelect
          :model-value="answerer"
          :items="answererItems"
          value-key="value"
          class="w-48"
          :disabled="answererBusy || props.readonly"
          :aria-label="$t('agents.label.default_answerer')"
          data-default-answerer
          @update:model-value="(value: string) => void chooseAnswerer(value)"
        />
      </SettingsRow>
      <p v-if="answererFailure !== ''" role="alert" class="break-words pb-3 text-sm text-error">{{ answererFailure }}</p>
    </div>

    <!-- The tab's body scrolls up and down around every table of the tab; each table scrolls sideways in its own box,
         and the screen holds its head at the body's top while its rows pass under it. -->
    <SettingsTable v-if="supervisors !== undefined && supervisors.length > 0" data-supervisors-table :data="supervisors" :columns="columns" :row-key="(row: SupervisorView) => row.name">
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

      <!-- What the supervisor is doing now: the rooms its turns run in, read from the console's stream, and a dash until
           the stream has handed the bot's picture. -->
      <template #state-cell="{ row }">
        <AgentStateCell :doings="doingsOf(row.original.name)" :known="turns !== null" :now="now * 1000" @open="openLog(row.original.name)" />
      </template>

      <template #road-cell="{ row }">
        <SupervisorRoadCell :road="row.original.road" :name="row.original.label" :disabled="props.readonly" :runs-as-owner="row.original.runsAsOwner" :save="(road) => change(row.original.name, { road })" />
      </template>

      <!-- Its road's provider where its prefix is kept warm there; pressed, that provider's switch, taking effect as it
           is thrown. -->
      <template #warming-cell="{ row }">
        <SettingsPopoverCell :label="$t('agents.aria.warming_cell_of', { name: row.original.label })" :disabled="props.readonly" :busy="warmingBusy.startsWith(`${row.original.name}:`)">
          <span v-if="warmedOf(row.original).length === 0" class="whitespace-nowrap text-sm text-muted">{{ $t("agents.label.switch_off") }}</span>
          <span v-else class="max-w-full truncate text-sm text-highlighted">{{ warmedOf(row.original).join(" · ") }}</span>

          <template #content>
            <ul class="flex min-w-0 flex-col" :aria-label="$t('agents.label.column_warming')">
              <li v-for="entry in roadOf(row.original)" :key="entry.provider" class="flex min-h-10 items-center justify-between gap-4 text-sm">
                <span class="whitespace-nowrap text-toned">{{ providerWord(providers, entry.provider) }}</span>
                <HintTip :text="warmingBlock(entry.provider) ?? undefined" :disabled="warmingBlock(entry.provider) === null">
                  <USwitch
                    :model-value="row.original.warming[entry.provider] === true"
                    :loading="warmingBusy === `${row.original.name}:${entry.provider}`"
                    :disabled="warmingBusy !== '' || warmingBlock(entry.provider) !== null || props.readonly"
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
          :disabled="props.readonly"
          :min="1"
          :max="100"
          :step="1"
          :save="(value: string) => saved(change(row.original.name, { foldRatio: fractionOf(Number(value)) }))"
        >
          <span class="text-sm tabular-nums text-highlighted">{{ thresholdText($t, row.original.foldRatio, defaultThreshold(providers, row.original.road?.provider ?? null)) }}</span>
        </SettingsInputCell>
      </template>

      <template #rooms-cell="{ row }">
        <span :class="CELL_TEXT" class="w-full text-sm">
          <span v-if="roomsOf(row.original).length === 0" class="text-muted">—</span>
          <span v-else class="truncate text-highlighted">{{ roomsOf(row.original).join(" · ") }}</span>
        </span>
      </template>

      <template v-if="!props.readonly" #actions-cell="{ row }">
        <span class="flex h-full min-h-12 items-center justify-end pe-2">
          <UDropdownMenu :items="menuOf(row.original)" :content="{ align: 'end' }">
            <UTooltip :text="$t('common.aria.menu_of', { name: row.original.label })">
              <UButton color="neutral" variant="ghost" size="sm" icon="i-material-symbols-more-vert" :loading="removing === row.original.name" :aria-label="$t('common.aria.menu_of', { name: row.original.label })" />
            </UTooltip>
          </UDropdownMenu>
        </span>
      </template>
    </SettingsTable>

    <p v-if="removeFailed !== ''" role="alert" class="px-4 py-2 break-words text-sm text-error">{{ removeFailed }}</p>

    <!-- The agents of the roles stand under the supervisors: every agent of the screen in the one tab. -->
    <AgentsRoleAgents class="mt-6" :query="props.query" :readonly="props.readonly" />

    <AgentLogDialog v-if="log !== null" v-model:open="logOpen" :name="log.name" :place="log.place" :rooms="rooms ?? []" />

    <SupervisorSettingsDialog v-if="editing !== ''" v-model:open="editingOpen" :name="editing" :reread="rereadAll" />

    <!-- A supervisor added by its name, label, the title of the console room it answers alone, its road's provider and
         model and its repository; a refusal stands under the field it names. -->
    <SettingsDialog v-model:open="adding" wide :title="$t('agents.title.supervisor_add')" :dirty="addChanges">
      <form id="supervisor-add-form" class="flex flex-col gap-4" @submit.prevent="void add()">
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField :label="$t('common.label.name')" name="name" :error="addErrorAt('name')">
            <UInput v-model="draft.name" class="w-full font-mono" :aria-label="$t('common.label.name')" />
          </UFormField>
          <UFormField :label="$t('agents.label.display_name')" name="label" :error="addErrorAt('label')">
            <UInput v-model="draft.label" class="w-full" :aria-label="$t('agents.label.display_name')" />
          </UFormField>
        </div>

        <UFormField :label="$t('agents.label.room_title')" name="room" :error="addErrorAt('room')">
          <UInput v-model="draft.room" class="w-full" :aria-label="$t('agents.label.room_title')" />
        </UFormField>

        <RoadField v-model="draft.road" :line="SUPERVISOR_LINE" :whole="false" :refusal="addRefusal" :disabled="addBusy" :runs-as-owner="owner.owner" />

        <UFormField :label="$t('agents.label.work_repository')" name="repository" :error="addErrorAt('repository')">
          <ChoiceSelect v-model="draft.repository" :items="repositoryItems" value-key="value" class="w-full sm:w-1/2" :aria-label="$t('agents.label.work_repository')" />
        </UFormField>

        <p v-if="addRefusal !== null && !ADD_FIELDS.has(addRefusal.field ?? '')" role="alert" class="break-words text-sm text-error">{{ addRefusal.text }}</p>
      </form>

      <template #footer="{ close }">
        <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="addBusy" @click="close()" />
        <UButton type="submit" form="supervisor-add-form" :label="$t('common.action.add')" :loading="addBusy" :disabled="addBusy || !addComplete" />
      </template>
    </SettingsDialog>
  </section>
</template>

<script setup lang="ts">
import { useOpenedWith } from "bmo-ui/app/domain/form-save";
import { matchFields } from "bmo-ui/shared/search";
import { tableHeaders } from "bmo-ui/app/domain/column-widths";
import { failureText } from "bmo-ui/app/domain/errors";
import { useIsland } from "bmo-ui/app/domain/island";
import { useNowSeconds } from "bmo-ui/app/domain/time";

import { settingsAnchor } from "~/domain/agent-settings";
import { STATE_CEILING, turnsDoing } from "~/domain/agent-state";
import { useSectionAccess } from "~/domain/section-access";
import { mayRead } from "#shared/sections";
import { defaultThreshold, emptyRoad, fractionOf, percentOf, providerWord, refusalOf, SUPERVISOR_LINE, thresholdText, useProviders } from "~/domain/axes";
import { agentMetaOf, roomTitle } from "~/domain/agents";
import { useAgentCatalogue } from "~/domain/catalogue";
import { useConfirm } from "~/domain/confirm";
import { useReadFailure, useSupervisorTurns } from "~/domain/events";
import { useRoomList } from "~/domain/room-list";
import { CELL_TEXT } from "~/domain/settings-cells";

import type { DefaultAnswererView, RepositoryView, RoadView, SupervisorAddedView, SupervisorView } from "#shared/axes";
import type { OwnerChat } from "#shared/types";
import type { DropdownMenuItem } from "@nuxt/ui";
import type { AgentDoing } from "~/domain/agent-state";
import type { LogPlace } from "~/domain/log";
import type { SettingsColumn } from "~/domain/settings-columns";

const props = withDefaults(defineProps<{ query?: string; readonly?: boolean }>(), { query: "", readonly: false });
const { t } = useI18n();
const island = useIsland(t);
const askFirst = useConfirm();

// The mark a supervisor stands under where the agency names none of its own.
const SUPERVISOR_ICON = "i-material-symbols-chat-bubble-outline";

// The page's search reads the same answers under the same keys.
const { data: supervisors, error, refresh, status } = useFetch<SupervisorView[]>("/api/supervisors", { key: "supervisors", lazy: true, server: false });
// Whether the one signed in is the owner's login: a supervisor they add is filed under the owner's account, or under
// none, and so runs as the owner's own user.
const { data: owner } = useFetch<OwnerChat>("/api/owner", { key: "owner", default: () => ({ chatId: null, senderId: null, senders: [], administrator: false, owner: false }) });
// A supervisor's repository chooser reads the repositories tab, which this reader may not read.
const access = useSectionAccess();
const { data: repositories } = useFetch<RepositoryView[]>("/api/repositories", { key: "repositories", lazy: true, server: false, immediate: mayRead(access.value, "repositories") });
const { data: providers } = useProviders();
const { data: rooms, refresh: rereadRooms } = useRoomList();
const { agents: catalogue, refresh: rereadCatalogue } = useAgentCatalogue();
const readFailure = useReadFailure({ failed: () => !!error.value && supervisors.value === undefined, reading: () => status.value === "pending", reread: () => void refresh() });

const columns = computed<SettingsColumn<SupervisorView>[]>(() => [
  { id: "supervisor", header: t("agents.label.column_supervisor") },
  { id: "state", header: t("agents.label.column_state"), ceiling: STATE_CEILING },
  { id: "road", header: t("agents.label.column_road"), ceiling: 256 },
  { id: "warming", header: t("agents.label.column_warming") },
  { id: "threshold", header: t("agents.label.column_threshold") },
  { id: "rooms", header: t("agents.label.column_rooms"), ceiling: 288 },
  ...(props.readonly ? [] : [{ id: "actions", header: "" }])
]);

// What each supervisor is doing now: the rooms its turns run in, from the console's stream, and how long ticking each
// second.
const turns = useSupervisorTurns();
const { now } = useNowSeconds(1_000);

// Its turns as the one thing it is doing, its rooms on one line; nothing where it runs none.
function doingsOf(name: string): AgentDoing[] {
  const doing = doingOf(name);

  return doing === null ? [] : [doing];
}

function doingOf(name: string): AgentDoing | null {
  return turnsDoing(t, turns.value?.get(name) ?? [], (chatId) => roomTitle(t, rooms.value ?? [], chatId));
}

// A working supervisor opens its own log at its earliest running turn, in that turn's room; an idle one opens nothing.
const log = ref<{ name: string; place: LogPlace | null } | null>(null);
const logOpen = ref(false);

function openLog(name: string): void {
  const doing = doingOf(name);

  if (doing === null) return;

  log.value = { name, place: doing.place };
  logOpen.value = true;
}

function aliasMatch(supervisor: SupervisorView) {
  return matchFields([{ label: t("agents.label.alias"), text: supervisor.aliases ?? "", shown: false }], props.query);
}

// Why a provider's warming cannot be switched here: it is turned off, or cannot answer on this machine.
function warmingBlock(provider: string): string | null {
  const held = providers.value?.find((one) => one.name === provider);

  if (held === undefined) return null;
  if (!held.enabled) return t("agents.label.provider_off");

  return held.reason;
}

// Its road as the one provider its warming is switched for, none where it names no road.
function roadOf(supervisor: SupervisorView): RoadView[] {
  return supervisor.road === null ? [] : [supervisor.road];
}

// Its road's provider by its word where its prefix is kept warm there.
function warmedOf(supervisor: SupervisorView): string[] {
  return roadOf(supervisor).filter((road) => supervisor.warming[road.provider] === true).map((road) => providerWord(providers.value, road.provider));
}

// The rooms a supervisor answers, as the sidebar lists them under it (docs/web.md, 「Sidebar」), by their names.
function roomsOf(supervisor: SupervisorView): string[] {
  return agentMetaOf(t, supervisor.name, catalogue.value.agents, rooms.value ?? []).sessions.map((session) => session.label);
}

/** One change of a supervisor sent; the table stands as the agency answered it, or the refusal with its field. */
async function change(name: string, body: { road?: RoadView; foldRatio?: number; warming?: Record<string, boolean> }): Promise<{ field: string | null; text: string } | null> {
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

// The default answerer chosen among every supervisor, each under its own label with its name under it, and no other
// entry; a choice the receiver refuses goes back, its reason under the row.
const answererBusy = ref(false);
const answererFailure = ref("");
const answerer = computed(() => supervisors.value?.find((one) => one.defaultAnswerer)?.name);
const answererItems = computed(() => (supervisors.value ?? []).map((one) => ({ label: one.label, value: one.name, description: one.name })));

async function chooseAnswerer(name: string): Promise<void> {
  if (name === answerer.value) return;

  answererBusy.value = true;
  answererFailure.value = "";

  try {
    await $fetch<DefaultAnswererView>("/api/default-answerer", { method: "PUT", body: { supervisor: name } });
    await rereadAll();
  } catch (failure) {
    answererFailure.value = failureText(failure, t("agents.error.default_answerer_failed"));
  } finally {
    answererBusy.value = false;
  }
}

const editing = ref("");
const editingOpen = ref(false);

function edit(name: string): void {
  editing.value = name;
  editingOpen.value = true;
}

async function rereadAll(): Promise<void> {
  await Promise.all([refresh(), rereadCatalogue(), rereadRooms()]);
}

// Its settings first, then its removal, which stands disabled, saying why, for one the deployment seeds — as the
// agency's `seeded` answers it — and for the default answerer, which the receiver refuses to remove.
function menuOf(supervisor: SupervisorView): DropdownMenuItem[] {
  return [
    { label: t("agents.action.settings"), icon: "i-material-symbols-settings-outline", onSelect: () => edit(supervisor.name) },
    {
      label: t("common.action.delete"),
      icon: "i-material-symbols-delete-outline",
      color: "error" as const,
      disabled: supervisor.seeded || supervisor.defaultAnswerer || removing.value !== "",
      ...(supervisor.seeded
        ? { description: t("agents.message.supervisor_seeded") }
        : supervisor.defaultAnswerer
          ? { description: t("agents.message.supervisor_is_default_answerer") }
          : {}),
      onSelect: () => void remove(supervisor)
    }
  ];
}

const removing = ref("");
const removeFailed = ref("");

// A removal is asked first, naming what goes and that the rooms it answered stay with their messages and documents.
async function remove(supervisor: SupervisorView): Promise<void> {
  const taken = await askFirst({ title: t("agents.message.supervisor_delete_confirm", { name: supervisor.label }), effect: t("agents.message.supervisor_delete_takes"), confirm: t("common.action.delete") });

  if (!taken) return;

  removing.value = supervisor.name;
  removeFailed.value = "";

  try {
    await $fetch(`/api/supervisors/${encodeURIComponent(supervisor.name)}`, { method: "DELETE" });
    await rereadAll();
  } catch (failure) {
    removeFailed.value = failureText(failure, t("common.error.save_failed"));
  } finally {
    removing.value = "";
  }
}

// The add's fields, and the ones a refusal stands under.
const ADD_FIELDS = new Set(["name", "label", "room", "repository", "provider", "model"]);

interface SupervisorDraft {
  name: string;
  label: string;
  // The title of the console room it answers alone.
  room: string;
  // Its road's provider and model, the rest of the road standing as the provider's own until its row sets it.
  road: RoadView;
  repository: string;
}

function emptyDraft(): SupervisorDraft {
  return { name: "", label: "", room: "", road: emptyRoad(), repository: "" };
}

const adding = ref(false);
const addBusy = ref(false);
const draft = ref<SupervisorDraft>(emptyDraft());
const addChanges = useOpenedWith(() => draft.value, { open: adding });
const addComplete = computed(() =>
  draft.value.name.trim() !== "" && draft.value.label.trim() !== "" && draft.value.room.trim() !== "" && draft.value.repository !== "" && draft.value.road.provider !== "" && draft.value.road.model !== ""
);
const addRefusal = ref<{ field: string | null; text: string } | null>(null);
const repositoryItems = computed(() => (repositories.value ?? []).map((one) => ({ label: one.label, value: one.name, description: one.name })));

function addErrorAt(field: string): string | undefined {
  return addRefusal.value?.field === field ? addRefusal.value.text : undefined;
}

// A new supervisor's road starts on the provider and model of the default answerer's, which it may change before it is
// added.
function openAdd(): void {
  if (props.readonly) return;

  const seed = supervisors.value?.find((one) => one.defaultAnswerer)?.road ?? null;

  draft.value = { ...emptyDraft(), road: seed === null ? emptyRoad() : { ...emptyRoad(), provider: seed.provider, model: seed.model } };
  addRefusal.value = null;
  adding.value = true;
}

// An add registers the supervisor whole, or nothing of it where any part is refused.
async function add(): Promise<void> {
  addBusy.value = true;
  addRefusal.value = null;

  try {
    const label = draft.value.label.trim();
    const title = draft.value.room.trim();
    const added = await $fetch<SupervisorAddedView>("/api/supervisors", { method: "POST", body: { ...draft.value, name: draft.value.name.trim(), label, room: title } });

    // What was added holds no change from here on, so nothing while the lists are read again asks to throw it away.
    await addChanges.take();
    await rereadAll();
    // A console room already standing under the title was taken back rather than made anew, and the owner is told so.
    if (added.takenBack) island.say({ key: `room-taken-back:${added.name}`, title: t("agents.message.supervisor_room_taken_back", { label, title }) });

    adding.value = false;
  } catch (failure) {
    addRefusal.value = refusalOf(t, failure);
  } finally {
    addBusy.value = false;
  }
}

// The tab row's add names this section's add by its word and opens it.
defineExpose({ addLabel: computed(() => t("agents.title.supervisor_add")), openAdd, refresh });
</script>
