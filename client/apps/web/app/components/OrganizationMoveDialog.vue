<template>
  <!-- A move of people into a unit (docs/web.md, 「Organisation」, its chart): the unit they go to and the role each
       takes there, then who goes where, shown once before the one act writes the whole set. Closing it at either step
       writes nothing. The chart opens it for the people chosen, and the people tab for one person. -->
  <SettingsDialog v-model:open="open" :title="step === 'form' ? $t('organization.action.move') : $t('organization.action.preview')" :dirty="dirty">
    <UForm v-if="step === 'form'" id="unit-move-form" :state="draft" class="flex flex-col gap-4" @submit="preview">
      <UFormField :label="$t('organization.label.move_to')" name="to" required>
        <USelect v-model="draft.to" :items="destinations" class="w-full" data-move-to />
      </UFormField>
      <UFormField v-if="positionItems.length > 2" :label="$t('organization.label.position')" name="position">
        <USelect v-model="draft.position" :items="positionItems" class="w-full" data-move-position />
      </UFormField>
      <SettingsGroup :title="$t('organization.label.role')">
        <SettingsRow v-for="user in draft.people" :key="user" :label="props.nameOf(user)" data-move-person>
          <USelect v-model="draft.roles[user]" :items="roleItems" class="w-28" :aria-label="$t('organization.label.role_of', { name: props.nameOf(user) })" data-move-role />
        </SettingsRow>
      </SettingsGroup>
    </UForm>

    <div v-else class="flex flex-col divide-y divide-default" data-move-preview>
      <div v-for="row in plan" :key="row.user" class="flex flex-col gap-1 py-3" data-move-row>
        <span class="text-sm font-medium text-highlighted">{{ props.nameOf(row.user) }}</span>
        <span v-if="row.unchanged" class="text-sm text-muted">{{ $t("organization.label.unchanged") }}</span>
        <template v-else>
          <span class="text-sm text-muted" data-move-units>{{ row.from === row.to ? pathText(row.to) : `${pathText(row.from)} → ${pathText(row.to)}` }}</span>
          <span class="text-sm" data-move-roles>{{ row.wasHead === row.head ? roleName(row.head) : `${roleName(row.wasHead)} → ${roleName(row.head)}` }}</span>
          <span v-if="row.headDropped" class="flex items-center gap-1 text-sm font-medium text-highlighted" data-move-head-dropped><UIcon name="i-material-symbols-person-remove-outline" class="size-4 shrink-0 text-muted" />{{ $t("organization.label.head_dropped", { unit: unitName(row.from) }) }}</span>
          <span v-if="row.postDropped" class="flex items-center gap-1 text-sm font-medium text-highlighted" data-move-post-dropped><UIcon name="i-material-symbols-person-remove-outline" class="size-4 shrink-0 text-muted" />{{ $t("organization.label.post_dropped", { unit: unitName(row.to) }) }}</span>
        </template>
        <span v-if="positionLine !== null" class="text-sm" data-move-position>{{ positionLine }}</span>
      </div>
    </div>

    <UAlert v-if="failure !== ''" color="error" variant="subtle" :description="failure" class="whitespace-pre-line" />

    <template #footer="{ close }">
      <UButton color="neutral" variant="ghost" :label="$t('common.action.cancel')" data-move-cancel @click="close()" />
      <template v-if="step === 'form'">
        <UButton type="submit" form="unit-move-form" :label="$t('organization.action.preview')" :disabled="draft.to === ''" data-move-preview-open />
      </template>
      <template v-else>
        <UButton color="neutral" variant="subtle" :label="$t('common.action.back')" :disabled="busy" data-move-back @click="step = 'form'" />
        <UButton :label="$t('organization.action.move_confirm')" :loading="busy" :disabled="busy || (plan.every((row) => row.unchanged) && draft.position === KEEP_POSITION)" data-move-apply @click="apply" />
      </template>
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { movePlan, unitPath } from "~/domain/organization";

import type { RoleView } from "#shared/roster";
import type { UnitRow } from "@web/server-client";

interface Props {
  // The units as last read, each with who stands in it and who heads it, which the preview is read off.
  units: readonly UnitRow[];
  // The name a person is shown by.
  nameOf: (user: string) => string;
  // The roles of the company a unit stands in, lowest first.
  rolesOf: (unit: number) => RoleView[];
}

