<template>
  <!-- The organisation (docs/web.md, 「Settings」, the organisation section): every unit as a tree, companies first and each unit under its
       parent; a unit made, renamed, moved under another parent of its company, its heads granted and taken away,
       and people placed in it. What a unit is called is its name alone. -->
  <div class="flex flex-col gap-6">
    <ContentSkeleton v-if="units === null && failure === ''" :rows="3" listClass="flex flex-col divide-y divide-default" :label="$t('organization.status.loading')">
      <div class="flex items-center gap-4 py-3">
        <SkeletonLine width="w-1/3" />
      </div>
    </ContentSkeleton>

    <div v-else-if="units === null" class="flex flex-col items-end gap-3">
      <UAlert class="w-full" color="error" variant="subtle" :description="failure" />
      <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" @click="read" />
    </div>

    <template v-else>
      <SettingsGroup :title="$t('organization.label.units')">
        <SettingsRow v-if="units.length === 0" :label="$t('organization.label.none')" />
        <SettingsRow
          v-for="unit in tree"
          :key="unit.id"
          :label="unit.name"
          :description="describe(unit)"
          :style="{ paddingInlineStart: `${unit.depth * 1.25}rem` }"
          :data-unit="unit.id"
        >
          <UButton color="neutral" variant="ghost" size="xs" :label="$t('organization.action.edit')" @click="edit(unit.id)" />
        </SettingsRow>
      </SettingsGroup>

      <div class="flex justify-end">
        <UButton icon="i-material-symbols-add" :label="$t('organization.action.add')" @click="openAdd" />
      </div>

      <p v-if="failure !== ''" role="alert" class="text-sm text-error">{{ failure }}</p>
    </template>

    <SettingsDialog v-model:open="adding" :title="$t('organization.action.add')" :dirty="draft.name !== ''">
      <UForm id="unit-form" :state="draft" class="flex flex-col gap-4" @submit="add">
        <UFormField :label="$t('organization.label.name')" name="name" required>
          <UInput v-model="draft.name" class="w-full" />
        </UFormField>
        <UFormField :label="$t('organization.label.parent')" name="parent" :hint="$t('organization.label.parent_hint')">
          <USelect v-model="draft.parent" :items="parents(null)" class="w-full" />
        </UFormField>
        <UAlert v-if="formFailure !== ''" color="error" variant="subtle" :description="formFailure" />
      </UForm>
      <template #footer="{ close }">
        <UButton color="neutral" variant="ghost" :label="$t('common.action.cancel')" @click="close()" />
        <UButton type="submit" form="unit-form" :label="$t('common.action.save')" :loading="busy" :disabled="busy || draft.name.trim() === ''" />
      </template>
    </SettingsDialog>

    <SettingsDialog v-model:open="editing" :title="open?.name ?? ''" :dirty="false">
      <div v-if="open" class="flex flex-col gap-5">
        <UFormField :label="$t('organization.label.name')">
          <div class="flex gap-2">
            <UInput v-model="rename" class="w-full" />
            <UButton color="neutral" variant="subtle" :label="$t('common.action.save')" :disabled="busy || rename.trim() === '' || rename === open.name" @click="change({ name: rename })" />
          </div>
        </UFormField>

        <UFormField v-if="open.parent !== undefined && open.parent !== null" :label="$t('organization.label.parent')">
          <USelect :model-value="String(open.parent)" :items="parents(open.id)" class="w-full" @update:model-value="(parent) => change({ parent: Number(parent) })" />
        </UFormField>

        <UFormField :label="$t('organization.label.heads')">
          <div class="flex flex-wrap items-center gap-1">
            <UBadge v-for="head in open.heads" :key="head" color="primary" variant="soft" :label="nameOf(head)">
              <template #trailing>
                <UButton color="neutral" variant="link" size="xs" icon="i-material-symbols-close" :aria-label="$t('organization.action.remove_head', { name: nameOf(head) })" @click="setHead(head, false)" />
              </template>
            </UBadge>
            <USelect :model-value="''" :items="people(open.heads)" :placeholder="$t('organization.action.add_head')" class="min-w-48" @update:model-value="(user) => user && setHead(String(user), true)" />
          </div>
        </UFormField>

        <UFormField :label="$t('organization.label.members', { count: open.members.length })">
          <div class="flex flex-wrap items-center gap-1">
            <UBadge v-for="member in open.members" :key="member" color="neutral" variant="soft" :label="nameOf(member)" />
            <USelect :model-value="''" :items="people(open.members)" :placeholder="$t('organization.action.place')" class="min-w-48" @update:model-value="(user) => user && place(String(user))" />
          </div>
        </UFormField>

        <UAlert v-if="formFailure !== ''" color="error" variant="subtle" :description="formFailure" />
      </div>
    </SettingsDialog>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import type { UnitRow, UserSummary } from "@web/server-client";

