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
            <UBadge v-for="member in open.members" :key="member" :color="gone(member) ? 'error' : 'neutral'" variant="soft" :label="gone(member) ? $t('organization.label.left_member', { name: nameOf(member) }) : nameOf(member)">
              <template v-if="!gone(member)" #trailing>
                <UTooltip :text="$t('organization.label.machine', { name: nameOf(member) })">
                  <UButton color="neutral" variant="link" size="xs" icon="i-material-symbols-computer-outline" :aria-label="$t('organization.label.machine', { name: nameOf(member) })" @click="openMachine(member)" />
                </UTooltip>
                <UTooltip :text="$t('organization.action.mark_left', { name: nameOf(member) })">
                  <UButton color="neutral" variant="link" size="xs" icon="i-material-symbols-person-off-outline" :aria-label="$t('organization.action.mark_left', { name: nameOf(member) })" @click="markLeft(member)" />
                </UTooltip>
              </template>
            </UBadge>
            <USelect :model-value="''" :items="people(open.members)" :placeholder="$t('organization.action.place')" class="min-w-48" @update:model-value="(user) => user && place(String(user))" />
          </div>
        </UFormField>

        <UAlert v-if="formFailure !== ''" color="error" variant="subtle" :description="formFailure" />
      </div>
    </SettingsDialog>

    <!-- A person's machine (docs/accounts.md, 「Invitations and a person's machine」): the one their account is bound
         to, bound to another — the one named, or a fresh name — with its installs until it attaches, or taken away. -->
    <SettingsDialog v-model:open="machineOpen" :title="machineUser === null ? '' : $t('organization.label.machine', { name: nameOf(machineUser) })" :dirty="false">
      <ContentSkeleton v-if="machine === null && machineFailure === ''" :rows="1" :label="$t('organization.status.loading')">
        <SkeletonLine width="w-1/2" />
      </ContentSkeleton>
      <template v-else>
        <div v-if="machine !== null" class="flex items-center gap-2" data-machine>
          <template v-if="machine.agent !== undefined && machine.agent !== null">
            <code class="text-sm">{{ machine.agent }}</code>
            <UBadge :color="machine.attached ? 'success' : 'warning'" variant="soft" :label="machine.attached ? $t('organization.status.attached') : $t('organization.status.waiting')" />
          </template>
          <span v-else class="text-sm text-muted">{{ $t("organization.label.machine_none") }}</span>
        </div>

        <UFormField :label="$t('organization.label.machine_name')">
          <UInput v-model="machineName" :placeholder="$t('organization.label.machine_name_placeholder')" class="w-full" />
        </UFormField>

        <div v-if="installs.length > 0" class="flex flex-col gap-2">
          <p class="whitespace-pre-line text-sm">{{ $t("organization.message.install") }}</p>
          <div v-for="install in installs" :key="install.label" class="flex flex-col gap-1">
            <span class="text-sm font-medium">{{ install.label }}</span>
            <div class="flex items-start gap-2">
              <code class="min-w-0 flex-1 break-all rounded-md bg-elevated p-2 text-sm">{{ install.line }}</code>
              <UTooltip :text="$t('common.action.copy')">
                <UButton color="neutral" variant="ghost" size="xs" icon="i-material-symbols-content-copy-outline" :aria-label="$t('common.action.copy')" @click="copy(install.line)" />
              </UTooltip>
            </div>
          </div>
        </div>

        <UAlert v-if="machineFailure !== ''" color="error" variant="subtle" :description="machineFailure" />
      </template>

      <template #footer>
        <UButton v-if="bound" color="error" variant="ghost" :label="$t('organization.action.unbind')" :loading="machineBusy === 'unbind'" :disabled="machineBusy !== null" @click="unbind" />
        <UButton v-if="waiting" color="neutral" variant="subtle" :label="$t('organization.action.check')" :loading="machineBusy === 'check'" :disabled="machineBusy !== null" @click="check" />
        <UButton :label="bound ? $t('organization.action.rebind') : $t('organization.action.bind')" :loading="machineBusy === 'bind'" :disabled="machineBusy !== null || machine === null" @click="bind" />
      </template>
    </SettingsDialog>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { useConfirm } from "~/domain/confirm";

import type { Rebound, UnitRow, UserNode, UserSummary } from "@web/server-client";

const { t } = useI18n();

const units = ref<UnitRow[] | null>(null);
const users = ref<UserSummary[]>([]);
const failure = ref("");
const formFailure = ref("");
const busy = ref(false);

const adding = ref(false);
const confirm = useConfirm();
// The parent chosen for a new unit, `NEW_COMPANY` for none: a select item's value is never empty.
const NEW_COMPANY = "company";
const draft = reactive({ name: "", parent: NEW_COMPANY });
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
  if (of === null) return [{ label: t("organization.label.new_company"), value: NEW_COMPANY }, ...tree.value.map((unit) => ({ label: `${"· ".repeat(unit.depth)}${unit.name}`, value: String(unit.id) }))];

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

