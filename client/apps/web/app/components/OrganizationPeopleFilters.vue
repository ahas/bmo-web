<template>
  <!-- The people tab's four filters (docs/web.md, 「Organisation」, the people tab): the company, for a reader who
       looks through more than one; the unit, from the chosen company's tree as the invitations' unit is chosen; the
       role and the state. A filter set nowhere shows its own name, and the choice of every value sets it back. In the list's head they stand side by side, and in the
       narrow screen's drawer one under another, each under its name. -->
  <div :class="props.stacked ? 'flex flex-col gap-4' : 'flex flex-wrap items-center gap-2'" data-roster-filters>
    <component :is="props.stacked ? UFormField : 'div'" v-if="props.companies.length > 1" v-bind="props.stacked ? { label: $t('invites.label.company') } : {}">
      <USelect
        :model-value="props.view.company === null ? undefined : String(props.view.company)"
        :items="companyItems"
        :placeholder="$t('invites.label.company')"
        :aria-label="$t('invites.label.company')"
        :class="props.stacked ? 'w-full' : 'w-36'"
        data-roster-filter="company"
        @update:model-value="(value: string) => change('company', value === ALL ? null : Number(value))"
      />
    </component>

    <component :is="props.stacked ? UFormField : 'div'" v-bind="props.stacked ? { label: $t('invites.label.unit'), description: unitPathText } : {}">
      <UPopover v-model:open="unitOpen" :content="{ align: 'start' }">
        <UButton
          color="neutral"
          variant="outline"
          :class="['justify-between', props.stacked ? 'w-full' : 'w-44 max-w-full']"
          trailing-icon="i-material-symbols-keyboard-arrow-down"
          :disabled="treeCompany === null"
          :aria-label="$t('invites.label.unit')"
          data-roster-filter="unit"
        >
          <HintTip :text="unitLabel" cut press class="block min-w-0 truncate" :class="props.view.unit === null ? 'text-dimmed' : ''">{{ unitLabel }}</HintTip>
        </UButton>

        <template #content>
          <div class="flex max-h-[60dvh] max-w-[calc(100vw-2rem)] flex-col overflow-auto p-1 [scrollbar-width:thin]" role="group" :aria-label="$t('invites.label.unit')">
            <UButton color="neutral" variant="ghost" class="justify-start" :label="$t('common.label.all')" @click="chooseUnit(null)" />
            <OrganizationUnitTree v-model:expanded="expanded" class="w-max min-w-full" :units="treeUnits" :chosen="props.view.unit" @choose="chooseUnit" />
          </div>
        </template>
      </UPopover>
    </component>

    <component :is="props.stacked ? UFormField : 'div'" v-bind="props.stacked ? { label: $t('organization.label.role') } : {}">
      <USelect
        :model-value="props.view.role ?? undefined"
        :items="roleItems"
        :placeholder="$t('organization.label.role')"
        :aria-label="$t('organization.label.role')"
        :class="props.stacked ? 'w-full' : 'w-28'"
        data-roster-filter="role"
        @update:model-value="(value: string) => change('role', ROSTER_ROLES.find((one) => one === value) ?? null)"
      />
    </component>

    <component :is="props.stacked ? UFormField : 'div'" v-bind="props.stacked ? { label: $t('roster.label.state') } : {}">
      <USelect
        :model-value="props.view.state ?? undefined"
        :items="stateItems"
        :placeholder="$t('roster.label.state')"
        :aria-label="$t('roster.label.state')"
        :class="props.stacked ? 'w-full' : 'w-36'"
        data-roster-filter="state"
        @update:model-value="(value: string) => change('state', ROSTER_STATES.find((one) => one === value) ?? null)"
      />
    </component>
  </div>
</template>

<script setup lang="ts">
import { UFormField } from "#components";
import { ROSTER_ROLES, ROSTER_STATES } from "#shared/roster";

import { companyUnits } from "~/domain/invites";
import { branchesOpenAtFirst, unitPath } from "~/domain/organization";
import { ROSTER_ROLE_LABELS, ROSTER_STATE_FACES, rosterTreeCompany, withRosterFilter } from "~/domain/roster";

import type { RosterView } from "~/domain/roster";
import type { RosterUnit } from "#shared/roster";
import type { InviteUnit } from "@web/server-client";

interface Props {
  view: RosterView;
  // The companies the reader looks through, and the units they may choose among, each with its company.
  companies: readonly RosterUnit[];
  units: readonly InviteUnit[];
  // Whether the filters stand one under another, each under its name, as in the narrow screen's drawer.
  stacked?: boolean;
}

const props = withDefaults(defineProps<Props>(), { stacked: false });
const emit = defineEmits<{ change: [view: RosterView] }>();

const { t } = useI18n();

// What a choice of every value stands as; a select's value is never empty.
const ALL = "all";

const companyItems = computed(() => [{ label: t("common.label.all"), value: ALL }, ...props.companies.map((one) => ({ label: one.name, value: String(one.id) }))]);
const roleItems = computed(() => [{ label: t("common.label.all"), value: ALL }, ...ROSTER_ROLES.map((role) => ({ label: t(ROSTER_ROLE_LABELS[role]), value: role }))]);
const stateItems = computed(() => [{ label: t("common.label.all"), value: ALL }, ...ROSTER_STATES.map((state) => ({ label: t(ROSTER_STATE_FACES[state].label), value: state }))]);

function change<Key extends keyof Omit<RosterView, "q">>(key: Key, value: RosterView[Key]): void {
  emit("change", withRosterFilter(props.view, key, value));
}

// The chosen company's tree, from its own unit down, which a unit is chosen from.
const treeCompany = computed(() => rosterTreeCompany(props.view, props.companies));
const treeUnits = computed(() => (treeCompany.value === null ? [] : companyUnits(props.units, treeCompany.value)));
const unitOpen = ref(false);
const expanded = ref<string[]>([]);

// Every company's branch is open at first, and every one down to the unit chosen, as the chart's are.
watch(
  [treeUnits, () => props.view.unit],
  () => {
    const open = branchesOpenAtFirst(treeUnits.value, props.view.unit).map(String);

    expanded.value = [...new Set([...expanded.value, ...open])];
  },
  { immediate: true }
);

const unitPathText = computed(() =>
  props.view.unit === null
    ? undefined
    : unitPath(treeUnits.value, props.view.unit)
        .map((unit) => unit.name)
        .join(" › ")
);
const unitLabel = computed(() => (props.view.unit === null ? t("invites.label.unit") : (treeUnits.value.find((unit) => unit.id === props.view.unit)?.name ?? t("invites.label.unit"))));

function chooseUnit(unit: number | null): void {
  unitOpen.value = false;
  change("unit", unit);
}
</script>
