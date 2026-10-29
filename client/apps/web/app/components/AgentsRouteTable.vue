<template>
  <!-- Every work key's road at once: the provider it runs on and the tier its model comes from. -->
  <section class="flex min-h-0 min-w-0 flex-1 flex-col" :aria-label="$t('agents.label.tab_routes')">
    <DataTableSkeleton v-if="!ready && !failed" :headers="tableHeaders(columns)" :rows="8" :label="$t('agents.status.routes_loading')" />
    <ReadFailure
      v-else-if="failed && !ready"
      class="mx-4 my-4 w-auto"
      :failure="readFailure"
      :message="$t('agents.error.settings_read_failed')"
      :reading="fallbackStatus === 'pending' || tiersStatus === 'pending'"
      @retry="reread()"
    />

    <!-- The whole table fills its tab. -->
    <DataTable v-if="ready" :data="rows" :columns="columns" layout="fill">
      <template #label-cell="{ row }">
        <span :id="settingsAnchor(`route-${row.original.key}`)" :class="[CELL_TEXT, 'ps-4']">
          <span class="flex min-w-0 items-start gap-2">
            <UIcon
              :name="row.original.warning === null ? 'i-material-symbols-check-circle-outline' : 'i-material-symbols-warning-outline'"
              class="badge-ink mt-0.5 size-4 shrink-0"
              :class="row.original.warning === null ? 'text-success' : 'text-warning'"
            />
            <span class="flex min-w-0 flex-col">
              <SearchText class="font-medium text-highlighted" :text="row.original.label" :query="props.query" />
              <SearchText class="font-mono text-muted" :text="row.original.key" :query="props.query" />
            </span>
          </span>
        </span>
      </template>

      <template #provider-cell="{ row }">
        <SettingsChoiceCell
          v-if="row.original.profile !== null"
          :value="row.original.profile.routeMode"
          :items="modeItemsOf(row.original)"
          :label="$t('agents.aria.provider_of', { name: row.original.label })"
          :save="(mode) => saveMode(row.original, String(mode))"
        >
          <SearchText class="text-highlighted" :text="cellText(row.original, 'provider')" :query="props.query" />
          <SearchText v-if="cellNote(row.original, 'provider') !== ''" class="text-muted" :text="cellNote(row.original, 'provider')" :query="props.query" />
        </SettingsChoiceCell>
        <span v-else :class="CELL_TEXT">
          <SearchText class="text-highlighted" :text="cellText(row.original, 'provider')" :query="props.query" />
          <SearchText v-if="cellNote(row.original, 'provider') !== ''" class="text-muted" :text="cellNote(row.original, 'provider')" :query="props.query" />
        </span>
      </template>

      <!-- Which Claude login the key runs on. A key with no road of its own, and one set to a
           provider other than Claude Code, never reaches an account at all: the cell then shows a
           dash and is not pressed, exactly as the provider cell beside it does. -->
      <template #account-cell="{ row }">
        <SettingsChoiceCell
          v-if="row.original.profile !== null && onClaude(row.original)"
          :value="row.original.profile.account ?? 'auto'"
          :items="accountItems"
          :label="$t('agents.aria.account_of', { name: row.original.label })"
          :save="(account) => saveAccount(row.original, String(account))"
        >
          <SearchText class="text-highlighted" :text="cellText(row.original, 'account')" :query="props.query" />
          <SearchText v-if="cellNote(row.original, 'account') !== ''" class="text-muted" :text="cellNote(row.original, 'account')" :query="props.query" />
        </SettingsChoiceCell>
        <span v-else :class="CELL_TEXT" class="text-muted">—</span>
      </template>

      <template #tier-cell="{ row }">
        <SettingsPopoverCell
          v-if="row.original.assignment !== null && unresolvedOf(row.original)"
          :label="$t('agents.aria.tier_of', { name: row.original.label })"
          :busy="savingTier === row.original.key"
          @update:open="(now: boolean) => now && (acceptConflicts = false)"
        >
          <SearchText class="text-highlighted" :text="cellText(row.original, 'tier')" :query="props.query" />
          <span class="badge-ink text-warning">{{ $t("agents.title.previous_check") }}</span>

          <template #content>
            <div class="flex flex-col gap-1 text-sm">
              <p class="text-muted">{{ $t("agents.label.previous") }}</p>
              <ul class="flex flex-col gap-1">
                <li v-for="conflict in conflictsOf(row.original)" :key="conflict.provider" class="break-all text-toned">
                  {{ modeLabel($t, conflict.provider) }} · {{ conflict.previous.model }} · {{ conflict.previous.effort ?? $t("agents.label.unset") }} · {{ conflict.accepted ? $t("agents.status.tier_applied") : $t("agents.status.check_needed") }}
                </li>
              </ul>
            </div>
            <UCheckbox v-model="acceptConflicts" :label="$t('agents.action.previous_confirm')" />
            <UFormField :label="$t('agents.label.tier')" name="tier">
              <USelect
                :model-value="row.original.assignment.tier"
                :content="{ align: 'start' }"
                :items="tierItemsOf(row.original)"
                value-key="value"
                class="w-full"
                :disabled="!acceptConflicts || savingTier !== ''"
                :aria-label="$t('agents.label.tier')"
                @update:model-value="(tier: unknown) => saveTier(row.original, String(tier)).then(sayRefusal)"
              />
            </UFormField>
          </template>
        </SettingsPopoverCell>
        <SettingsChoiceCell
          v-else-if="row.original.assignment !== null"
          :value="row.original.assignment.tier"
          :items="tierItemsOf(row.original)"
          :label="$t('agents.aria.tier_of', { name: row.original.label })"
          :save="(tier) => saveTier(row.original, String(tier))"
        >
          <SearchText class="text-highlighted" :text="cellText(row.original, 'tier')" :query="props.query" />
          <SearchText v-if="cellNote(row.original, 'tier') !== ''" class="text-muted" :text="cellNote(row.original, 'tier')" :query="props.query" />
        </SettingsChoiceCell>
        <span v-else :class="CELL_TEXT" class="text-muted">{{ $t("agents.label.no_assignment") }}</span>
      </template>

      <template v-for="column in READ_COLUMNS" :key="column" #[`${column}-cell`]="{ row }">
        <!-- The cell keeps a ceiling of its own; a note longer than it — why the key does not resolve on the provider it
             starts on — is cut on one line and stands whole in the tooltip every cut line gets. -->
        <span :class="CELL_TEXT" class="max-w-64">
          <SearchText class="text-highlighted" :text="cellText(row.original, column)" :query="props.query" />
          <SearchText v-if="cellNote(row.original, column) !== ''" class="block truncate text-muted" :text="cellNote(row.original, column)" :query="props.query" />
        </span>
      </template>
    </DataTable>
  </section>