// Whether a member of the open unit has left.
function gone(user: string): boolean {
  return open.value?.left?.includes(user) ?? false;
}

// A person marked left once the question is answered yes; the units read again so the row says so.
async function markLeft(user: string): Promise<void> {
  const taken = await confirm({
    title: t("organization.title.mark_left"),
    item: nameOf(user),
    effect: t("organization.message.mark_left"),
    confirm: t("organization.action.mark_left_confirm")
  });

  if (!taken) return;
  busy.value = true;
  formFailure.value = "";
  try {
    await $fetch(`/api/organization/users/${user}/leave`, { method: "POST" });
    await read();
  } catch (error) {
    formFailure.value = failureText(error, t("organization.error.failed"));
  } finally {
    busy.value = false;
  }
}

function openAdd(): void {
  Object.assign(draft, { name: "", parent: NEW_COMPANY });
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
  const body = { name: draft.name.trim(), parent: draft.parent === NEW_COMPANY ? null : Number(draft.parent) };

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

// The person whose machine is open, what the service says of it, and the installs of the machine just bound while
// it has not attached.
const machineOpen = ref(false);
const machineUser = ref<string | null>(null);
const machine = ref<UserNode | null>(null);
const machineName = ref("");
const rebound = ref<Rebound | null>(null);
const machineFailure = ref("");
const machineBusy = ref<"bind" | "unbind" | "check" | null>(null);
let machineTimer: ReturnType<typeof setInterval> | undefined;

const bound = computed(() => typeof machine.value?.agent === "string");
const waiting = computed(() => bound.value && machine.value?.attached === false);
const installs = computed(() =>
  rebound.value === null || !waiting.value || rebound.value.agent !== machine.value?.agent
    ? []
    : [
        { label: t("organization.label.linux"), line: rebound.value.install.linux },
        { label: t("organization.label.windows"), line: rebound.value.install.windows }
      ]
);

function machinePath(): string {
  return `/api/organization/users/${encodeURIComponent(machineUser.value ?? "")}/node`;
}

function stopWatching(): void {
  if (machineTimer !== undefined) clearInterval(machineTimer);
  machineTimer = undefined;
}

async function readMachine(): Promise<void> {
  try {
    machine.value = await $fetch<UserNode>(machinePath());
  } catch (error) {
    machineFailure.value = failureText(error, t("organization.error.failed"));
  }
}

function openMachine(user: string): void {
  stopWatching();
  machineUser.value = user;
  machine.value = null;
  machineName.value = "";
  rebound.value = null;
  machineFailure.value = "";
  machineOpen.value = true;
  void readMachine();
}

// The machine just bound is asked after every few seconds until it attaches, and at once when the check is pressed;
// attached, the console's server sets it as the person's node in agency.
async function check(): Promise<void> {
  machineBusy.value = "check";
  machineFailure.value = "";
  try {
    machine.value = await $fetch<UserNode>(`${machinePath()}/proof`, { method: "POST" });
    if (machine.value.attached) stopWatching();
  } catch (error) {
    machineFailure.value = failureText(error, t("organization.error.failed"));
  } finally {
    machineBusy.value = null;
  }
}

async function bind(): Promise<void> {
  stopWatching();
  machineBusy.value = "bind";
  machineFailure.value = "";
  try {
    const name = machineName.value.trim();

    rebound.value = await $fetch<Rebound>(machinePath(), { method: "PUT", body: name === "" ? {} : { agent: name } });
    machineName.value = "";
    if (!rebound.value.attached) machineTimer = setInterval(() => void check(), 5000);
  } catch (error) {
    machineFailure.value = failureText(error, t("organization.error.failed"));
  } finally {
    machineBusy.value = null;
  }
  await readMachine();
}

async function unbind(): Promise<void> {
  const taken = await confirm({
    title: t("organization.title.unbind"),
    item: machine.value?.agent ?? "",
    effect: t("organization.message.unbind"),
    confirm: t("organization.action.unbind_confirm")
  });

  if (!taken) return;
  stopWatching();
  machineBusy.value = "unbind";
  machineFailure.value = "";
  try {
    await $fetch(machinePath(), { method: "DELETE" });
    rebound.value = null;
  } catch (error) {
    machineFailure.value = failureText(error, t("organization.error.failed"));
  } finally {
    machineBusy.value = null;
  }
  await readMachine();
}

async function copy(text: string): Promise<void> {
  await navigator.clipboard?.writeText(text).catch(() => undefined);
}

watch(machineOpen, (now) => {
  if (!now) stopWatching();
});

onMounted(() => void read());
onBeforeUnmount(stopWatching);
</script>