const { t } = useI18n();

const units = ref<UnitRow[] | null>(null);
const users = ref<UserSummary[]>([]);
const failure = ref("");
const formFailure = ref("");
const busy = ref(false);

const adding = ref(false);
const draft = reactive({ name: "", parent: "" });
const editing = ref(false);
const openId = ref<number | null>(null);
const rename = ref("");

const open = computed(() => units.value?.find((unit) => unit.id === openId.value) ?? null);

// The units in the order the service gives them, each with its depth: companies first, each unit after its parent.
const tree = computed(() => {
  const depths = new Map<number, number>();

  return (units.value ?? []).map((unit) => {
    const depth = unit.parent === undefined || unit.parent === null ? 0 : (depths.get(unit.parent) ?? 0) + 1;

    depths.set(unit.id, depth);

    return { ...unit, depth };
  });
});

function companyOf(id: number): number {
  let unit = units.value?.find((one) => one.id === id);

  while (unit && unit.parent !== undefined && unit.parent !== null) unit = units.value?.find((one) => one.id === unit!.parent);

  return unit?.id ?? id;
}

function nameOf(user: string): string {
  return users.value.find((one) => one.user === user)?.name ?? user;
}

function describe(unit: UnitRow): string {
  const heads = unit.heads.map(nameOf).join(", ");

  return t("organization.label.row", { heads: heads === "" ? t("organization.label.no_head") : heads, count: unit.members.length });
}

// The parents a unit may stand under: for a new unit any unit, with none for a company; for a unit standing, the
// units of its own company that do not stand under it.
function parents(of: number | null) {
  if (of === null) return [{ label: t("organization.label.new_company"), value: "" }, ...tree.value.map((unit) => ({ label: `${"· ".repeat(unit.depth)}${unit.name}`, value: String(unit.id) }))];

  const company = companyOf(of);
  const below = new Set<number>([of]);

  for (const unit of tree.value) if (unit.parent !== undefined && unit.parent !== null && below.has(unit.parent)) below.add(unit.id);

  return tree.value.filter((unit) => companyOf(unit.id) === company && !below.has(unit.id)).map((unit) => ({ label: `${"· ".repeat(unit.depth)}${unit.name}`, value: String(unit.id) }));
}

function people(except: string[]) {
  return users.value.filter((one) => !except.includes(one.user)).map((one) => ({ label: one.name, value: one.user }));
}

async function read(): Promise<void> {
  failure.value = "";
  try {
    [units.value, users.value] = await Promise.all([$fetch<UnitRow[]>("/api/organization/units"), $fetch<UserSummary[]>("/api/users")]);
  } catch (error) {
    failure.value = failureText(error, t("organization.error.failed"));
  }
}

function openAdd(): void {
  Object.assign(draft, { name: "", parent: "" });
  formFailure.value = "";
  adding.value = true;
}

function edit(id: number): void {
  openId.value = id;
  rename.value = units.value?.find((unit) => unit.id === id)?.name ?? "";
  formFailure.value = "";
  editing.value = true;
}

async function acting(work: () => Promise<unknown>): Promise<boolean> {
  busy.value = true;
  formFailure.value = "";
  try {
    await work();
    await read();

    return true;
  } catch (error) {
    formFailure.value = failureText(error, t("organization.error.failed"));

    return false;
  } finally {
    busy.value = false;
  }
}

async function add(): Promise<void> {
  const body = { name: draft.name.trim(), parent: draft.parent === "" ? null : Number(draft.parent) };

  if (await acting(() => $fetch("/api/organization/units", { method: "POST", body }))) adding.value = false;
}

async function change(body: { name?: string; parent?: number }): Promise<void> {
  if (openId.value === null) return;
  await acting(() => $fetch(`/api/organization/units/${openId.value}`, { method: "PATCH", body }));
}

async function setHead(user: string, head: boolean): Promise<void> {
  if (openId.value === null) return;
  await acting(() => $fetch(`/api/organization/units/${openId.value}/heads/${encodeURIComponent(user)}`, { method: head ? "PUT" : "DELETE" }));
}

async function place(user: string): Promise<void> {
  if (openId.value === null) return;
  const unit = openId.value;

  await acting(() => $fetch(`/api/organization/users/${encodeURIComponent(user)}/unit`, { method: "PUT", body: { unit } }));
}

onMounted(() => void read());
</script>