</template>

<script setup lang="ts">
import { tableHeaders } from "bmo-ui/app/domain/column-widths";
import {
  CELL_TEXT,
  emptyFallbackView,
  mappingText,
  routeModeChoices,
  routeModeText,
  settingsAnchor
} from "~/domain/agent-settings";
import { accountCellText, accountChoices } from "~/domain/accounts";
import { useAgentCatalogue } from "~/domain/catalogue";
import { failureText } from "bmo-ui/app/domain/errors";
import { useReadFailure } from "~/domain/events";
import { useIsland } from "bmo-ui/app/domain/island";
import { useInitialRead } from "bmo-ui/app/domain/loading";
import { PROFILE_LABELS, profileLabel } from "~/domain/research";
import { modeLabel, modelLabel } from "~/domain/status";

import type { CellChoice } from "~/domain/agent-settings";
import type { TierProvider } from "#shared/agency";
import type { TierSettingsView } from "#shared/agency";
import type { FallbackProfile, FallbackView } from "#shared/types";
import type { TableColumn } from "@nuxt/ui";

interface Props {
  query?: string;
}

const props = withDefaults(defineProps<Props>(), { query: "" });
const { t } = useI18n();

// One row: a work key with its road, its tier and what last answered on it.
interface RouteRow {
  key: string;
  label: string;
  profile: FallbackProfile | null;
  assignment: TierSettingsView["assignments"][number] | null;
  warning: string | null;
}

type DataColumn = "provider" | "account" | "tier" | "model" | "recent";

const DATA_COLUMNS: readonly DataColumn[] = ["provider", "account", "tier", "model", "recent"];

// The columns that show what the bot worked out and are not pressed.
const READ_COLUMNS = ["model", "recent"] as const;

