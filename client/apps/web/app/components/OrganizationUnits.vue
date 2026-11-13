<template>
  <!-- The units tab (docs/web.md, 「Organisation settings」, the units tab): the units as a tree beside the unit
       chosen, its heads and its people. On a narrow screen the unit chosen fills the body and the tree opens as a
       bottom drawer from the button at the unit's head. What a unit is called is its name alone. -->
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <ContentSkeleton v-if="units === null && failure === ''" :rows="3" listClass="flex flex-col gap-2" :label="$t('organization.status.loading')">
      <SkeletonLine width="w-1/3" />
    </ContentSkeleton>

    <div v-else-if="units === null" class="flex max-w-3xl flex-col items-end gap-3">
      <UAlert class="w-full" color="error" variant="subtle" :description="failure" />
      <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" @click="read" />
    </div>

    <p v-else-if="chosen === null" class="text-sm text-muted">{{ $t("organization.label.none") }}</p>

    <div v-else class="flex min-w-0 flex-1 gap-6">
      <nav v-if="!narrow" class="w-64 shrink-0" :aria-label="$t('organization.label.chart')" data-unit-tree>
        <UTree v-bind="treeProps" />
      </nav>

      <section class="flex min-w-0 max-w-3xl flex-1 flex-col gap-6" :data-unit-chosen="chosen.id">
        <div class="flex items-center gap-2">
          <div class="flex min-w-0 flex-1 flex-col items-start gap-0.5">
            <span v-if="pathOf(chosen.id).length > 1" class="max-w-full truncate text-sm text-muted">{{ pathText(chosen.id, false) }}</span>
            <UButton
              v-if="narrow"
              color="neutral"
              variant="ghost"
              class="-ms-2.5 max-w-full text-lg font-semibold text-highlighted"
              trailing-icon="i-material-symbols-unfold-more"
              :label="chosen.name"
              data-unit-tree-open
              @click="treeOpen = true"
            />
            <h2 v-else class="max-w-full truncate text-lg font-semibold text-highlighted">{{ chosen.name }}</h2>
          </div>
          <UButton class="shrink-0" color="neutral" variant="subtle" icon="i-material-symbols-edit-outline" :label="$t('organization.action.edit')" data-unit-edit @click="openEdit" />
        </div>

        <SettingsGroup :title="$t('organization.label.heads')">
          <SettingsRow v-if="chosen.heads.length === 0" :label="$t('organization.label.no_heads')" />
          <SettingsRow v-for="head in chosen.heads" :key="head" :label="nameOf(head)" data-unit-head>
            <UTooltip :text="$t('organization.action.remove_head', { name: nameOf(head) })">
              <UButton color="neutral" variant="ghost" icon="i-material-symbols-person-remove-outline" :aria-label="$t('organization.action.remove_head', { name: nameOf(head) })" :disabled="busy" @click="setHead(head, false)" />
            </UTooltip>
          </SettingsRow>
        </SettingsGroup>
        <div class="-mt-3 flex justify-end">
          <USelectMenu
            :model-value="undefined"
            :items="people(chosen.heads)"
            value-key="value"
            icon="i-material-symbols-person-add-outline"
            :placeholder="$t('organization.action.add_head')"
            :search-input="{ placeholder: $t('organization.placeholder.find_person') }"
            :disabled="busy"
            class="w-full sm:w-64"
            data-unit-add-head
            @update:model-value="(user: unknown) => user && setHead(String(user), true)"
          />
        </div>

        <SettingsGroup :title="$t('organization.label.members', { count: countText(chosen.members.length) })">
          <SettingsRow v-if="chosen.members.length === 0" :label="$t('organization.label.no_members')" />
          <SettingsRow
            v-for="member in chosen.members"
            :key="member"
            :label="gone(member) ? $t('organization.label.left_member', { name: nameOf(member) }) : nameOf(member)"
            data-unit-member
          >
            <div v-if="!gone(member)" class="flex items-center gap-1">
              <UTooltip :text="$t('organization.label.machine', { name: nameOf(member) })">
                <UButton color="neutral" variant="ghost" icon="i-material-symbols-computer-outline" :aria-label="$t('organization.label.machine', { name: nameOf(member) })" @click="openMachine(member)" />
              </UTooltip>
              <UTooltip :text="$t('organization.action.mark_left', { name: nameOf(member) })">
                <UButton color="neutral" variant="ghost" icon="i-material-symbols-person-off-outline" :aria-label="$t('organization.action.mark_left', { name: nameOf(member) })" :disabled="busy" @click="markLeft(member)" />
              </UTooltip>
            </div>
          </SettingsRow>
        </SettingsGroup>
        <div class="-mt-3 flex justify-end">
          <USelectMenu
            :model-value="undefined"
            :items="people(chosen.members)"
            value-key="value"
            icon="i-material-symbols-group-add-outline"
            :placeholder="$t('organization.action.place')"
            :search-input="{ placeholder: $t('organization.placeholder.find_person') }"
            :disabled="busy"
            class="w-full sm:w-64"
            data-unit-place
            @update:model-value="(user: unknown) => user && place(String(user))"
          />
        </div>

        <p v-if="failure !== ''" role="alert" class="text-sm text-error">{{ failure }}</p>
      </section>
    </div>

    <UDrawer v-if="narrow" v-model:open="treeOpen" :title="$t('organization.label.chart')">
      <template #body>
        <UTree v-bind="treeProps" />
      </template>
    </UDrawer>

    <SettingsDialog v-model:open="adding" :title="$t('organization.action.add')" :dirty="draft.name.trim() !== '' || draft.parent !== NEW_COMPANY">
      <UForm id="unit-add-form" :state="draft" class="flex flex-col gap-4" @submit="add">
        <UFormField :label="$t('organization.label.name')" name="name" required>
          <UInput v-model="draft.name" class="w-full" />
        </UFormField>
        <UFormField :label="$t('organization.label.parent')" name="parent">
          <USelect v-model="draft.parent" :items="[{ label: $t('organization.label.new_company'), value: NEW_COMPANY }, ...parents(null)]" class="w-full" />
        </UFormField>
        <UAlert v-if="formFailure !== ''" color="error" variant="subtle" :description="formFailure" />
      </UForm>
      <template #footer="{ close }">
        <UButton color="neutral" variant="ghost" :label="$t('common.action.cancel')" @click="close()" />
        <UButton type="submit" form="unit-add-form" :label="$t('common.action.save')" :loading="busy" :disabled="busy || draft.name.trim() === ''" />
      </template>
    </SettingsDialog>

    <SettingsDialog v-model:open="editing" :title="editOf?.name ?? ''" :dirty="editChanged">
      <UForm id="unit-edit-form" :state="edit" class="flex flex-col gap-4" @submit="saveEdit">
        <UFormField :label="$t('organization.label.name')" name="name" required>
          <UInput v-model="edit.name" class="w-full" />
        </UFormField>
        <UFormField v-if="editOf !== null && !isCompany(editOf)" :label="$t('organization.label.parent')" name="parent">
          <USelect v-model="edit.parent" :items="parents(editOf.id)" class="w-full" />
        </UFormField>
        <UAlert v-if="formFailure !== ''" color="error" variant="subtle" :description="formFailure" />
      </UForm>
      <template #footer="{ close }">
        <UButton color="neutral" variant="ghost" :label="$t('common.action.cancel')" @click="close()" />
        <UButton type="submit" form="unit-edit-form" :label="$t('common.action.save')" :loading="busy" :disabled="busy || !editChanged || edit.name.trim() === ''" />
      </template>
    </SettingsDialog>

    <!-- A person's machine (docs/accounts.md, 「Invitations and a person's machine」): the one their account is bound
         to, bound to another — the one named, or a fresh name — with its installs until it attaches, or taken away. -->
    <SettingsDialog v-model:open="machineOpen" :title="machineUser === null ? '' : $t('organization.label.machine', { name: nameOf(machineUser) })" :dirty="false">
      <div class="flex flex-col gap-4">
        <ContentSkeleton v-if="machine === null && machineFailure === ''" :rows="1" :label="$t('organization.status.loading')">
          <SkeletonLine width="w-1/2" />
        </ContentSkeleton>
        <template v-else>
          <div v-if="machine !== null" class="flex items-center gap-2" data-machine>
            <template v-if="machine.agent !== undefined && machine.agent !== null">
              <code class="text-sm">{{ machine.agent }}</code>
              <UBadge :color="machine.attached ? 'success' : 'warning'" variant="subtle" :label="machine.attached ? $t('organization.status.attached') : $t('organization.status.waiting')" />
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
                  <UButton color="neutral" variant="ghost" icon="i-material-symbols-content-copy-outline" :aria-label="$t('common.action.copy')" @click="copy(install.line)" />
                </UTooltip>
              </div>
            </div>
          </div>

          <UAlert v-if="machineFailure !== ''" color="error" variant="subtle" :description="machineFailure" />
        </template>
      </div>

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
import { useNarrow } from "bmo-ui/app/domain/screen";

