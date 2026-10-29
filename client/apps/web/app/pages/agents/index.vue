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
        <!-- The General tab adds five things, so its Add button opens a menu of them. -->
        <UDropdownMenu v-if="tab === 'general' && generalReady" :items="generalAddItems" :content="{ align: 'end' }">
          <UTooltip :text="$t('common.action.add')">
            <UButton class="shrink-0" size="sm" color="neutral" variant="ghost" icon="i-material-symbols-add" :aria-label="$t('common.action.add')" />
          </UTooltip>
        </UDropdownMenu>

        <UTooltip v-else-if="tab === 'workers'" :text="$t('agents.title.worker_add')">
          <UButton class="shrink-0" size="sm" color="neutral" variant="ghost" icon="i-material-symbols-add" :aria-label="$t('agents.title.worker_add')" @click="workersRef?.openAdd()" />
        </UTooltip>

        <UTooltip v-else-if="tab === 'companions'" :text="$t('agents.title.companion_add')">
          <UButton class="shrink-0" size="sm" color="neutral" variant="ghost" icon="i-material-symbols-add" :aria-label="$t('agents.title.companion_add')" @click="companionsRef?.openAdd()" />
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
      <!-- A section whose one table is the whole of it scrolls inside that table, so the table's
           header and sideways scrollbar hold to the section's edges; the rest scroll as a page. -->
      <div ref="body" class="flex min-h-0 flex-1 flex-col" :class="FULL_TABLE_TABS.includes(tab) ? 'overflow-hidden' : 'overflow-y-auto'">
        <template v-if="tab === 'general'">
          <!-- The settings before they have arrived. Every section title is the screen's own and
               stands at once; what waits is the cards under them, in the shape of the card each
               section is made of — a mark, two lines and the switch at its end. -->
          <ContentSkeleton
            v-if="!generalReady && !generalFailed"
            class="mx-auto w-full max-w-3xl p-4 sm:p-6"
            :rows="1"
            :label="$t('agents.status.settings_loading')"
          >
            <div class="flex flex-col gap-8">
              <section v-for="section in GENERAL_SECTIONS" :key="section.id" class="flex flex-col gap-3">
                <h2 class="text-lg font-semibold text-highlighted">{{ $t(section.title) }}</h2>

                <!-- The registered models wait in their own list's row, the one the section itself
                     shows while its own read is still out; the agents' settings in their table's. -->
                <AgentsRegistrySkeleton v-if="LIST_SECTIONS.includes(section.id)" :rows="section.waiting" />
                <DataTableSkeleton v-else-if="section.id === 'agents'" :headers="AGENT_TABLE_HEADERS" :rows="section.waiting" layout="own" :label="$t('agents.status.settings_loading')" />
                <div
                  v-for="n in LIST_SECTIONS.includes(section.id) || section.id === 'agents' ? 0 : section.waiting"
                  :key="n"
                  class="flex items-center gap-3 rounded-lg border border-default px-4 py-3"
                >
                  <SkeletonBar class="size-5 shrink-0 rounded-sm" />
                  <div class="flex min-w-0 flex-1 flex-col gap-1">
                    <SkeletonBar class="h-4 w-2/5" />
                    <SkeletonBar class="h-4 w-1/4" />
                  </div>
                  <!-- A session's row ends in its reset button. -->
                  <SkeletonBar v-if="section.id === 'sessions'" class="size-8 shrink-0 rounded-md" />
                  <SkeletonBar v-else class="h-5 w-9 shrink-0 rounded-full" />
                </div>
              </section>
            </div>
          </ContentSkeleton>
          <ReadFailure
            v-else-if="generalFailed"
            class="mx-4 my-4 w-auto"
            :failure="generalRead"
            :message="$t('agents.error.settings_read_failed')"
            :reading="rereading"
            @retry="reread()"
          />
          <AgentsGeneral
            v-else
            ref="generalRef"
            :agents="agents"
            :rooms="rooms"
            :fallback="fallback"
            :keepalive="keepalive"
            :models="models ?? null"
            :models-failed="!!modelsError"
            :models-reading="modelsStatus === 'pending'"
            :reread="rereadPart"
            :query="query"
          />
        </template>

        <AgentsWorkers v-else-if="tab === 'workers'" ref="workersRef" :workers="workers" :reread="refreshAgents" :query="query" />

        <template v-else-if="tab === 'tiers'">
          <AgentsTierTable :query="query" />
          <AgentsFoldRatios :query="query" />
          <AgentsCoworkerLimits :query="query" />
          <AgentsDraftProcesses :query="query" />
        </template>

        <AgentsRouteTable v-else-if="tab === 'routes'" :query="query" />


        <AgentsCompanions v-else-if="tab === 'companions'" ref="companionsRef" :workers="companionWorkers" />

        <ResearchSettings v-else :query="query" />
      </div>

      <SettingsDialog v-model:open="searchOpen" :title="$t('agents.placeholder.find_settings')">
        <UInput v-model="query" class="w-full" icon="i-material-symbols-search" :placeholder="$t('agents.placeholder.find_settings')" :aria-label="$t('agents.placeholder.find_settings')" autofocus />
        <SettingsResults :hits="hits" :query="query" @go="go" />
      </SettingsDialog>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { AGENT_TABS, emptyFallbackView, emptyKeepaliveView, isAgentTab, mappingText, routeModeText, searchSettings, settingsAnchor } from "~/domain/agent-settings";
