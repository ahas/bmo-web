<template>
  <!-- The agent settings, a section to a tab. The tab row carries the search over every section, the
       button that reads them all again and the open section's create; the section fills what is left, with one box that scrolls
       up and down: a tab of one table scrolls in the table's own box and the body around it stands
       still, while the agents' tab, the supervisors' table with the roles' agents under it, scrolls in the body,
       each table scrolling sideways in its own box with its head held at the body's top. The body keeps room at
       its foot for the create button where it floats on a phone. -->
  <UDashboardPanel id="catalogue" :ui="{ body: 'p-0 sm:p-0 gap-0 [&>*]:max-w-none' }">
    <template #header>
      <ConsoleTitleBar :title="$t('screens.label.agents')" icon="i-material-symbols-list-alt-outline" />

      <div :class="['flex h-12 shrink-0 items-center gap-2 ps-2 pe-4 sm:ps-4', TAB_ROW_LINE]">
        <UTabs
          :model-value="tab"
          :items="tabItems"
          :content="false"
          color="neutral"
          variant="link"
          size="sm"
          class="min-w-0 flex-1 self-stretch"
          :ui="TAB_ROW_UI"
          :aria-label="$t('agents.aria.settings_sections')"
          @update:model-value="(value: string | number) => setTab(String(value))"
        />

        <!-- The search: a box beside the tabs where there is room, a button opening the same search
             where there is not. -->
        <UPopover v-if="!narrow" v-model:open="resultsOpen" :content="{ align: 'end', onOpenAutoFocus: (event: Event) => event.preventDefault() }">
          <template #anchor>
            <UInput
              v-model="query"
              class="w-56 shrink-0 lg:w-64"
              size="sm"
              icon="i-material-symbols-search"
              :placeholder="$t('agents.placeholder.find_settings')"
              :aria-label="$t('agents.placeholder.find_settings')"
              @focus="resultsOpen = query.trim() !== ''"
              @update:model-value="resultsOpen = String($event).trim() !== ''"
              @keydown.enter.prevent="hits[0] && go(hits[0])"
              @keydown.escape="resultsOpen = false"
            />
          </template>

          <template #content>
            <SettingsResults class="w-80" :hits="hits" :query="query" @go="go" />
          </template>
        </UPopover>

        <UTooltip v-else :text="$t('agents.placeholder.find_settings')">
          <UButton
            class="shrink-0"
            size="sm"
            color="neutral"
            variant="ghost"
            icon="i-material-symbols-search"
            :aria-label="$t('agents.placeholder.find_settings')"
            @click="searchOpen = true"
          />
        </UTooltip>

        <UTooltip :text="$t('common.action.refresh')">
          <UButton
            class="shrink-0"
            size="sm"
            color="neutral"
            variant="ghost"
            icon="i-material-symbols-refresh"
            :loading="rereading"
            :aria-label="$t('common.action.refresh')"
            @click="reread"
          />
        </UTooltip>

        <!-- The open section's own create, the screen's create button, stands last, where the reader may write it. -->
        <UTheme v-if="mayWriteCurrent && addLabel !== null" :props="TAB_ROW_BUTTONS">
          <CreateButton :label="addLabel" data-tab-add @click="section?.openAdd?.()" />
        </UTheme>
      </div>
    </template>

    <template #body>
      <div ref="body" class="flex min-h-0 min-w-0 flex-1 flex-col" :class="[tab === 'supervisors' ? 'overflow-x-hidden overflow-y-auto' : 'overflow-hidden', mayWriteCurrent ? 'pb-(--bmo-create-room)' : '']">
        <AgentsSupervisors v-if="tab === 'supervisors'" ref="section" :query="query" :readonly="!mayWriteCurrent" />
        <AgentsRoles v-else-if="tab === 'roles'" ref="section" :query="query" :readonly="!mayWriteCurrent" />
        <AgentsRepositories v-else-if="tab === 'repositories'" ref="section" :query="query" :readonly="!mayWriteCurrent" />
        <AgentsRegistry v-else-if="tab === 'models'" ref="section" :query="query" :readonly="!mayWriteCurrent" />
        <AgentsCatalogue v-else ref="section" :query="query" :readonly="!mayWriteCurrent" />
      </div>

      <SettingsDialog v-model:open="searchOpen" :title="$t('agents.placeholder.find_settings')">
        <UInput v-model="query" class="w-full" icon="i-material-symbols-search" :placeholder="$t('agents.placeholder.find_settings')" :aria-label="$t('agents.placeholder.find_settings')" autofocus />
        <SettingsResults :hits="hits" :query="query" @go="go" />
      </SettingsDialog>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { useListPlace } from "bmo-ui/app/domain/list-place";