import { useConfirm } from "~/domain/confirm";
import { countText } from "~/domain/numbers";

import type { TreeItem } from "@nuxt/ui";
import type { Ref } from "vue";
import type { Rebound, UnitRow, UserNode, UserSummary } from "@web/server-client";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const narrow = useNarrow();
const confirm = useConfirm();

const units = ref<UnitRow[] | null>(null);
const users = ref<UserSummary[]>([]);
const failure = ref("");
const formFailure = ref("");
const busy = ref(false);

function isCompany(unit: UnitRow): boolean {
  return unit.parent === undefined || unit.parent === null;
}

function unitOf(id: number): UnitRow | null {
  return units.value?.find((unit) => unit.id === id) ?? null;
}

// The units from the company down to the one named.
function pathOf(id: number): UnitRow[] {
  const path: UnitRow[] = [];

  for (let unit = unitOf(id); unit !== null; unit = isCompany(unit) ? null : unitOf(unit.parent!)) path.unshift(unit);

  return path;
}

// A unit's path as words: with itself for a choice among units, without it above its own name.
function pathText(id: number, itself: boolean): string {
  const path = pathOf(id);

  return (itself ? path : path.slice(0, -1)).map((unit) => unit.name).join(" › ");
}

// The unit the address names, or the first company where it names none it holds.
const chosen = computed<UnitRow | null>(() => {
  const asked = unitOf(Number(route.query.unit));

  return asked ?? units.value?.find(isCompany) ?? null;
});

