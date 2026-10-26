<template>
  <!-- Every work key's road at once: the provider it runs on, the tier its model comes from and —
       for a gate — how long it waits. A row opens that key's settings. -->
  <section class="flex min-h-0 min-w-0 flex-1 flex-col" :aria-label="props.gates ? $t('agents.label.column_gate') : $t('agents.label.tab_routes')">
    <DataTableSkeleton v-if="!ready && !failed" :headers="tableHeaders(columns)" :rows="props.only?.length ?? 8" :label="props.gates ? $t('agents.status.gates_loading') : $t('agents.status.routes_loading')" />
    <ReadFailure
      v-else-if="failed && !ready"
      class="mx-4 my-4 w-auto"
      :failure="readFailure"
      :message="$t('agents.error.settings_read_failed')"
      :reading="fallbackStatus === 'pending' || tiersStatus === 'pending'"
      @retry="reread()"
    />

    <!-- The whole table fills its tab; narrowed to a few keys it stands in a dialog and takes only
         its own height there. -->
    <!-- The gate table stands in the parts of the gate order, each gate at its step; a gate that runs
         in both parts of a turn has a row in each, and both rows edit the one key (the gate unit's docs/gates.md). -->
    <DataTable
      v-if="ready"
      :data="rows"
      :columns="columns"
      :layout="props.only === undefined ? 'fill' : 'own'"
      :sections="ordered ? sections : undefined"
      :section-of="ordered ? partOf : undefined"
      :row-key="ordered ? keyOf : undefined"
    >
      <template #step-cell="{ row }">
        <span :class="CELL_TEXT" class="ps-4">
          <SearchText class="tabular-nums text-highlighted" :text="cellText(row.original, 'step')" :query="props.query" />
          <SearchText v-if="cellNote(row.original, 'step') !== ''" class="text-muted" :text="cellNote(row.original, 'step')" :query="props.query" />
        </span>
      </template>

      <template #label-cell="{ row }">
        <span :id="row.original.first ? settingsAnchor(`route-${row.original.key}`) : undefined" :class="[CELL_TEXT, ordered ? '' : 'ps-4']">
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
        <!-- A gate on Laya is answered by the checkpoint the server names for it, and reads no
             tier: the cell shows that checkpoint and is not pressed (the gate unit's docs/laya.md). -->
        <span v-if="onLaya(row.original)" :class="CELL_TEXT">
          <SearchText class="break-all text-highlighted" :text="cellText(row.original, 'tier')" :query="props.query" />
          <span class="text-muted">{{ $t("agents.label.checkpoint") }}</span>
        </span>
        <SettingsPopoverCell
          v-else-if="row.original.assignment !== null && unresolvedOf(row.original)"
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

      <template #timeout-cell="{ row }">
        <SettingsChoiceCell
          v-if="row.original.profile?.gateOptions"
          :value="row.original.profile.gateOptions.timeoutMs"
          :items="timeoutItemsOf(row.original)"
          :label="$t('agents.aria.timeout_of', { name: row.original.label })"
          :save="(ms) => saveTimeout(row.original, Number(ms))"
        >
          <SearchText class="text-highlighted" :text="cellText(row.original, 'timeout')" :query="props.query" />
        </SettingsChoiceCell>
        <span v-else :class="CELL_TEXT" class="text-muted">—</span>
      </template>

      <!-- Whether the gate runs, for a gate whose profile lets the owner switch it off; every other
           gate always runs and shows a dash (the gate unit's docs/gates.md). -->
      <template #switch-cell="{ row }">
        <SettingsChoiceCell
          v-if="row.original.profile?.gateOptions?.switchable"
          :value="row.original.profile.gateOptions.enabled ? SWITCH_ON : SWITCH_OFF"
          :items="switchItems"
          :label="$t('agents.aria.switch_of', { name: row.original.label })"
          :save="(choice) => saveSwitch(row.original, choice === SWITCH_ON)"
        >
          <SearchText class="text-highlighted" :text="cellText(row.original, 'switch')" :query="props.query" />
        </SettingsChoiceCell>
        <span v-else :class="CELL_TEXT" class="text-muted">—</span>
      </template>

      <!-- The gate's Laya mode and tau, each edited in its own cell; a gate with no Laya probe takes
           neither (the gate unit's docs/laya.md). -->
      <template #laya-cell="{ row }">
        <SettingsChoiceCell
          v-if="row.original.profile?.gateOptions?.layaProbe && !onLaya(row.original)"
          :value="row.original.profile.gateOptions.layaMode ?? DEFAULT_CHOICE"
          :items="layaModeItemsOf(row.original)"
          :label="`${row.original.label} Laya`"
          :save="(mode) => saveLayaMode(row.original, String(mode))"
        >
          <SearchText class="text-highlighted" :text="cellText(row.original, 'laya')" :query="props.query" />
          <SearchText v-if="cellNote(row.original, 'laya') !== ''" class="text-muted" :text="cellNote(row.original, 'laya')" :query="props.query" />
        </SettingsChoiceCell>
        <!-- A gate on Laya takes no mode; what stands in its place is the LLM it asks where Laya gives
             no verdict (the gate unit's docs/laya.md, 「A gate whose provider is Laya」). -->
        <SettingsChoiceCell
          v-else-if="row.original.profile?.gateOptions && onLaya(row.original)"
          :value="row.original.profile.gateOptions.layaFallback ?? DEFAULT_CHOICE"
          :items="layaFallbackItemsOf(row.original)"
          :label="`${row.original.label} ${$t('agents.label.laya_fallback_choice')}`"
          :save="(choice) => saveLayaFallback(row.original, String(choice))"
        >
          <SearchText class="text-highlighted" :text="cellText(row.original, 'laya')" :query="props.query" />
        </SettingsChoiceCell>
        <span v-else :class="CELL_TEXT" class="text-muted">—</span>
      </template>

      <template #tau-cell="{ row }">
        <SettingsChoiceCell
          v-if="row.original.profile?.gateOptions?.layaProbe && !onLaya(row.original)"
          :value="row.original.profile.gateOptions.layaTau ?? NO_TAU"
          :items="tauItemsOf(row.original)"
          :label="$t('agents.aria.tau_of', { name: row.original.label })"
          :save="(tau) => saveTau(row.original, tau)"
        >
          <SearchText class="tabular-nums text-highlighted" :text="cellText(row.original, 'tau')" :query="props.query" />
        </SettingsChoiceCell>
        <span v-else :class="CELL_TEXT" class="text-muted">—</span>
      </template>

      <!-- How often Laya agrees with the gate's LLM, which is read and never pressed; until the
           records have been read it keeps its place with a skeleton rather than a dash. -->
      <template #agreement-cell="{ row }">
        <span v-if="row.original.profile?.gateOptions?.layaProbe && layaInitial" :class="CELL_TEXT" role="status" :aria-label="$t('agents.status.agreement_loading')">
          <SkeletonLine width="w-12" />
          <SkeletonLine width="w-24" />
        </span>
        <span v-else-if="row.original.profile?.gateOptions?.layaProbe" :class="CELL_TEXT">
          <SearchText class="tabular-nums text-highlighted" :text="cellText(row.original, 'agreement')" :query="props.query" />
          <SearchText class="tabular-nums text-muted" :text="cellNote(row.original, 'agreement')" :query="props.query" />
        </span>
        <span v-else :class="CELL_TEXT" class="text-muted">—</span>
      </template>

      <template v-for="column in READ_COLUMNS" :key="column" #[`${column}-cell`]="{ row }">
        <span :class="CELL_TEXT">
          <SearchText class="text-highlighted" :text="cellText(row.original, column)" :query="props.query" />
          <SearchText v-if="cellNote(row.original, column) !== ''" class="text-muted" :text="cellNote(row.original, column)" :query="props.query" />
        </span>
      </template>
    </DataTable>
  </section>
</template>

<script setup lang="ts">
import { LAYA_ROUTE_MODE } from "#shared/config";
import { tableHeaders } from "bmo-ui/app/domain/column-widths";
import {
  emptyFallbackView,
  GATE_TIMEOUTS,
  mappingText,
  routeModeChoices,
  routeModeText,
  secondsText,
  settingsAnchor,
  CELL_TEXT,
  tokensText
} from "~/domain/agent-settings";
import { accountCellText, accountChoices } from "~/domain/accounts";
import { GATE_CONDITION_NOTES, GATE_PART_LABELS, gatePlacements } from "~/domain/gate-order";
import { agreementNote, agreementOf, agreementText, layaGateOf, layaModeLabel, layaRefusalText, tauText, useLaya } from "~/domain/laya";
import { useAgentCatalogue } from "~/domain/catalogue";
import { failureText } from "bmo-ui/app/domain/errors";
import { useReadFailure } from "~/domain/events";
import { useIsland } from "bmo-ui/app/domain/island";
import { useInitialRead } from "bmo-ui/app/domain/loading";
import { PROFILE_LABELS, profileLabel } from "~/domain/research";
import { modeLabel, modelLabel } from "~/domain/status";

import type { CellChoice } from "~/domain/agent-settings";
import type { GatePlacement } from "~/domain/gate-order";
import type { TableSection } from "bmo-ui/app/domain/table-sections";
import type { TierProvider } from "#shared/agency";
import type { TierSettingsView } from "#shared/agency";
import type { FallbackProfile, FallbackView } from "#shared/types";
import type { TableColumn } from "@nuxt/ui";

interface Props {
  // The gate table rather than the table of every other work key.
  gates?: boolean;
  // Only these keys' rows, for the screen of one gate that edits its own row here rather than a
  // copy of it; left out, every key of the table stands.
  only?: readonly string[];
  query?: string;
}

const props = withDefaults(defineProps<Props>(), { gates: false, query: "" });
const { t } = useI18n();

// One row: a work key with its road, its tier and what last answered on it.
interface RouteRow {
  key: string;
  label: string;
  profile: FallbackProfile | null;
  assignment: TierSettingsView["assignments"][number] | null;
  warning: string | null;
  // Where the gate stands in the gate order, for a row of the whole gate table; null for every
  // other row, and for a gate the order does not place.
  place: GatePlacement | null;
  // Whether this is the key's first row, which carries the key's anchor for the settings search.
  first: boolean;
}

type DataColumn = "step" | "provider" | "account" | "tier" | "model" | "timeout" | "switch" | "laya" | "tau" | "agreement" | "recent";

const DATA_COLUMNS = computed<DataColumn[]>(() => (props.gates
  ? ["provider", "account", "tier", "timeout", "switch", "laya", "tau", "agreement", "recent"]
  : ["provider", "account", "tier", "model", "recent"]));

// The columns that show what the bot worked out and are not pressed.
const READ_COLUMNS = ["model", "recent"] as const;

const HEADERS: Record<DataColumn, string> = { step: t("agents.label.column_step"), provider: t("agents.label.column_provider"), account: t("agents.label.column_account"), tier: t("agents.label.tier"), model: t("agents.label.column_model"), timeout: t("agents.label.column_timeout"), switch: t("agents.label.column_switch"), laya: "Laya", tau: t("agents.label.column_tau"), agreement: t("agents.label.column_agreement"), recent: t("agents.label.column_recent") };

// A cell's choice standing for "nothing chosen": the gate's own default mode, and no tau.
const DEFAULT_CHOICE = "default";
// What a gate on Laya's fallback setting says where it asks no LLM (the gate unit's docs/laya.md).
const NO_LAYA_FALLBACK = "none";
const NO_TAU = "none";
// The two choices of a gate's switch.
const SWITCH_ON = "on";
const SWITCH_OFF = "off";

const columns = computed<TableColumn<RouteRow>[]>(() => [
  ...(ordered.value ? [{ id: "step", header: HEADERS.step, meta: { class: { th: "w-20" } } }] : []),
  { accessorKey: "label", header: props.gates ? t("agents.label.column_gate") : t("agents.label.column_work"), meta: { class: { th: "w-full" } } },
  ...DATA_COLUMNS.value.map((column) => ({ id: column, header: HEADERS[column] }))
]);

const { agents } = useAgentCatalogue();
const { laya, status: layaStatus } = useLaya(t);
const layaInitial = useInitialRead(layaStatus);
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

// The whole gate table stands in the parts of the gate order; one gate's own row, and the table of
// every other key, stand as one list.
const ordered = computed(() => props.gates && props.only === undefined);

const sections = computed<TableSection[]>(() =>
  (agents.value.gateOrder ?? []).map((part) => ({ key: part.part, label: t(GATE_PART_LABELS[part.part]) }))
);

function partOf(row: RouteRow): string | null {
  return row.place?.part ?? null;
}

function keyOf(row: RouteRow): string {
  return row.key;
}

function rowOf(key: string, place: GatePlacement | null, first: boolean): RouteRow {
  const profile = fallback.value?.profiles.find((one) => one.key === key) ?? null;
  const assignment = tiers.value?.assignments.find((one) => one.key === key) ?? null;

  return { key, label: keyLabel(key), profile, assignment, warning: profile?.noRoute ?? (assignment === null ? t("agents.status.no_tier_assignment") : null), place, first };
}

// Each gate at every place the gate order gives it, and after them any gate the order does not
// place, so a gate is never left off the table.
function orderedGateRows(gateKeys: readonly string[]): RouteRow[] {
  const placed = gatePlacements(agents.value.gateOrder ?? []).filter((placement) => gateKeys.includes(placement.key));
  const unplaced = gateKeys.filter((key) => !placed.some((placement) => placement.key === key));
  const seen = new Set<string>();

  return [...placed.map((placement) => ({ key: placement.key, place: placement })), ...unplaced.map((key) => ({ key, place: null }))].map(({ key, place }) => {
    const first = !seen.has(key);

    seen.add(key);

    return rowOf(key, place, first);
  });
}

const rows = computed<RouteRow[]>(() => {
  const profiles = fallback.value?.profiles ?? [];
  const assignments = tiers.value?.assignments ?? [];
  const gateKeys = profiles.filter((one) => one.kind === "gate").map((one) => one.key);

  if (ordered.value) return orderedGateRows(gateKeys);

  const keys = props.gates
    ? gateKeys
    : [...profiles.filter((one) => one.kind !== "gate").map((one) => one.key), ...assignments.map((one) => one.key).filter((key) => !gateKeys.includes(key) && !profiles.some((one) => one.key === key))];

  return keys.filter((key) => props.only === undefined || props.only.includes(key)).map((key) => rowOf(key, null, true));
});

// The provider a key's run begins on: the one it is set to while that one is on, else the first
// provider of the order that is on.
function startProvider(row: RouteRow): TierProvider | null {
  const order = fallback.value?.order ?? [];
  const mode = row.profile?.routeMode ?? "auto";
  const pinned = mode === "auto" || mode === LAYA_ROUTE_MODE ? undefined : order.find((one) => one.name === mode && one.enabled);

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

// Whether the key stands on Laya, which reads no tier, account, wait, mode or tau of its own.
function onLaya(row: RouteRow): boolean {
  return row.profile?.routeMode === LAYA_ROUTE_MODE;
}

function cellText(row: RouteRow, column: DataColumn): string {
  switch (column) {
    case "step":
      return row.place?.step == null ? "—" : String(row.place.step);
    case "provider":
      return modeText(row);
    case "account":
      return accountCellText(t, accounts.value, row.profile?.account ?? null);
    case "tier":
      if (onLaya(row)) return layaGateOf(laya.value, row.key)?.checkpoint ?? t("agents.status.laya_unchecked");

      return row.assignment?.tier ?? t("agents.label.no_assignment");
    case "model": {
      const start = startProvider(row);
      const shown = start === null ? null : mappingText(t, selectionOf(row, start), capsTokensOf(start));

      return shown?.model ?? "—";
    }
    case "timeout": {
      const options = row.profile?.gateOptions;

      return options ? secondsText(t, options.effective.timeoutMs) : "—";
    }
    case "switch": {
      const options = row.profile?.gateOptions;

      if (!options?.switchable) return "—";

      return options.enabled ? t("agents.label.gate_on") : t("agents.label.gate_off");
    }
    case "laya": {
      const options = row.profile?.gateOptions;

      if (options !== undefined && onLaya(row)) return layaFallbackText(row);

      return options?.layaProbe ? layaModeLabel(laya.value, options.effective.layaMode) : "—";
    }
    case "tau":
      return row.profile?.gateOptions?.layaProbe ? tauText(t, row.profile.gateOptions.layaTau) : "—";
    case "agreement":
      return agreementText(agreementOf(laya.value, row.key));
    case "recent":
      return recentOf(row.key) || "—";
  }
}

function cellNote(row: RouteRow, column: DataColumn): string {
  // A step that starts other gates with it says so, and a step that runs in some turns only says
  // which.
  if (column === "step") {
    const together = row.place?.together ? t("agents.label.gate_together") : "";
    const condition = row.place?.condition ? t(GATE_CONDITION_NOTES[row.place.condition]) : "";

    return [together, condition].filter((note) => note !== "").join(" · ");
  }
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
  if (column === "laya") return row.profile?.gateOptions?.layaProbe && row.profile.gateOptions.layaMode === null ? t("common.label.default") : "";
  if (column === "agreement") return agreementNote(t, agreementOf(laya.value, row.key), row.profile?.gateOptions?.effective.layaTau ?? null);
  // A gate on a road of requests with no tools asks it for an answer room and thinking; the note
  // names the registration its tier maps to there. A gate on any other road asks for neither, and
  // the note says nothing.
  if (column === "tier" && props.gates && row.profile?.gateOptions) {
    const start = startProvider(row);
    const service = fallback.value?.services.find((one) => one.name === start);
    const effective = row.profile.gateOptions.effective;

    if (service === undefined) return "";

    const registration = row.profile.services.find((one) => one.provider === start)?.model;
    const figures = { service: registration === undefined || registration === "" ? service.shortLabel : registration, tokens: tokensText(t, effective.answerTokens) };

    return effective.thinking ? t("agents.label.service_thinking_on", figures) : t("agents.label.service_thinking_off", figures);
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

// The waits a gate may be given, and the one its row holds where that is none of them, so the cell
// always offers the value it shows. A wait is never cleared: the row is the only place it is set.
function timeoutItemsOf(row: RouteRow): CellChoice[] {
  const held = row.profile?.gateOptions?.timeoutMs;
  const values = held === undefined || (GATE_TIMEOUTS as readonly number[]).includes(held) ? [...GATE_TIMEOUTS] : [...GATE_TIMEOUTS, held].sort((a, b) => a - b);

  return values.map((value) => ({ value, label: secondsText(t, value) }));
}

// The modes a gate may take, the gate's own default first under the name of the mode it is. A mode
// the bot would refuse this gate stands greyed with why under it (the gate unit's docs/laya.md, 「Mode and tau per gate」).
function layaModeItemsOf(row: RouteRow): CellChoice[] {
  const fallbackTo = row.profile?.gateOptions?.defaults.layaMode ?? "off";
  const refused = layaGateOf(laya.value, row.key)?.refused ?? {};

  return [
    { value: DEFAULT_CHOICE, label: t("agents.label.default_with", { value: layaModeLabel(laya.value, fallbackTo) }) },
    ...laya.value.modes.map((mode) => {
      const why = refused[mode.value];

      return why === undefined
        ? { value: mode.value, label: mode.label }
        : { value: mode.value, label: mode.label, disabled: true, description: layaRefusalText(t, why) };
    }),
  ];
}

// The LLMs a gate on Laya may ask where Laya gives no verdict: the provider its road would begin on,
// none, or any provider the owner keeps on.
function providerLabelOf(name: string | null): string {
  return fallback.value?.order.find((one) => one.name === name)?.label ?? name ?? "—";
}

function layaFallbackItemsOf(row: RouteRow): CellChoice[] {
  return [
    { value: DEFAULT_CHOICE, label: t("agents.label.default_with", { value: providerLabelOf(startProvider(row)) }) },
    { value: NO_LAYA_FALLBACK, label: t("agents.label.laya_fallback_none") },
    ...(fallback.value?.order ?? []).filter((one) => one.enabled).map((one) => ({ value: one.name, label: one.label })),
  ];
}

function layaFallbackText(row: RouteRow): string {
  const chosen = row.profile?.gateOptions?.layaFallback ?? null;

  if (chosen === NO_LAYA_FALLBACK) return t("agents.label.laya_fallback_none");

  return t("agents.label.laya_fallback", { value: providerLabelOf(chosen ?? startProvider(row)) });
}

const switchItems = computed<CellChoice[]>(() => [
  { value: SWITCH_ON, label: t("agents.label.gate_on") },
  { value: SWITCH_OFF, label: t("agents.label.gate_off") },
]);

// The taus a gate may be given: the grid its agreement is counted at, each with its figure beside it,
// and the value the row already holds where that is none of them, so the cell always offers what it
// shows. A tau is cleared only by choosing none.
function tauItemsOf(row: RouteRow): CellChoice[] {
  const held = row.profile?.gateOptions?.layaTau ?? null;
  const values = held === null || laya.value.taus.includes(held) ? [...laya.value.taus] : [...laya.value.taus, held].sort((a, b) => a - b);

  return [
    { value: NO_TAU, label: tauText(t, null) },
    ...values.map((tau) => ({ value: tau, label: tauText(t, tau) })),
  ];
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

async function saveTimeout(row: RouteRow, ms: number): Promise<string | null> {
  return await send("/api/fallback", { action: "set-gate-options", key: row.key, timeoutMs: ms });
}

async function saveSwitch(row: RouteRow, enabled: boolean): Promise<string | null> {
  return await send("/api/fallback", { action: "set-gate-options", key: row.key, enabled });
}

async function saveLayaMode(row: RouteRow, mode: string): Promise<string | null> {
  return await send("/api/fallback", { action: "set-gate-options", key: row.key, layaMode: mode === DEFAULT_CHOICE ? null : mode });
}

async function saveLayaFallback(row: RouteRow, choice: string): Promise<string | null> {
  return await send("/api/fallback", { action: "set-gate-options", key: row.key, layaFallback: choice === DEFAULT_CHOICE ? null : choice });
}

async function saveTau(row: RouteRow, tau: string | number): Promise<string | null> {
  return await send("/api/fallback", { action: "set-gate-options", key: row.key, layaTau: tau === NO_TAU ? null : Number(tau) });
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