import { agentGroups, GENERAL_SECTIONS, keepaliveMarkOf, designatedAndWorkers, NOT_CHECKOUT_LABEL } from "~/domain/agents";
import { foldPercentText, foldRatioAt, foldSourceText } from "~/domain/fold-ratios";
import { draftKeyId, draftKeyLabel, draftListText, draftSourceText } from "~/domain/draft-process";
import { useAgentCatalogue } from "~/domain/catalogue";
import { useListPlace } from "bmo-ui/app/domain/list-place";
import { useReadFailure } from "~/domain/events";
import { useInitialRead } from "bmo-ui/app/domain/loading";
import { registrationName } from "~/domain/registry";
import { PROFILE_LABELS, profileLabel, researchKeys } from "~/domain/research";
import { useNarrow } from "bmo-ui/app/domain/screen";
import { TAB_ROW_LINE, TAB_ROW_UI } from "bmo-ui/app/domain/tabs";
import { modeLabel } from "~/domain/status";
import { scrollWithin } from "bmo-ui/app/domain/scroll-within";

import type { AgentTab, SettingsEntry, SettingsHit } from "~/domain/agent-settings";
import type { AgentSummary, FallbackView, KeepaliveView, RoomSummary } from "#shared/types";
import type { GeneralPart } from "~/domain/agents";
import type { FoldRatiosView, ModelPage, PoolBoard, TierSettingsView } from "#shared/agency";
import type { DraftProcessesView } from "#shared/drafting";

const route = useRoute();
const router = useRouter();

// An agent's own screen is opened from this one and led back to. Which tab stood open is in the
// address already; the scroll is what a return would otherwise lose.
const bodyRef = useTemplateRef<HTMLElement>("body");

useListPlace("agents", () => bodyRef.value);
const narrow = useNarrow();

const FULL_TABLE_TABS: readonly AgentTab[] = ["routes"];

const workersRef = useTemplateRef<{ openAdd: () => void }>("workersRef");
const companionsRef = useTemplateRef<{ openAdd: () => void }>("companionsRef");
const generalRef = useTemplateRef<{ openAddAccount: () => void; openAddRegistration: () => void; openAddCatalogue: () => void; openAddBasePrompt: () => void; openAddAgent: () => void }>("generalRef");
// The sections that wait in their own list's rows rather than a card's.
const LIST_SECTIONS = ["registry", "catalogue", "base-prompts"];
// The columns of the agents' settings table, which its skeleton stands under before the settings arrive.
const AGENT_TABLE_HEADERS = computed(() =>
  ["agents.label.column_agent", "agents.label.column_role", "agents.label.column_keepalive", "agents.label.column_thinking", "agents.label.column_effort"].map((key) => t(key))
);

const generalAddItems = computed(() => [
  { label: t("agents.title.accounts"), icon: "i-material-symbols-person-add-outline", onSelect: () => generalRef.value?.openAddAccount() },
  { label: t("agents.title.registry"), icon: "i-material-symbols-model-training", onSelect: () => generalRef.value?.openAddRegistration() },
  { label: t("agents.title.catalogue"), icon: "i-material-symbols-deployed-code-outline", onSelect: () => generalRef.value?.openAddCatalogue() },
  { label: t("agents.title.base_prompts"), icon: "i-material-symbols-article-outline", onSelect: () => generalRef.value?.openAddBasePrompt() },
  { label: t("agents.title.agent_add"), icon: "i-material-symbols-person-add-outline", onSelect: () => generalRef.value?.openAddAgent() }
]);