// The tree, Nuxt UI's own: companies at its top, each unit under its parent, every branch open.
type UnitItem = TreeItem & { id: number };

const tree = computed(() => {
  const items = new Map<number, UnitItem>();
  const roots: UnitItem[] = [];

  for (const unit of units.value ?? []) items.set(unit.id, { id: unit.id, label: unit.name, icon: isCompany(unit) ? "i-material-symbols-domain" : "i-material-symbols-groups-outline", defaultExpanded: true });

  for (const unit of units.value ?? []) {
    const item = items.get(unit.id)!;
    const parent = isCompany(unit) ? undefined : items.get(unit.parent!);

    if (parent === undefined) roots.push(item);
    else parent.children = [...(parent.children ?? []), item];
  }

  return { roots, items };
});

const treeOpen = ref(false);

// Choosing a unit is a step of the history and stands in the address, so a shared link opens the same unit.
function choose(item: UnitItem | undefined): void {
  treeOpen.value = false;

  if (item === undefined || item.id === chosen.value?.id) return;

  void router.push({ query: { ...route.query, unit: String(item.id) } });
}

const treeProps = computed(() => ({
  items: tree.value.roots,
  modelValue: chosen.value === null ? undefined : tree.value.items.get(chosen.value.id),
  getKey: (item: UnitItem) => String(item.id),
  color: "neutral" as const,
  "onUpdate:modelValue": (item: unknown) => choose(item as UnitItem | undefined)
}));

function nameOf(user: string): string {
  return users.value.find((one) => one.user === user)?.name ?? user;
}

function gone(user: string): boolean {
  return chosen.value?.left?.includes(user) ?? false;
}

function people(except: string[]): { label: string; value: string }[] {
  return users.value.filter((one) => !except.includes(one.user)).map((one) => ({ label: one.name, value: one.user }));
}

// The parents a unit may stand under, each by its path from its company: for a new unit any unit; for a unit
// standing, the units of its own company that do not stand under it.
function parents(of: number | null): { label: string; value: string }[] {
  const all = units.value ?? [];
  const choice = (unit: UnitRow) => ({ label: pathText(unit.id, true), value: String(unit.id) });

  if (of === null) return all.map(choice);

  const company = pathOf(of)[0]?.id;
  const below = new Set<number>([of]);

  for (const unit of all) if (!isCompany(unit) && below.has(unit.parent!)) below.add(unit.id);

  return all.filter((unit) => pathOf(unit.id)[0]?.id === company && !below.has(unit.id)).map(choice);
}

