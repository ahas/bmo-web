<template>
  <!-- Every agent's own settings as one table, the agents its rows and the settings its columns (docs/web.md, the
       general tab's agents' settings): each group under its heading row, and per agent its role, its keepalive, its
       thinking and effort and, for an agent that answers in a room, its own gates. A setting an agent has none of
       stands as a dash. -->
  <section :id="settingsAnchor('agents')" class="flex flex-col gap-3" aria-labelledby="agents-title">
    <h2 id="agents-title" class="text-lg font-semibold text-highlighted">{{ generalSectionTitle($t, "agents") }}</h2>

    <DataTable :data="rows" :columns="columns" layout="own" :sections="sections" :section-of="sectionOf" :row-key="rowKey">
      <template #agent-cell="{ row }">
        <span :id="row.original.first ? settingsAnchor(`agent-${row.original.meta.name}`) : undefined" :class="CELL_TEXT" class="ps-4">
          <NuxtLink :to="`/agents/${encodeURIComponent(row.original.meta.name)}`" class="flex min-w-0 items-start gap-2 rounded-sm transition-colors hover:text-primary active:text-primary/80">
            <AgentMark :agent="row.original.meta" class="mt-0.5 text-muted" />
            <span class="flex min-w-0 flex-col">
              <SearchText class="text-sm font-medium text-highlighted" :text="row.original.meta.label" :query="props.query" />
              <SearchText class="font-mono text-sm text-muted" :text="row.original.meta.name" :query="props.query" />
              <SearchText v-if="recentOf(row.original.agent) !== ''" class="text-sm text-muted" :text="$t('agents.label.recent', { value: recentOf(row.original.agent) })" :query="props.query" />
              <SearchText v-if="keepaliveMark(row.original.agent) !== ''" class="text-sm text-warning" :text="keepaliveMark(row.original.agent)" :query="props.query" />
              <SearchHit :match="hiddenMatch(row.original.agent)" :query="props.query" />
            </span>
          </NuxtLink>
        </span>
      </template>

      <!-- The role is read, not chosen: it is set when the agent is registered. -->
      <template #role-cell="{ row }">
        <span :class="CELL_TEXT" class="max-w-64">
          <SearchText class="text-sm text-highlighted" :text="roleLabel(row.original.agent.role ?? null)" :query="props.query" />
          <SearchText class="text-sm text-muted" :text="givesText(row.original.agent.role ?? null)" :query="props.query" />
        </span>
      </template>

      <!-- Every value of the table is pressed and chosen from a list dropped down from its own cell: the warming as
           on or off, and for a worker off until its next job, which nothing but that job undoes. -->
      <template #keepalive-cell="{ row }">
        <SettingsChoiceCell
          :value="keepaliveValue(row.original.agent)"
          :items="keepaliveItems(row.original.agent)"
          :label="$t('agents.aria.keepalive_of', { name: row.original.meta.name })"
          :save="(value) => saveKeepalive(row.original.meta.name, String(value))"
        >
          <span class="text-sm text-highlighted">{{ keepaliveText(row.original.agent) }}</span>
        </SettingsChoiceCell>
      </template>

      <template #thinking-cell="{ row }">
        <SettingsChoiceCell
          v-if="row.original.agent.reasoning != null"
          :value="thinkingValue(row.original.agent.reasoning)"
          :items="thinkingItems(row.original.agent.reasoning)"
          :label="$t('agents.aria.thinking_of', { name: row.original.meta.label })"
          :disabled="!thinkingReaches(row.original.agent.reasoning)"
          :save="(value) => saveThinking(row.original, String(value))"
        >
          <span class="text-sm text-highlighted">{{ thinkingText(row.original.agent.reasoning) }}</span>
        </SettingsChoiceCell>
        <span v-else :class="CELL_TEXT" class="text-sm text-muted">—</span>
      </template>

      <template #effort-cell="{ row }">
        <SettingsChoiceCell
          v-if="row.original.agent.reasoning != null"
          :value="row.original.agent.reasoning.effort ?? DEFAULT"
          :items="effortItems(row.original.agent.reasoning)"
          :label="$t('agents.aria.effort_of', { name: row.original.meta.label })"
          :disabled="!effortReaches(row.original.agent.reasoning)"
          :save="(value) => saveEffort(row.original, String(value))"
        >
          <span class="flex items-center gap-2">
            <span class="text-sm text-highlighted">{{ row.original.agent.reasoning.effort ?? $t("agents.label.reasoning_default") }}</span>
            <!-- A level the provider the agent begins on does not take leaves that provider on its tier. -->
            <UTooltip v-if="notApplied(row.original.agent.reasoning)" :text="levelsText(row.original.agent.reasoning)">
              <UBadge color="warning" variant="subtle" size="sm" :label="$t('agents.label.reasoning_not_applied')" />
            </UTooltip>
          </span>
        </SettingsChoiceCell>
        <span v-else :class="CELL_TEXT" class="text-sm text-muted">—</span>
      </template>
    </DataTable>
  </section>