const tab = computed<AgentTab>(() => (isAgentTab(route.query.tab) ? route.query.tab : "general"));
const { t } = useI18n();
const tabItems = AGENT_TABS.map((one) => ({ ...one, label: t(one.label) }));

// The section stands in the address, and moving to another is a step of the history.
function setTab(next: string): void {
  if (!isAgentTab(next) || next === tab.value) return;

  void router.push({ query: { ...route.query, tab: next === "general" ? undefined : next } });
}

const { agents, refresh: refreshAgents, initial: agentsInitial, failed: agentsFailed } = useAgentCatalogue();
// The workers a companion's items may go to, offered when one is added.
const companionWorkers = computed(() => agents.value.agents.filter((one) => one.kind === "worker" && one.supportOf == null));
const { data: roomList } = useFetch<RoomSummary[]>("/api/rooms", { key: "rooms", lazy: true, server: false, default: () => [] });
const rooms = computed<RoomSummary[]>(() => roomList.value ?? []);

const { data: fallback, refresh: rereadFallback, status: fallbackStatus } = useFetch<FallbackView>("/api/fallback", { key: "fallback", lazy: true, server: false, default: emptyFallbackView });
const { data: keepalive, refresh: rereadKeepalive, status: keepaliveStatus } = useFetch<KeepaliveView>("/api/keepalive", { key: "keepalive", lazy: true, server: false, default: emptyKeepaliveView });
const { data: tiers } = useFetch<TierSettingsView>("/api/model-tiers", { key: "model-tiers", lazy: true, server: false });
const { data: foldRatios } = useFetch<FoldRatiosView>("/api/fold-ratios", { key: "fold-ratios", lazy: true, server: false });
// The draft process table and its questions, read here too so the search looks over them before their tab was opened.
const { data: draftProcesses } = useFetch<DraftProcessesView>("/api/draft-processes", { key: "draft-processes", lazy: true, server: false });
// The registered models, read apart from the rest of the tab: its section waits on its own read.
const { data: models, error: modelsError, refresh: rereadModels, status: modelsStatus } = useFetch<ModelPage>("/api/models", { key: "models", lazy: true, server: false });
// The co-worker pool, read here too so the search looks over the limits before their tab was opened.
const { data: pool, refresh: rereadPool } = useFetch<PoolBoard>("/api/agency/pool", { key: "coworker-pool", lazy: true, server: false });

const fallbackInitial = useInitialRead(fallbackStatus);
const keepaliveInitial = useInitialRead(keepaliveStatus);

const generalReady = computed(() => !agentsInitial.value && !fallbackInitial.value && !keepaliveInitial.value
  && fallbackStatus.value !== "error" && keepaliveStatus.value !== "error");
const generalFailed = computed(() => agentsFailed.value || fallbackStatus.value === "error" || keepaliveStatus.value === "error");

const workers = computed<AgentSummary[]>(() => agents.value.agents.filter((agent) => agent.kind === "worker"));

async function rereadPart(what: GeneralPart): Promise<void> {
  if (what === "agents") await refreshAgents();
  if (what === "fallback") await Promise.all([rereadFallback(), refreshNuxtData("execution-fallback"), refreshAgents()]);
  if (what === "keepalive") await rereadKeepalive();
  // A registration named in a tier or a pin is read back beside the models themselves.
  if (what === "registry") await Promise.all([rereadModels(), refreshNuxtData("model-tiers"), refreshAgents()]);
}

const rereading = ref(false);

async function reread(): Promise<void> {
  rereading.value = true;

  try {
    await Promise.all([refreshAgents(), rereadFallback(), rereadKeepalive(), refreshNuxtData("model-tiers"), refreshNuxtData("fold-ratios"), rereadPool(), rereadModels()]);
  } finally {
    rereading.value = false;
  }
}

const generalRead = useReadFailure({ failed: () => generalFailed.value, reading: () => rereading.value, reread: () => void reread() });

// The settings search, over every section at once.
const query = ref("");
const resultsOpen = ref(false);
const searchOpen = ref(false);

