<template>
  <!-- The gates a turn passes, as the gate unit serves them (docs/web.md, the agents page's gates tab): each where it
       stands in the turn and under what condition, its Laya mode where it has a probe, its switch where its profile
       lets it be turned off and its cache warming where the agency holds a session for it. -->
  <section class="flex min-w-0 flex-col" aria-labelledby="turn-gates-title">
    <div class="flex min-h-12 items-center gap-2 border-b border-default px-4 py-2">
      <h2 id="turn-gates-title" class="text-base font-semibold text-highlighted">{{ $t("agents.title.turn_gates") }}</h2>
    </div>

    <DataTableSkeleton v-if="!data && !error" :headers="tableHeaders(columns)" :rows="2" :label="$t('agents.status.turn_gates_loading')" />
    <ReadFailure
      v-else-if="error && !data"
      class="mx-4 my-4 w-auto"
      :failure="readFailure"
      :message="failureText(error, $t('agents.error.turn_gates_read_failed'))"
      :reading="status === 'pending'"
      @retry="refresh()"
    />
    <p v-else-if="data && data.length === 0" class="px-4 py-4 text-sm text-muted">{{ $t("agents.status.no_turn_gates") }}</p>

    <DataTable v-else-if="data" :data="data" :columns="columns">
      <template #name-cell="{ row }">
        <span :id="settingsAnchor(`turn-gate-${row.original.name}`)" :class="CELL_TEXT" class="ps-4">
          <SearchText class="font-medium text-highlighted" :text="agentLabel($t, row.original.name)" :query="props.query" />
          <SearchText v-if="agentLabel($t, row.original.name) !== row.original.name" class="font-mono text-muted" :text="row.original.name" :query="props.query" />
        </span>
      </template>

      <template #place-cell="{ row }">
        <span :class="CELL_TEXT" class="tabular-nums text-highlighted">
          <SearchText :text="$t('agents.label.turn_gate_step', { part: $t(GATE_PART_LABELS[row.original.part]), n: row.original.step + 1 })" :query="props.query" />
        </span>
      </template>

      <template #condition-cell="{ row }">
        <span :class="CELL_TEXT" class="text-muted">
          <SearchText :text="row.original.condition === null ? '—' : $t(GATE_CONDITION_NOTES[row.original.condition])" :query="props.query" />
        </span>
      </template>

      <template #laya-cell="{ row }">
        <span :class="CELL_TEXT" class="text-highlighted">
          <SearchText :text="row.original.layaProbe ? layaModeWord($t, row.original.layaMode) : $t('agents.label.laya_refused_no_probe')" :query="props.query" />
        </span>
      </template>

      <template #switch-cell="{ row }">
        <span :class="CELL_TEXT">
          <USwitch
            v-if="row.original.switchable"
            :model-value="row.original.enabled"
            :aria-label="$t('agents.aria.turn_gate_switch_of', { gate: agentLabel($t, row.original.name) })"
            :loading="busy === `switch:${row.original.name}`"
            :disabled="busy !== ''"
            @update:model-value="switchGate(row.original.name, $event as boolean)"
          />
          <span v-else class="text-muted">—</span>
        </span>
      </template>

      <template #keepalive-cell="{ row }">
        <span :class="CELL_TEXT">
          <USwitch
            v-if="sessionOf(row.original.name) !== undefined"
            :model-value="!sessionOf(row.original.name)!.keepaliveStopped"
            :aria-label="$t('agents.aria.turn_gate_keepalive_of', { gate: agentLabel($t, row.original.name) })"
            :loading="busy === `keepalive:${row.original.name}`"
            :disabled="busy !== ''"
            @update:model-value="switchKeepalive(row.original.name, !($event as boolean))"
          />
          <span v-else class="text-muted">—</span>
        </span>
      </template>
    </DataTable>

    <p v-if="failed !== ''" role="alert" class="px-4 py-2 text-sm text-error">{{ failed }}</p>
  </section>
</template>

<script setup lang="ts">
import { tableHeaders } from "bmo-ui/app/domain/column-widths";
import { failureText } from "bmo-ui/app/domain/errors";
import { CELL_TEXT, settingsAnchor } from "~/domain/agent-settings";
import { agentLabel } from "~/domain/agents";
import { useReadFailure } from "~/domain/events";
import { GATE_CONDITION_NOTES, GATE_PART_LABELS, layaModeWord } from "~/domain/gate-order";

import type { AgentList, TurnGateView } from "#shared/types";
import type { TableColumn } from "@nuxt/ui";

const props = withDefaults(defineProps<{ agents: AgentList; reread: () => Promise<void>; query?: string }>(), { query: "" });
const { t } = useI18n();

const { data, error, refresh, status } = useFetch<TurnGateView[]>("/api/turn-gates", { key: "turn-gates", server: false, lazy: true });
const readFailure = useReadFailure({ failed: () => !!error.value && !data.value, reading: () => status.value === "pending", reread: () => void refresh() });

const busy = ref("");
const failed = ref("");

const columns = computed<TableColumn<TurnGateView>[]>(() => [
  { id: "name", header: t("agents.label.turn_gate") },
  { id: "place", header: t("agents.label.turn_gate_place") },
  { id: "condition", header: t("agents.label.turn_gate_condition") },
  { id: "laya", header: t("agents.label.turn_gate_laya") },
  { id: "switch", header: t("agents.label.turn_gate_switch") },
  { id: "keepalive", header: t("agents.label.turn_gate_keepalive") }
]);

// The agency's session row a gate runs in, whose cache warming is switched here.
function sessionOf(name: string) {
  return props.agents.agents.find((agent) => agent.name === name && agent.kind === "gate");
}

async function act(key: string, run: () => Promise<void>): Promise<void> {
  busy.value = key;
  failed.value = "";

  try {
    await run();
  } catch (failure) {
    failed.value = failureText(failure, t("common.error.save_failed"));
  } finally {
    busy.value = "";
  }
}

async function switchGate(name: string, enabled: boolean): Promise<void> {
  await act(`switch:${name}`, async () => {
    await $fetch(`/api/turn-gates/${encodeURIComponent(name)}`, { method: "POST", body: { enabled } });
    await refresh();
  });
}

async function switchKeepalive(name: string, stopped: boolean): Promise<void> {
  await act(`keepalive:${name}`, async () => {
    await $fetch("/api/keepalive", { method: "POST", body: { agent: name, stopped } });
    await props.reread();
  });
}
</script>