</template>

<script setup lang="ts">
import { matchFields } from "bmo-ui/shared/search";
import { settingsAnchor } from "~/domain/agent-settings";
import { generalSectionTitle, keepaliveMarkOf } from "~/domain/agents";
import { failureText } from "bmo-ui/app/domain/errors";
import { CELL_TEXT } from "~/domain/settings-cells";
import { modeLabel, modelLabel } from "~/domain/status";

import type { TableColumn } from "@nuxt/ui";
import type { AgentList, AgentReasoningView, AgentSummary, KeepaliveView } from "#shared/types";
import type { AgentGroup, AgentMeta, GeneralPart } from "~/domain/agents";
import type { CellChoice } from "~/domain/settings-cells";
import type { TableSection } from "bmo-ui/app/domain/table-sections";

interface Props {
  agents: AgentList;
  keepalive: KeepaliveView;
  // The agents in their groups, in the order the list stands in.
  groups: AgentGroup[];
  // Every change is asked of the bot and then read back by the page, which this waits for.
  reread: (what: GeneralPart) => Promise<void>;
  query?: string;
}

interface Row {
  meta: AgentMeta;
  agent: AgentSummary;
  section: string;
  // Whether this is the first place the agent stands, which is where the settings search jumps to it.
  first: boolean;
}

const props = withDefaults(defineProps<Props>(), { query: "" });
const { t } = useI18n();


const DEFAULT = "default";
const ON = "on";
const OFF = "off";
// The one scale an agent's level is named on, lowest first.
const LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;

const columns = computed<TableColumn<Row>[]>(() => [
  { id: "agent", header: t("agents.label.column_agent"), meta: { class: { th: "w-full" } } },
  { id: "role", header: t("agents.label.column_role") },
  { id: "keepalive", header: t("agents.label.column_keepalive") },
  { id: "thinking", header: t("agents.label.column_thinking") },
  { id: "effort", header: t("agents.label.column_effort") }
]);

const sections = computed<TableSection[]>(() => props.groups.map((group) => ({ key: group.key, label: group.label })));

const rows = computed<Row[]>(() => {
  const seen = new Set<string>();

  return props.groups.flatMap((group) =>
    group.agents.flatMap((meta) => {
      const agent = props.agents.agents.find((one) => one.name === meta.name);

      if (agent === undefined) return [];

      const first = !seen.has(meta.name);

      seen.add(meta.name);

      return [{ meta, agent, section: group.key, first }];
    })
  );
});

function sectionOf(row: Row): string {
  return row.section;
}

function rowKey(row: Row): string {
  return `${row.section}:${row.meta.name}`;
}

// The role an agent holds by the word the bot declares it under; one it no longer declares, or any while it is not
// answering, by its own name.
function roleLabel(held: string | null): string {
  if (held === null) return t("agents.label.role_none");

  return props.agents.roles.find((one) => one.name === held)?.label ?? held;
}

// What the role gives, the bundles by their short names; while the bot is not answering, nothing more.
function givesText(held: string | null): string {
  if (held === null) return "";

  const role = props.agents.roles.find((one) => one.name === held);

  if (role === undefined) return "";

  return role.bundles.length === 0 ? t("agents.label.role_bundles_none") : role.bundles.map((bundle) => bundle.label).join(" · ");
}

function keepaliveMark(agent: AgentSummary): string {
  return keepaliveMarkOf(t, agent, props.keepalive.stopped);
}

// A worker being warmed right now, which is the only one there is anything to turn off for.
function pausable(agent: AgentSummary): boolean {
  return !agent.keepaliveStopped && agent.keepalivePausedAt === null && !props.keepalive.stopped;
}

function recentOf(agent: AgentSummary): string {
  if (agent.lastMode === null) return "";

  return [modeLabel(t, agent.lastMode), agent.lastModel === null ? null : modelLabel(agent.lastModel), agent.lastEffort].filter(Boolean).join(" · ");
}

// Where the search found a row in what the row does not show: the names the owner calls it by.
function hiddenMatch(agent: AgentSummary) {
  return matchFields([{ label: t("agents.label.alias"), text: agent.aliases ?? "", shown: false }], props.query);
}

// The warming as the cell holds it: on, off, or off until the worker's next job.
const PAUSED = "pause";

function keepaliveValue(agent: AgentSummary): string {
  return agent.keepalivePausedAt !== null ? PAUSED : agent.keepaliveStopped ? OFF : ON;
}