import { useNarrow } from "bmo-ui/app/domain/screen";
import { scrollWithin } from "bmo-ui/app/domain/scroll-within";
import { TAB_ROW_LINE, TAB_ROW_UI } from "bmo-ui/app/domain/tabs";

import { AGENT_TABS, isAgentTab, searchSettings, settingsAnchor } from "~/domain/agent-settings";
import { ensureSectionAccess, useSectionAccess, useSectionAccessReady } from "~/domain/section-access";
import { useHeldHeads } from "~/domain/held-heads";
import { mayRead, mayWrite } from "#shared/sections";
import { usedByText, registrationName } from "~/domain/registry";
import { defaultThreshold, sessionsText, thresholdText, entryText, useProviders } from "~/domain/axes";
import { TAB_ROW_BUTTONS } from "~/domain/tab-create";

import type { AgentTab, SettingsEntry, SettingsHit } from "~/domain/agent-settings";
import type { TabCreate } from "~/domain/tab-create";
import type { CatalogueView, ModelPage } from "#shared/agency";
import type { RepositoryView, RolesView, SupervisorView } from "#shared/axes";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

// An agent's own screen is opened from this one and led back to. Which tab stood open is in the
// address already; the scroll is what a return would otherwise lose.
const bodyRef = useTemplateRef<HTMLElement>("body");

useListPlace("agents", () => bodyRef.value);
const narrow = useNarrow();

// A tab opens where its own section reads and changes where its own section writes (docs/web.md, 「Access」);
// the administrator passes every part. The parts not read stand in no tab row and send no read.
const access = useSectionAccess();
const accessReady = useSectionAccessReady();

if (!accessReady.value) await ensureSectionAccess().catch(() => null);

function readable(section: AgentTab): boolean {
  return !accessReady.value || mayRead(access.value, section);
}

function writable(section: AgentTab): boolean {
  return !accessReady.value || mayWrite(access.value, section);
}

const readableTabs = computed(() => AGENT_TABS.filter((one) => readable(one.value)));
const tab = computed<AgentTab>(() => {
  const asked = isAgentTab(route.query.tab) ? route.query.tab : null;

  if (asked !== null && readableTabs.value.some((one) => one.value === asked)) return asked;

  return readableTabs.value[0]?.value ?? "supervisors";
});
const mayWriteCurrent = computed(() => writable(tab.value));
// The supervisors' tab holds its tables one under another in the body, each head held at the body's top.
useHeldHeads(() => (tab.value === "supervisors" ? bodyRef.value : null));
const tabItems = computed(() => readableTabs.value.map((one) => ({ ...one, label: t(one.label) })));

// An address naming a tab the reader may not open is moved to the first one they may, with no step of the history.
watch(
  readableTabs,
  (list) => {
    if (!import.meta.client) return;

    const asked = isAgentTab(route.query.tab) ? route.query.tab : null;
    const first = list[0];

    if (asked === null || first === undefined || list.some((one) => one.value === asked)) return;

    void router.replace({ query: { ...route.query, tab: addressOf(first.value) } });
  },
  { immediate: true }
);

// The section stands in the address, and moving to another is a step of the history; the first is the screen's own.
function addressOf(next: AgentTab): string | undefined {
  return next === AGENT_TABS[0].value ? undefined : next;
}

function setTab(next: string): void {
  if (!isAgentTab(next) || next === tab.value) return;

  void router.push({ query: { ...route.query, tab: addressOf(next) } });
}

// The open section's own create, which it names and opens itself.
const section = useTemplateRef<TabCreate>("section");
const addLabel = computed(() => section.value?.addLabel ?? null);

// Every section's read, under the keys the sections read them by, so the search looks over all of them at once.
// Only the parts the reader may read are asked for; the rest answer a member as absent.
const { data: supervisors } = useFetch<SupervisorView[]>("/api/supervisors", { key: "supervisors", lazy: true, server: false, immediate: readable("supervisors") });
const { data: roles } = useFetch<RolesView>("/api/roles", { key: "roles", lazy: true, server: false, immediate: readable("roles") });
const { data: repositories } = useFetch<RepositoryView[]>("/api/repositories", { key: "repositories", lazy: true, server: false, immediate: readable("repositories") });
const { data: models } = useFetch<ModelPage>("/api/models", { key: "models", lazy: true, server: false, immediate: readable("models") });
const { data: catalogue } = useFetch<CatalogueView>("/api/model-catalogue", { key: "model-catalogue", lazy: true, server: false, immediate: readable("model-files") });
const { data: providers } = useProviders();

