<template>
  <!-- The agents tab's sign-up composition (docs/web.md, 「Organisation」, the agents tab): for the unit chosen in the tree,
       the company where none is, each role with the agents a person here is given as their account is made ready —
       off, none, or a number of agents, each on a road the unit chooses or on the road of the role's own agent — or
       following above, with what that comes to, and what the units below may do with it. Each choice is saved as it is
       made, a road in its own form. -->
  <SettingsGroup :title="$t('org_agents.title.composition')" data-composition>
    <p v-if="view === null && failure !== ''" role="alert" class="py-3 text-sm text-error">{{ failure }}</p>
    <ContentSkeleton v-else-if="view === null" :rows="3" list-class="flex flex-col divide-y divide-default" :label="$t('bmo_profile.status.loading')">
      <div class="flex items-center gap-4 py-3">
        <SkeletonLine width="w-1/3" />
        <SkeletonBar class="ms-auto h-8 w-32 shrink-0 rounded-md" />
      </div>
    </ContentSkeleton>
    <template v-else>
      <SettingsRow :label="$t('org_agents.label.below')" :description="view.lockedBy !== null ? $t('org_agents.label.locked_above') : ''">
        <ChoiceSelect
          :model-value="view.delegation"
          :items="delegations"
          value-key="value"
          class="w-40"
          :disabled="busy !== '' || !view.writable"
          :aria-label="$t('org_agents.aria.delegation', { name: $t('org_agents.title.composition') })"
          data-composition-delegation
          @update:model-value="(value: unknown) => void delegate(value)"
        />
      </SettingsRow>
      <template v-for="row in view.roles" :key="row.role">
        <SettingsRow :label="row.label" :description="row.own === null ? standsLine(row) : ''" :data-composition-role="row.role">
          <ChoiceSelect
            :model-value="choiceKey(row.own)"
            :items="choices"
            value-key="value"
            class="w-36"
            :loading="busy === row.role"
            :disabled="busy !== '' || !view.writable"
            :aria-label="$t('org_agents.aria.role_choice', { name: row.label })"
            @update:model-value="(value: unknown) => void choose(row, value)"
          />
        </SettingsRow>
        <!-- Each agent the unit gives of the role, on its road or on the role's own agent's, its road changed in its
             own form. -->
        <template v-if="row.own !== null && 'agents' in row.own">
          <SettingsRow
            v-for="(road, index) in roadsOf(row.own)"
            :key="`${row.role}:${index}`"
            :label="$t('org_agents.label.composition_agent', { name: row.label, count: index + 1 })"
            :description="roadLine(road, view.providers, $t('org_agents.label.road_role_default'))"
            :data-composition-agent="`${row.role}:${index}`"
          >
            <UButton
              color="neutral"
              variant="outline"
              :label="$t('account.action.change')"
              :disabled="busy !== '' || !view.writable"
              :aria-label="$t('org_agents.aria.composition_road', { name: row.label, count: index + 1 })"
              data-composition-road
              @click="openRoad(row, index)"
            />
          </SettingsRow>
        </template>
      </template>
      <p v-if="failure !== ''" role="alert" class="break-words text-sm text-error" data-composition-failure>{{ failure }}</p>
      <RoadDialog
        v-if="roadFor !== null"
        v-model:open="roadOpen"
        :title="$t('org_agents.label.composition_agent', { name: roadFor.row.label, count: roadFor.index + 1 })"
        :providers="view.providers"
        :line="roadFor.row.line"
        :road="roadsOf(roadFor.row.own)[roadFor.index] ?? null"
        :none-label="$t('org_agents.label.road_role_default')"
        :models-url="(provider: string) => `/api/organization/units/${unit}/composition/models/${encodeURIComponent(provider)}`"
        :save="saveRoad"
      />
    </template>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { UNIT_KEY } from "~/domain/organization";
import { roadLine } from "~/domain/own-agents";

import type { Organization } from "~/domain/organization";
import type { ChainDelegation, CompositionChoice, CompositionRoleView, CompositionView } from "#shared/organisation-supply";
import type { OwnRoad } from "#shared/own-agents";

interface Props {
  // The organisation chosen; the unit read is the one the tree chooses under it, the company itself where none is.
  company: Organization;
}

