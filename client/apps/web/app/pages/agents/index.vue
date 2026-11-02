<template>
  <!-- The agent settings, a section to a tab. The tab row carries the search over every section and
       the button that reads them all again; the section fills what is left and scrolls on its own. -->
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

        <!-- The open section's own action stands first, at the right end of the row. -->
        <UTooltip :text="addLabel">
          <UButton class="shrink-0" size="sm" color="neutral" variant="ghost" icon="i-material-symbols-add" :aria-label="addLabel" data-tab-add @click="openAdd" />
        </UTooltip>

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
      </div>
    </template>

    <template #body>
      <div ref="body" class="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <AgentsSupervisors v-if="tab === 'supervisors'" ref="supervisorsRef" :query="query" />
        <AgentsRoles v-else-if="tab === 'roles'" ref="rolesRef" :query="query" />
        <AgentsRepositories v-else-if="tab === 'repositories'" ref="repositoriesRef" :query="query" />
        <AgentsRegistry v-else-if="tab === 'models'" ref="registryRef" :query="query" />
        <AgentsCatalogue v-else ref="catalogueRef" :query="query" />
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
import { usedByText, registrationName } from "~/domain/registry";
import { draftKeyId, draftKeyLabel, draftListText } from "~/domain/draft-process";
import { sessionsText, thresholdText, entryText, useProviders } from "~/domain/axes";

import type { AgentTab, SettingsEntry, SettingsHit } from "~/domain/agent-settings";
import type { CatalogueView, ModelPage } from "#shared/agency";
import type { RepositoryView, RolesView, SupervisorView } from "#shared/axes";
import type { DraftProcessesView } from "#shared/drafting";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

// An agent's own screen is opened from this one and led back to. Which tab stood open is in the
// address already; the scroll is what a return would otherwise lose.
const bodyRef = useTemplateRef<HTMLElement>("body");

useListPlace("agents", () => bodyRef.value);
const narrow = useNarrow();

const tab = computed<AgentTab>(() => (isAgentTab(route.query.tab) ? route.query.tab : "supervisors"));
const tabItems = AGENT_TABS.map((one) => ({ ...one, label: t(one.label) }));

// The section stands in the address, and moving to another is a step of the history; the first is the screen's own.
function addressOf(next: AgentTab): string | undefined {
  return next === AGENT_TABS[0].value ? undefined : next;
}

function setTab(next: string): void {
  if (!isAgentTab(next) || next === tab.value) return;

  void router.push({ query: { ...route.query, tab: addressOf(next) } });
}

// Each section's own add, which the tab row's button opens.
const supervisorsRef = useTemplateRef<{ openAdd: () => void }>("supervisorsRef");
const rolesRef = useTemplateRef<{ openAdd: () => void }>("rolesRef");
const repositoriesRef = useTemplateRef<{ openAdd: () => void }>("repositoriesRef");
const registryRef = useTemplateRef<{ openAdd: () => void }>("registryRef");
const catalogueRef = useTemplateRef<{ openAdd: () => void }>("catalogueRef");

const ADD_LABELS: Record<AgentTab, string> = {
  supervisors: "agents.title.supervisor_add",
  roles: "agents.title.role_add",
  repositories: "agents.title.repository_add",
  models: "agents.title.registry_add",
  "model-files": "agents.title.catalogue_add"
};

const addLabel = computed(() => t(ADD_LABELS[tab.value]));

function openAdd(): void {
  const section = { supervisors: supervisorsRef, roles: rolesRef, repositories: repositoriesRef, models: registryRef, "model-files": catalogueRef }[tab.value];

  section.value?.openAdd();
}

// Every section's read, under the keys the sections read them by, so the search looks over all of them at once.
const { data: supervisors } = useFetch<SupervisorView[]>("/api/supervisors", { key: "supervisors", lazy: true, server: false });
const { data: roles } = useFetch<RolesView>("/api/roles", { key: "roles", lazy: true, server: false });
const { data: repositories } = useFetch<RepositoryView[]>("/api/repositories", { key: "repositories", lazy: true, server: false });
const { data: models } = useFetch<ModelPage>("/api/models", { key: "models", lazy: true, server: false });
const { data: catalogue } = useFetch<CatalogueView>("/api/model-catalogue", { key: "model-catalogue", lazy: true, server: false });
const { data: draftProcesses } = useFetch<DraftProcessesView>("/api/draft-processes", { key: "draft-processes", lazy: true, server: false });
const { data: providers } = useProviders();

const READS = ["supervisors", "companions", "roles", "repositories", "models", "model-catalogue", "draft-processes", "agency-providers"];
const rereading = ref(false);

async function reread(): Promise<void> {
  rereading.value = true;

  try {
    await refreshNuxtData(READS);
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
        { label: t("agents.label.column_threshold"), text: thresholdText(one.foldRatio), shown: true },
        { label: t("agents.label.alias"), text: one.aliases, shown: false }
      ]
    });
  }

  for (const row of draftProcesses.value?.rows ?? []) {
    list.push({
      id: `draft-${draftKeyId(row)}`,
      tab: "supervisors",
      label: t("agents.label.find_draft_process", { key: draftKeyLabel(t, row) }),
      fields: [
        { label: t("agents.label.draft_rounds"), text: draftListText(t, row.rounds), shown: true },
        { label: t("agents.label.draft_light"), text: draftListText(t, row.light), shown: true }
      ]
    });
  }

  for (const question of draftProcesses.value?.questions ?? []) {
    list.push({
      id: `draft-question-${question.name}`,
      tab: "supervisors",
      label: t("agents.label.find_draft_question", { name: question.name }),
      fields: [{ label: t("common.label.name"), text: question.name, shown: true }, { label: t("agents.label.draft_question_text"), text: question.text, shown: true }]
    });
  }

  for (const role of roles.value?.roles ?? []) {
    list.push({
      id: `role-${role.name}`,
      tab: "roles",
      label: t("agents.label.find_role", { name: role.shown }),
      fields: [
        { label: t("common.label.name"), text: role.shown, shown: true },
        { label: t("agents.label.key"), text: role.name, shown: true },
        { label: t("agents.label.column_bundles"), text: role.bundles.map((one) => one.label).join(" "), shown: true },
        { label: t("agents.label.column_sessions"), text: sessionsText(t, role.sessions), shown: true },
        { label: t("agents.label.role_label"), text: role.label, shown: false }
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