function keepaliveText(agent: AgentSummary): string {
  const value = keepaliveValue(agent);

  return value === PAUSED ? t("agents.label.keepalive_paused") : value === OFF ? t("agents.label.gate_off") : t("agents.label.gate_on");
}

// On and off for every agent; for a worker also off until its next job, open only while it is being warmed.
function keepaliveItems(agent: AgentSummary): CellChoice[] {
  return [
    { value: ON, label: t("agents.label.gate_on") },
    { value: OFF, label: t("agents.label.gate_off") },
    ...(agent.kind === "worker" ? [{ value: PAUSED, label: t("agents.action.pause_until_job"), disabled: !pausable(agent) && keepaliveValue(agent) !== PAUSED }] : [])
  ];
}

async function saveKeepalive(name: string, value: string): Promise<string | null> {
  try {
    await $fetch("/api/keepalive", { method: "POST", body: value === PAUSED ? { agent: name, pause: true } : { agent: name, stopped: value === OFF } });
    await props.reread("agents");

    return null;
  } catch (error) {
    return failureText(error, t("common.error.save_failed"));
  }
}

function thinkingValue(reasoning: AgentReasoningView): string {
  return reasoning.thinking === null ? DEFAULT : reasoning.thinking ? ON : OFF;
}

function thinkingText(reasoning: AgentReasoningView): string {
  if (!thinkingReaches(reasoning)) return t("agents.label.reasoning_unsupported");

  return reasoning.thinking === null ? t("agents.label.reasoning_default") : reasoning.thinking ? t("agents.label.reasoning_on") : t("agents.label.reasoning_off");
}

// Whether the switch reaches the provider the agent begins on. A switch already set stays open to be given back,
// wherever it stands now.
function thinkingReaches(reasoning: AgentReasoningView): boolean {
  return reasoning.reaches === null || reasoning.reaches.thinking || reasoning.thinking !== null;
}

function effortReaches(reasoning: AgentReasoningView): boolean {
  return reasoning.reaches === null || reasoning.reaches.levels.length > 0 || reasoning.effort !== null;
}

function thinkingItems(reasoning: AgentReasoningView): CellChoice[] {
  if (!thinkingReaches(reasoning)) return [{ value: DEFAULT, label: t("agents.label.reasoning_unsupported") }];

  return [
    { value: DEFAULT, label: t("agents.label.reasoning_default") },
    { value: ON, label: t("agents.label.reasoning_on") },
    { value: OFF, label: t("agents.label.reasoning_off") }
  ];
}

// Every level stands, since an agent that walks may land on a provider that takes it; one the provider it begins on
// does not take is marked so in the list.
function effortItems(reasoning: AgentReasoningView): CellChoice[] {
  if (!effortReaches(reasoning)) return [{ value: DEFAULT, label: t("agents.label.reasoning_unsupported") }];

  return [
    { value: DEFAULT, label: t("agents.label.reasoning_default") },
    ...LEVELS.map((level) => ({
      value: level,
      label: level,
      ...(reasoning.reaches === null || reasoning.reaches.levels.includes(level) ? {} : { description: t("agents.label.reasoning_not_applied") })
    }))
  ];
}

function notApplied(reasoning: AgentReasoningView): boolean {
  const reaches = reasoning.reaches;

  if (reaches === null) return false;

  return (reasoning.effort !== null && !reaches.levels.includes(reasoning.effort)) || (reasoning.thinking !== null && !reaches.thinking);
}

function levelsText(reasoning: AgentReasoningView): string {
  const levels = reasoning.reaches?.levels ?? [];

  return levels.length === 0 ? t("agents.label.reasoning_no_levels") : t("agents.label.reasoning_levels", { levels: levels.join(", ") });
}

// A save asked of the bot; its refusal in its own words, which the cell says in a notice, or null once it took it.
async function saveReasoning(row: Row, body: { thinking: boolean | null; effort: string | null }): Promise<string | null> {
  try {
    await $fetch("/api/agent-reasoning", { method: "POST", body: { agent: row.meta.name, ...body } });
    await props.reread("agents");

    return null;
  } catch (error) {
    return failureText(error, t("common.error.save_failed"));
  }
}

async function saveThinking(row: Row, value: string): Promise<string | null> {
  const reasoning = row.agent.reasoning;

  if (reasoning == null || value === thinkingValue(reasoning)) return null;

  return await saveReasoning(row, { thinking: value === DEFAULT ? null : value === ON, effort: reasoning.effort });
}

async function saveEffort(row: Row, value: string): Promise<string | null> {
  const reasoning = row.agent.reasoning;

  if (reasoning == null || value === (reasoning.effort ?? DEFAULT)) return null;

  return await saveReasoning(row, { thinking: reasoning.thinking, effort: value === DEFAULT ? null : value });
}
</script>