// The keys the button reads again: only the parts the reader may read, beside the providers every part's chooser
// reads, so a change never asks a part the reader may not open.
const READS = computed(() => [
  ...(readable("supervisors") ? ["supervisors"] : []),
  ...(readable("roles") ? ["roles"] : []),
  ...(readable("repositories") ? ["repositories"] : []),
  ...(readable("models") ? ["models"] : []),
  ...(readable("model-files") ? ["model-catalogue"] : []),
  "agency-providers"
]);
const rereading = ref(false);

async function reread(): Promise<void> {
  rereading.value = true;

  try {
    await refreshNuxtData(READS.value);
  } finally {
    rereading.value = false;
  }
}

// The settings search, over every section at once.
const query = ref("");
const resultsOpen = ref(false);
const searchOpen = ref(false);

const entries = computed<SettingsEntry[]>(() => {
  const list: SettingsEntry[] = [];

  for (const one of supervisors.value ?? []) {
    list.push({
      id: `supervisor-${one.name}`,
      tab: "supervisors",
      label: one.label,
      fields: [
        { label: t("common.label.name"), text: one.label, shown: true },
        { label: t("agents.label.key"), text: one.name, shown: true },
        { label: t("agents.label.order"), text: one.order.map((entry) => entryText(providers.value, entry)).join(" "), shown: true },
        { label: t("agents.label.column_threshold"), text: thresholdText(t, one.foldRatio, defaultThreshold(providers.value, one.order)), shown: true },
        { label: t("agents.label.alias"), text: one.aliases, shown: false }
      ]
    });
  }

  for (const role of roles.value?.roles ?? []) {
    list.push({
      id: `role-${role.name}`,
      tab: "roles",
      label: t("agents.label.find_role", { name: role.name }),
      fields: [
        { label: t("common.label.name"), text: role.name, shown: true },
        { label: t("agents.label.column_bundles"), text: role.bundles.map((one) => one.label).join(" "), shown: true },
        { label: t("agents.label.run_line"), text: role.line, shown: true }
      ]
    });
  }

  for (const repository of repositories.value ?? []) {
    list.push({
      id: `repository-${repository.name}`,
      tab: "repositories",
      label: repository.label,
      fields: [
        { label: t("common.label.name"), text: repository.label, shown: true },
        { label: t("agents.label.key"), text: repository.name, shown: true },
        { label: t("common.label.path"), text: repository.path, shown: true },
        { label: t("agents.label.preamble"), text: repository.preamble, shown: false }
      ]
    });
  }

  for (const one of models.value?.items ?? []) {
    const name = registrationName(one.key);

    list.push({
      id: `registry-${name}`,
      tab: "models",
      label: t("agents.label.find_registration", { name }),
      fields: [
        { label: t("common.label.name"), text: name, shown: true },
        { label: t("common.label.model"), text: one.model, shown: true },
        { label: t("agents.label.used_by"), text: (one.usedBy ?? []).map((used) => usedByText(t, used)).join(" "), shown: true }
      ]
    });
  }

  for (const entry of catalogue.value?.entries ?? []) {
    list.push({
      id: `catalogue-${entry.name}`,
      tab: "model-files",
      label: entry.label,
      fields: [
        { label: t("common.label.name"), text: entry.label, shown: true },
        { label: t("agents.label.key"), text: entry.name, shown: true },
        { label: t("agents.label.engine"), text: entry.engine, shown: true }
      ]
    });
  }

  return list;
});

const hits = computed<SettingsHit[]>(() => searchSettings(t, entries.value, query.value).slice(0, 40));

// A result pressed: its section comes up, and its row is brought into view and marked a moment.
async function go(hit: SettingsHit): Promise<void> {
  resultsOpen.value = false;
  searchOpen.value = false;

  if (hit.entry.tab !== tab.value) {
    await router.push({ query: { ...route.query, tab: addressOf(hit.entry.tab) } });
  }

  for (let turn = 0; turn < 20; turn++) {
    await nextTick();

    const target = document.getElementById(settingsAnchor(hit.entry.id));

    if (target !== null) {
      scrollWithin(target, "center");
      // The row is marked at once and holds the mark a moment, then lets it go on the shared unfold length.
      target.classList.add("settings-hit");
      setTimeout(() => target.classList.remove("settings-hit"), SETTINGS_HIT_HOLD_MS);

      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

// How long a found row holds its mark before letting it go: a stay, not a movement, so it is no motion length.
const SETTINGS_HIT_HOLD_MS = 1_200;
</script>