function keyLabel(key: string): string {
  return agents.value.agents.find((agent) => agent.name === key)?.label
    ?? fallback.value?.profiles.find((one) => one.key === key)?.label
    ?? (key in PROFILE_LABELS ? profileLabel(t, key) : key.startsWith("role:") ? t("agents.label.role_key", { role: key.slice(5) }) : key);
}

const entries = computed<SettingsEntry[]>(() => {
  const list: SettingsEntry[] = [
    { id: "keepalive", tab: "general", label: t("agents.label.keepalive_all"), fields: [{ label: t("agents.label.settings"), text: t("agents.label.find_keepalive_all"), shown: true }] },
    { id: "providers", tab: "general", label: t("agents.title.section_providers"), fields: [{ label: t("agents.label.settings"), text: t("agents.label.find_fallback"), shown: true }] },
    {
      id: "agents",
      tab: "general",
      label: t("agents.title.section_agents"),
      fields: [
        { label: t("agents.label.settings"), text: t("agents.label.find_roles"), shown: true },
        { label: t("agents.label.settings"), text: t("agents.label.find_reasoning"), shown: true }
      ]
    },
    { id: "sessions", tab: "general", label: t("agents.title.section_sessions"), fields: [{ label: t("agents.label.settings"), text: t("agents.label.find_sessions"), shown: true }] }
  ];

  for (const one of fallback.value?.order ?? []) {
    list.push({ id: "providers", tab: "general", label: t("agents.label.find_provider", { name: one.label }), fields: [{ label: t("agents.label.column_provider"), text: one.label, shown: true }, { label: t("agents.label.reason"), text: one.reason, shown: true }] });
  }

  // Every registered model, found by its name, its model and its tier.
  for (const one of models.value?.items ?? []) {
    const name = registrationName(one.key);

    list.push({
      id: "registry",
      tab: "general",
      label: t("agents.label.find_registration", { name }),
      fields: [
        { label: t("common.label.name"), text: name, shown: true },
        { label: t("common.label.model"), text: one.model, shown: true },
        { label: t("agents.label.tier"), text: one.tier, shown: true }
      ]
    });
  }

  if ((fallback.value?.accounts ?? []).length > 0) {
    list.push({ id: "accounts", tab: "general", label: t("agents.title.accounts"), fields: [{ label: t("agents.label.settings"), text: t("agents.label.find_account_order"), shown: true }] });
  }

  for (const one of fallback.value?.accounts ?? []) {
    list.push({
      id: "accounts",
      tab: "general",
      label: t("agents.label.find_account", { name: one.name }),
      fields: [
        { label: t("common.label.name"), text: one.name, shown: true },
        { label: t("common.label.path"), text: one.credentialPath, shown: true },
        { label: t("agents.label.key"), text: one.id, shown: false }
      ]
    });
  }

  for (const group of agentGroups(t, designatedAndWorkers(agents.value.agents), rooms.value)) {
    for (const agent of group.agents) {
      const aliases = agents.value.agents.find((one) => one.name === agent.name)?.aliases ?? "";

      list.push({
        id: `agent-${agent.name}`,
        tab: "general",
        label: t("agents.label.find_keepalive", { name: agent.label }),
        fields: [
          { label: t("common.label.name"), text: agent.label, shown: true },
          { label: t("agents.label.key"), text: agent.name, shown: true },
          { label: t("agents.label.shown"), text: keepaliveMarkOf(t, agents.value.agents.find((one) => one.name === agent.name), keepalive.value?.stopped === true), shown: true },
          { label: t("agents.label.alias"), text: aliases, shown: false }
        ]
      });
    }
  }

  for (const worker of workers.value) {
    list.push({
      id: `worker-${worker.name}`,
      tab: "workers",
      label: worker.label ?? worker.name,
      fields: [
        { label: t("common.label.name"), text: worker.label, shown: true },
        { label: t("agents.label.key"), text: worker.name, shown: true },
        { label: t("common.label.path"), text: worker.cwd, shown: true },
        { label: t("agents.label.shown"), text: worker.checkout === false ? t(NOT_CHECKOUT_LABEL) : null, shown: true },
        { label: t("agents.label.preamble"), text: worker.preamble, shown: false }
      ]
    });
  }

  for (const tier of tiers.value?.tiers ?? []) {
    const cells = (tiers.value?.providers ?? []).map(({ provider, label, capsAnswerTokens }) => {
      const shown = mappingText(t, tiers.value?.mappings.find((one) => one.provider === provider && one.tier === tier), capsAnswerTokens);

      return { label, text: shown === null ? null : `${label} ${shown.model} ${shown.detail}`, shown: true };
    });

    list.push({ id: `tier-${tier}`, tab: "tiers", label: t("agents.label.find_tier", { tier }), fields: [{ label: t("agents.label.tier"), text: tier, shown: true }, ...cells] });
  }

  for (const tier of foldRatios.value?.tiers ?? []) {
    const cells = (foldRatios.value?.providers ?? []).map((provider) => {
      const label = modeLabel(t, provider);
      const held = foldRatioAt(foldRatios.value, tier, provider);

      return { label, text: held === null ? null : `${label} ${foldPercentText(t, held.ratio)} ${foldSourceText(t, held.source)}`, shown: true };
    });

    list.push({ id: `fold-${tier}`, tab: "tiers", label: t("agents.label.find_fold_ratio", { tier }), fields: [{ label: t("agents.label.tier"), text: tier, shown: true }, ...cells] });
  }

  for (const row of draftProcesses.value?.rows ?? []) {
    const key = draftKeyLabel(t, row);

    list.push({
      id: `draft-${draftKeyId(row)}`,
      tab: "tiers",
      label: t("agents.label.find_draft_process", { key }),
      fields: [
        { label: t("agents.label.draft_rounds"), text: draftListText(t, row.rounds), shown: true },
        { label: t("agents.label.draft_light"), text: draftListText(t, row.light), shown: true },
        { label: t("agents.label.draft_source"), text: draftSourceText(t, row.source), shown: true }
      ]
    });
  }

  for (const question of draftProcesses.value?.questions ?? []) {
    list.push({
      id: `draft-question-${question.name}`,
      tab: "tiers",
      label: t("agents.label.find_draft_question", { name: question.name }),
      fields: [{ label: t("common.label.name"), text: question.name, shown: true }, { label: t("agents.label.draft_question_text"), text: question.text, shown: true }]
    });
  }

  const gateKeys = new Set((fallback.value?.profiles ?? []).filter((one) => one.kind === "gate").map((one) => one.key));

  for (const assignment of tiers.value?.assignments ?? []) {
    if (gateKeys.has(assignment.key)) continue;

    const profile = fallback.value?.profiles.find((one) => one.key === assignment.key);
    const mode = profile === undefined ? null : routeModeText(t, profile);

    list.push({
      id: `route-${assignment.key}`,
      tab: "routes",
      label: keyLabel(assignment.key),
      fields: [{ label: t("common.label.name"), text: keyLabel(assignment.key), shown: true }, { label: t("agents.label.key"), text: assignment.key, shown: true }, { label: t("agents.label.tier"), text: assignment.tier, shown: true }, { label: t("agents.label.column_provider"), text: mode, shown: true }]
    });
  }

  for (const bucket of pool.value?.buckets ?? []) {
    list.push({
      id: `pool-${bucket.tier}`,
      tab: "tiers",
      label: t("agents.label.find_pool_limit", { provider: modeLabel(t, bucket.provider), tier: bucket.tier }),
      fields: [{ label: t("agents.label.tier"), text: t("agents.label.pool_limit_of", { tier: bucket.tier }), shown: true }]
    });
  }

  for (const key of researchKeys(fallback.value?.profiles ?? [], tiers.value?.assignments ?? [])) {
    list.push({ id: `route-${key}`, tab: "research", label: t("agents.label.find_searcher", { name: keyLabel(key) }), fields: [{ label: t("common.label.name"), text: t("agents.label.searcher_of", { name: keyLabel(key) }), shown: true }, { label: t("agents.label.key"), text: key, shown: true }] });
  }

  return list;
});

const hits = computed<SettingsHit[]>(() => searchSettings(t, entries.value, query.value).slice(0, 40));

// A result pressed: its section comes up, and its row is brought into view and marked a moment.
async function go(hit: SettingsHit): Promise<void> {
  resultsOpen.value = false;
  searchOpen.value = false;

  if (hit.entry.tab !== tab.value) {
    await router.push({ query: { ...route.query, tab: hit.entry.tab === "general" ? undefined : hit.entry.tab } });
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