const HEADERS: Record<DataColumn, string> = { provider: t("agents.label.column_provider"), account: t("agents.label.column_account"), tier: t("agents.label.tier"), model: t("agents.label.column_model"), recent: t("agents.label.column_recent") };

const columns = computed<TableColumn<RouteRow>[]>(() => [
  { accessorKey: "label", header: t("agents.label.column_work"), meta: { class: { th: "w-full" } } },
  ...DATA_COLUMNS.map((column) => ({ id: column, header: HEADERS[column] }))
]);

const { agents } = useAgentCatalogue();
const { data: fallback, status: fallbackStatus, refresh: rereadFallback } = useFetch<FallbackView>("/api/fallback", { key: "fallback", lazy: true, server: false, default: emptyFallbackView });
const { data: tiers, status: tiersStatus, refresh: rereadTiers } = useFetch<TierSettingsView>("/api/model-tiers", { key: "model-tiers", lazy: true, server: false });

const fallbackInitial = useInitialRead(fallbackStatus);
const ready = computed(() => !fallbackInitial.value && fallbackStatus.value !== "error" && tiers.value != null);
const failed = computed(() => fallbackStatus.value === "error" || tiersStatus.value === "error");

async function reread(): Promise<void> {
  await Promise.all([rereadFallback(), rereadTiers()]);
}

const readFailure = useReadFailure({
  failed: () => failed.value && !ready.value,
  reading: () => fallbackStatus.value === "pending" || tiersStatus.value === "pending",
  reread: () => void reread()
});

function keyLabel(key: string): string {
  const named = agents.value.agents.find((agent) => agent.name === key)?.label;

  if (named) return named;
  if (key.startsWith("role:")) return t("agents.label.role_key", { role: key.slice(5) });
  if (key in PROFILE_LABELS) return profileLabel(t, key);
  if (key === "search") return t("agents.label.key_search");

  return fallback.value?.profiles.find((one) => one.key === key)?.label ?? key;
}

function rowOf(key: string): RouteRow {
  const profile = fallback.value?.profiles.find((one) => one.key === key) ?? null;
  const assignment = tiers.value?.assignments.find((one) => one.key === key) ?? null;

  return { key, label: keyLabel(key), profile, assignment, warning: profile?.noRoute ?? (assignment === null ? t("agents.status.no_tier_assignment") : null) };
}

// The translator's road is fixed and is reached as a tool, not a road the owner routes (docs/web.md, the route
// table); its profile and any tier assignment it holds stand no row.
const FIXED_LINES: readonly string[] = ["translate"];

const rows = computed<RouteRow[]>(() => {
  const profiles = fallback.value?.profiles ?? [];
  const assignments = tiers.value?.assignments ?? [];
  const hidden = new Set(profiles.filter((one) => one.kind === "gate" || FIXED_LINES.includes(one.line)).map((one) => one.key));
  const keys = [...profiles.filter((one) => !hidden.has(one.key)).map((one) => one.key), ...assignments.map((one) => one.key).filter((key) => !hidden.has(key) && !profiles.some((one) => one.key === key))];

  return keys.map((key) => rowOf(key));
});

// The provider a key's run begins on: the one it is set to while that one is on, else the first
// provider of the order that is on.
function startProvider(row: RouteRow): TierProvider | null {
  const order = fallback.value?.order ?? [];
  const mode = row.profile?.routeMode ?? "auto";
  const pinned = mode === "auto" ? undefined : order.find((one) => one.name === mode && one.enabled);

  return (pinned ?? order.find((one) => one.enabled))?.name ?? null;
}

// Whether the provider's mapping carries an answer ceiling, as the tier report says it does.
function capsTokensOf(provider: TierProvider): boolean {
  return tiers.value?.providers.find((one) => one.provider === provider)?.capsAnswerTokens ?? false;
}

function selectionOf(row: RouteRow, provider: TierProvider) {
  return row.assignment?.effective.find((one) => one.provider === provider)?.selection ?? null;
}

function recentOf(key: string): string {
  const agent = agents.value.agents.find((one) => one.name === key);

  if (agent === undefined || agent.lastMode === null) return "";

  return [modeLabel(t, agent.lastMode), agent.lastModel === null ? null : modelLabel(agent.lastModel)].filter(Boolean).join(" · ");
}

