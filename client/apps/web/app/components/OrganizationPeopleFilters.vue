<template>
  <!-- The people tab's filters (docs/web.md, 「System and organisation」, the people tab): the kind, where the organisation keeps
       any; the role and the state. The unit is the node chosen in the organisation tree, never a filter here. A filter set nowhere shows its own name, and the choice of every value sets it back. In the list's head they stand side by side, and in the
       narrow screen's drawer one under another, each under its name. -->
  <div :class="props.stacked ? 'flex flex-col gap-4' : 'flex flex-wrap items-center gap-2'" data-roster-filters>
    <component :is="props.stacked ? UFormField : 'div'" v-if="kinds.length > 0" v-bind="props.stacked ? { label: $t('roster.label.kind') } : {}">
      <ChoiceSelect
        :model-value="props.view.kind ?? undefined"
        :items="kindItems"
        value-key="value"
        :placeholder="$t('roster.label.kind')"
        :aria-label="$t('roster.label.kind')"
        :class="props.stacked ? 'w-full' : 'w-28'"
        data-roster-filter="kind"
        @update:model-value="(value: string) => change('kind', value === ALL ? null : value)"
      />
    </component>

    <component :is="props.stacked ? UFormField : 'div'" v-bind="props.stacked ? { label: $t('organization.label.role') } : {}">
      <ChoiceSelect
        :model-value="props.view.role ?? undefined"
        :items="roleItems"
        value-key="value"
        :placeholder="$t('organization.label.role')"
        :aria-label="$t('organization.label.role')"
        :class="props.stacked ? 'w-full' : 'w-28'"
        data-roster-filter="role"
        @update:model-value="(value: string) => change('role', ROSTER_ROLES.find((one) => one === value) ?? null)"
      />
    </component>

    <component :is="props.stacked ? UFormField : 'div'" v-bind="props.stacked ? { label: $t('roster.label.state') } : {}">
      <ChoiceSelect
        :model-value="props.view.state ?? undefined"
        :items="stateItems"
        value-key="value"
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

import { ROSTER_ROLE_LABELS, ROSTER_STATE_FACES, withRosterFilter } from "~/domain/roster";

import type { RosterView } from "~/domain/roster";

interface Props {
  // The view, its company the organisation chosen.
  view: RosterView;
  // Whether the filters stand one under another, each under its name, as in the narrow screen's drawer.
  stacked?: boolean;
}

const props = withDefaults(defineProps<Props>(), { stacked: false });
const emit = defineEmits<{ change: [view: RosterView] }>();

const { t } = useI18n();

// What a choice of every value stands as; a select's value is never empty.
const ALL = "all";

const roleItems = computed(() => [{ label: t("common.label.all"), value: ALL }, ...ROSTER_ROLES.map((role) => ({ label: t(ROSTER_ROLE_LABELS[role]), value: role }))]);
const stateItems = computed(() => [{ label: t("common.label.all"), value: ALL }, ...ROSTER_STATES.map((state) => ({ label: t(ROSTER_STATE_FACES[state].label), value: state }))]);

function change<Key extends keyof Omit<RosterView, "q" | "company" | "unit">>(key: Key, value: RosterView[Key]): void {
  emit("change", withRosterFilter(props.view, key, value));
}

const chosenCompany = computed(() => props.view.company);

// The chosen company's unit kinds, read as the company chosen changes; none where it keeps none, or a
// read failed, and then the filter does not stand.
const kinds = ref<{ key: string; name: string }[]>([]);
const kindItems = computed(() => [{ label: t("common.label.all"), value: ALL }, ...kinds.value.map((kind) => ({ label: kind.name, value: kind.key }))]);

watch(
  chosenCompany,
  async (company) => {
    kinds.value = [];
    if (company === null) return;

    const read = await $fetch<{ key: string; name: string }[]>(`/api/organization/companies/${company}/unit-kinds`).catch(() => []);

    if (chosenCompany.value === company) kinds.value = read;
  },
  { immediate: true }
);
</script>