const props = defineProps<Props>();
// `moved` once the act went through; `settled` once it was asked, through or refused, so the units are read again.
const emit = defineEmits<{ moved: []; settled: [] }>();
const open = defineModel<boolean>("open", { default: false });

const { t } = useI18n();

const step = ref<"form" | "preview">("form");
const busy = ref(false);
const failure = ref("");
// The role each person carries where they go: kept as it stands, none, or one of the company's roles by key, values a
// select can hold, since none of its values is ever empty.
const KEEP_POSITION = "keep";
const NO_POSITION = "none";
const draft = reactive<{ to: string; people: string[]; roles: Record<string, "member" | "head">; position: string }>({ to: "", people: [], roles: {}, position: KEEP_POSITION });
const dirty = computed(() => draft.to !== "" || Object.values(draft.roles).includes("head") || draft.position !== KEEP_POSITION);
const positionRoles = computed(() => (draft.to === "" ? [] : props.rolesOf(Number(draft.to))));
const positionItems = computed(() => [
  { label: t("organization.label.keep_position"), value: KEEP_POSITION },
  { label: t("organization.label.no_position"), value: NO_POSITION },
  ...[...positionRoles.value].reverse().map((role) => ({ label: role.name, value: role.key }))
]);
// A role the destination's company does not keep is no choice there, so another destination starts from keeping.
watch(
  () => draft.to,
  () => {
    if (!positionItems.value.some((item) => item.value === draft.position)) draft.position = KEEP_POSITION;
  }
);
// The role the act names, said once under every person it moves.
const positionLine = computed(() => {
  if (draft.position === KEEP_POSITION) return null;
  if (draft.position === NO_POSITION) return t("organization.label.no_position");

  const role = positionRoles.value.find((one) => one.key === draft.position);

  return role === undefined ? null : t("organization.label.position_line", { name: role.name });
});
const destinations = computed(() => props.units.map((unit) => ({ label: pathText(unit.id), value: String(unit.id) })));
const roleItems = computed(() => [
  { label: t("organization.label.role_member"), value: "member" },
  { label: t("organization.label.role_head"), value: "head" }
]);
const plan = computed(() =>
  movePlan(
    props.units,
    draft.people.map((user) => ({ user, head: draft.roles[user] === "head" })),
    Number(draft.to)
  )
);

// A unit by its path from its company, itself last.
function pathText(id: number): string {
  return unitPath(props.units, id)
    .map((unit) => unit.name)
    .join(" › ");
}

function unitName(id: number): string {
  return props.units.find((unit) => unit.id === id)?.name ?? "";
}

function roleName(head: boolean): string {
  return head ? t("organization.label.role_head") : t("organization.label.role_member");
}

function preview(): void {
  if (draft.to === "") return;

  failure.value = "";
  step.value = "preview";
}

/**
 * Opens the dialog for the people given, each a member at first: at its first step, or, where a unit is named — the
 * people carried onto it on the chart — at its second with that unit as where they go.
 */
function start(people: readonly string[], to: number | null = null): void {
  Object.assign(draft, { to: to === null ? "" : String(to), people: [...people], roles: Object.fromEntries(people.map((user) => [user, "member"])), position: KEEP_POSITION });
  step.value = "form";
  failure.value = "";
  open.value = true;
  if (to !== null) preview();
}

// The whole set in one act, each person named with the unit they stood in when it was shown; a refusal moves nobody,
// and the units are read again either way, so the preview shows where everyone now stands.
async function apply(): Promise<void> {
  // A role kept is left out, so a person who stays keeps theirs and one who comes carries none.
  const role = draft.position === KEEP_POSITION ? {} : { role: draft.position === NO_POSITION ? null : draft.position };
  const people = plan.value.map((row) => ({ user: row.user, from: row.from, head: row.head, ...role }));

  busy.value = true;
  failure.value = "";
  try {
    await $fetch(`/api/organization/units/${Number(draft.to)}/members`, { method: "POST", body: { people } });
    open.value = false;
    emit("moved");
  } catch (error) {
    failure.value = failureText(error, t("organization.error.failed"));
  } finally {
    busy.value = false;
  }
  emit("settled");
}

defineExpose({ start });
</script>