function modeText(row: RouteRow): string {
  if (row.profile === null) return "—";

  return routeModeText(t, row.profile);
}

function cellText(row: RouteRow, column: DataColumn): string {
  switch (column) {
    case "provider":
      return modeText(row);
    case "account":
      return accountCellText(t, accounts.value, row.profile?.account ?? null);
    case "tier":
      return row.assignment?.tier ?? t("agents.label.no_assignment");
    case "model": {
      const start = startProvider(row);
      const shown = start === null ? null : mappingText(t, selectionOf(row, start), capsTokensOf(start));

      return shown?.model ?? "—";
    }
    case "recent":
      return recentOf(row.key) || "—";
  }
}

function cellNote(row: RouteRow, column: DataColumn): string {
  if (column === "provider") return row.warning ?? "";
  // A pinned login that is off walks the order like any other key, which is worth saying on the
  // row rather than leaving the name standing as though it were being used.
  if (column === "account") {
    const pinned = accounts.value.find((one) => one.id === row.profile?.account);

    return pinned !== undefined && !pinned.enabled ? t("agents.label.account_off") : "";
  }
  // The provider the run starts on, or, where the key does not resolve there, why, in the pack's words.
  if (column === "model") {
    const start = startProvider(row);

    if (start === null) return "";

    return row.assignment?.effective.find((one) => one.provider === start)?.error ?? modeLabel(t, start);
  }

  return "";
}

const island = useIsland(t);
const savingTier = ref("");
const acceptConflicts = ref(false);

function modeItemsOf(row: RouteRow): CellChoice[] {
  return routeModeChoices(t, row.profile?.offered ?? []);
}

const accounts = computed(() => fallback.value?.accounts ?? []);
const accountItems = computed<CellChoice[]>(() => accountChoices(t, accounts.value));

// Whether this key's runs reach a Claude login at all: a key set to another provider runs there
// alone and never asks the account order.
function onClaude(row: RouteRow): boolean {
  const mode = row.profile?.routeMode ?? "auto";

  return mode === "auto" || mode === "claude-code";
}

// The tiers a key may take, each with the model it maps to on the provider the key starts on.
function tierItemsOf(row: RouteRow): CellChoice[] {
  const start = startProvider(row);
  const choices = row.assignment?.choices ?? tiers.value?.tiers ?? [];

  return choices.map((tier) => {
    const shown = start === null ? null : mappingText(t, tiers.value?.mappings.find((one) => one.provider === start && one.tier === tier), capsTokensOf(start));

    return { value: tier, label: tier, description: shown === null ? undefined : `${shown.model} · ${shown.detail}` };
  });
}

function conflictsOf(row: RouteRow) {
  return tiers.value?.conflicts.filter((one) => one.key === row.key) ?? [];
}

function unresolvedOf(row: RouteRow): boolean {
  return conflictsOf(row).some((one) => !one.accepted);
}

function sayRefusal(refused: string | null): void {
  if (refused !== null) island.say({ key: "route-tier", title: t("agents.error.tier_not_saved"), description: refused, tone: "error" });
}

async function send(path: string, body: Record<string, unknown>): Promise<string | null> {
  try {
    await $fetch(path, { method: "POST", body });
    // The catalogue carries the model each agent starts on, which a tier or road change moves, and
    // every screen showing that model reads it under the one key.
    await Promise.all([reread(), refreshNuxtData(["execution-fallback", "agents"])]);

    return null;
  } catch (failure) {
    await reread();

    return failureText(failure, t("common.error.save_failed"));
  }
}

async function saveMode(row: RouteRow, mode: string): Promise<string | null> {
  return await send("/api/fallback", { action: "set-route-mode", key: row.key, mode });
}

async function saveAccount(row: RouteRow, account: string): Promise<string | null> {
  return await send("/api/fallback", { action: "set-route-account", key: row.key, account });
}

async function saveTier(row: RouteRow, tier: string): Promise<string | null> {
  if (row.assignment === null || tier === row.assignment.tier) return null;

  savingTier.value = row.key;

  try {
    return await send("/api/model-tiers", { action: "assign", key: row.key, tier, acceptConflicts: acceptConflicts.value });
  } finally {
    savingTier.value = "";
  }
}

defineExpose({ reread });
</script>