async function read(): Promise<void> {
  failure.value = "";
  try {
    [units.value, users.value] = await Promise.all([$fetch<UnitRow[]>("/api/organization/units"), $fetch<UserSummary[]>("/api/users")]);
  } catch (error) {
    failure.value = failureText(error, t("organization.error.failed"));
  }
}

// A record of the unit changed as it is done, a head or a person; the units read again so the lists say so, and a
// refusal said under them.
async function acting(work: () => Promise<unknown>, said: Ref<string>): Promise<boolean> {
  busy.value = true;
  said.value = "";
  try {
    await work();
    await read();

    return true;
  } catch (error) {
    said.value = failureText(error, t("organization.error.failed"));

    return false;
  } finally {
    busy.value = false;
  }
}

function setHead(user: string, head: boolean): void {
  const unit = chosen.value?.id;

  if (unit !== undefined) void acting(() => $fetch(`/api/organization/units/${unit}/heads/${encodeURIComponent(user)}`, { method: head ? "PUT" : "DELETE" }), failure);
}

function place(user: string): void {
  const unit = chosen.value?.id;

  if (unit !== undefined) void acting(() => $fetch(`/api/organization/users/${encodeURIComponent(user)}/unit`, { method: "PUT", body: { unit } }), failure);
}

// A person marked left once the question is answered yes.
async function markLeft(user: string): Promise<void> {
  const taken = await confirm({
    title: t("organization.title.mark_left"),
    item: nameOf(user),
    effect: t("organization.message.mark_left"),
    confirm: t("organization.action.mark_left_confirm")
  });

  if (taken) await acting(() => $fetch(`/api/organization/users/${encodeURIComponent(user)}/leave`, { method: "POST" }), failure);
}

// A new unit: a name and a parent, with no parent a new company. The parent chosen for none is `NEW_COMPANY`, since a
// select item's value is never empty.
const NEW_COMPANY = "company";
const adding = ref(false);
const draft = reactive({ name: "", parent: NEW_COMPANY });

function openAdd(): void {
  Object.assign(draft, { name: "", parent: NEW_COMPANY });
  formFailure.value = "";
  adding.value = true;
}

async function add(): Promise<void> {
  const body = { name: draft.name.trim(), parent: draft.parent === NEW_COMPANY ? null : Number(draft.parent) };

  if (await acting(() => $fetch("/api/organization/units", { method: "POST", body }), formFailure)) adding.value = false;
}

// The unit's own form: its name and its parent, held until its one save sends what differs from what is saved.
const editing = ref(false);
const editId = ref<number | null>(null);
const editOf = computed(() => (editId.value === null ? null : unitOf(editId.value)));
const edit = reactive({ name: "", parent: "" });
const editChanged = computed(() => editOf.value !== null && (edit.name.trim() !== editOf.value.name || (!isCompany(editOf.value) && edit.parent !== String(editOf.value.parent))));

function openEdit(): void {
  const unit = chosen.value;

  if (unit === null) return;

  editId.value = unit.id;
  Object.assign(edit, { name: unit.name, parent: isCompany(unit) ? "" : String(unit.parent) });
  formFailure.value = "";
  editing.value = true;
}

async function saveEdit(): Promise<void> {
  const unit = editOf.value;

  if (unit === null || !editChanged.value) return;

  const body: { name?: string; parent?: number } = {};

  if (edit.name.trim() !== unit.name) body.name = edit.name.trim();
  if (!isCompany(unit) && edit.parent !== String(unit.parent)) body.parent = Number(edit.parent);

  if (await acting(() => $fetch(`/api/organization/units/${unit.id}`, { method: "PATCH", body }), formFailure)) editing.value = false;
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
    if (!rebound.value.attached) machineTimer = setInterval(() => void check(), MACHINE_CHECK_MS);
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

// How often a machine just bound is asked after while it has not attached.
const MACHINE_CHECK_MS = 5_000;

async function copy(text: string): Promise<void> {
  await navigator.clipboard?.writeText(text).catch(() => undefined);
}

watch(machineOpen, (now) => {
  if (!now) stopWatching();
});

onMounted(() => void read());
onBeforeUnmount(stopWatching);

// The tab row's add button stands for this tab and opens its form.
defineExpose({ addLabel: computed(() => t("organization.action.add")), openAdd });
</script>