const props = defineProps<Props>();

const { t } = useI18n();
const route = useRoute();

// The most agents of one role a composition gives a person, as the agency's policy holds it.
const MOST_AGENTS = 3;

const unit = computed(() => {
  const chosen = Number(route.query[UNIT_KEY]);

  return Number.isInteger(chosen) && chosen > 0 ? chosen : props.company.id;
});
const view = ref<CompositionView | null>(null);
const failure = ref("");
const busy = ref("");

const delegations = computed(() => [
  { value: "inherit", label: t("org_agents.label.delegation_inherit") },
  { value: "allow", label: t("org_agents.label.delegation_allow") },
  { value: "lock", label: t("org_agents.label.delegation_lock") }
]);
// A role's word: following above, off, no agents, or one to the most agents.
const choices = computed(() => [
  { value: "inherit", label: t("org_agents.label.choice_inherit") },
  { value: "off", label: t("org_agents.label.choice_off") },
  { value: "0", label: t("org_agents.label.choice_none") },
  ...Array.from({ length: MOST_AGENTS }, (_, index) => ({ value: String(index + 1), label: t("org_agents.label.choice_agents", { count: index + 1 }) }))
]);

function choiceKey(own: CompositionChoice | null): string {
  if (own === null) return "inherit";

  return "off" in own ? "off" : String(own.agents);
}

// What a role following above comes to.
function standsLine(row: CompositionRoleView): string {
  if (row.off) return t("org_agents.label.stands_off");
  if (row.agents === null) return t("org_agents.label.stands_platform");

  return row.agents === 0 ? t("org_agents.label.choice_none") : t("org_agents.label.stands_agents", { count: row.agents });
}

// The roads of the agents a unit's word gives, one a seat; none for a word that gives none.
function roadsOf(own: CompositionChoice | null): (OwnRoad | null)[] {
  if (own === null || "off" in own) return [];

  return Array.from({ length: own.agents }, (_, index) => own.roads[index] ?? null);
}

async function read(): Promise<void> {
  failure.value = "";
  try {
    view.value = await $fetch<CompositionView>(`/api/organization/units/${unit.value}/composition`);
  } catch (error) {
    view.value = null;
    failure.value = failureText(error, t("org_agents.error.forbidden"));
  }
}

async function write(key: string, body: Record<string, unknown>): Promise<void> {
  busy.value = key;
  failure.value = "";
  try {
    await $fetch(`/api/organization/units/${unit.value}/composition`, { method: "PUT", body });
  } catch (error) {
    failure.value = failureText(error, t("org_agents.error.bad_composition"));
  } finally {
    busy.value = "";
  }

  const kept = failure.value;

  await read();
  failure.value = kept;
}

async function choose(row: CompositionRoleView, chosen: unknown): Promise<void> {
  if (typeof chosen !== "string" || chosen === choiceKey(row.own)) return;

  // A number of agents keeps the roads the unit already gave the seats it keeps.
  const choice: CompositionChoice | null = chosen === "inherit" ? null : chosen === "off" ? { off: true } : { agents: Number(chosen), roads: roadsOf(row.own).slice(0, Number(chosen)) };

  await write(row.role, { role: row.role, choice });
}

// --- One agent's road ---

const roadFor = ref<{ row: CompositionRoleView; index: number } | null>(null);
const roadOpen = ref(false);

function openRoad(row: CompositionRoleView, index: number): void {
  roadFor.value = { row, index };
  roadOpen.value = true;
}

// The road of one seat written with the role's other seats as they stand; a refusal stays in the form.
async function saveRoad(road: OwnRoad | null): Promise<void> {
  const target = roadFor.value;

  if (target === null) return;

  const roads = roadsOf(target.row.own);

  roads[target.index] = road;
  await $fetch(`/api/organization/units/${unit.value}/composition`, { method: "PUT", body: { role: target.row.role, choice: { agents: roads.length, roads } } });
  await read();
}

async function delegate(chosen: unknown): Promise<void> {
  if (typeof chosen !== "string" || chosen === view.value?.delegation) return;

  await write("delegation", { delegation: chosen as ChainDelegation });
}

watch(unit, () => void read());
onMounted(() => void read());
</script>
