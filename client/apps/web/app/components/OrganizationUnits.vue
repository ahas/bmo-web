<template>
  <!-- The units tab (docs/web.md, 「Organisation settings」, the units tab): the units as a tree beside the unit
       chosen, its heads and its people, two regions across the whole body that each scroll on their own, parted by a
       splitter. On a narrow screen the unit chosen fills the body and the tree opens as a bottom drawer from the
       button at the unit's head. What a unit is called is its name alone. -->
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <!-- A read that failed, and a deployment holding no unit, say so in a reading column of the body's. -->
    <div v-if="failed || empty" class="min-h-0 flex-1 overflow-y-auto p-4">
      <div v-if="failed" class="mx-auto flex w-full max-w-3xl flex-col items-end gap-3">
        <UAlert class="w-full" color="error" variant="subtle" :description="failure" />
        <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" :loading="reading" @click="read" />
      </div>
      <p v-else class="mx-auto w-full max-w-3xl text-sm text-muted">{{ $t("organization.label.none") }}</p>
    </div>

    <!-- The tree and the unit chosen, each a region scrolling on its own, parted by the splitter's hairline; on a
         phone the unit alone, the tree in its drawer. -->
    <USplitter v-else id="organization-splitter" auto-save-id="bmo-organization-splitter" :items="regions" :ui="{ handle: SPLIT_HANDLE }" class="min-h-0 flex-1">
      <template #tree>
        <!-- People carried from the unit chosen and dropped on a unit open the move's preview with that unit. -->
        <nav
          class="min-h-0 min-w-0 flex-1 overflow-auto [scrollbar-width:thin]"
          :aria-label="$t('organization.label.chart')"
          data-unit-tree
          @dragover="peopleOver"
          @dragleave="peopleLeave"
          @drop="peopleDropped"
        >
          <ContentSkeleton v-if="units === null" class="p-2" :rows="TREE_SKELETON_ROWS" listClass="flex flex-col" :label="$t('organization.status.loading')">
            <template #default="{ index }">
              <div class="flex h-8 items-center gap-1.5 px-2.5" :class="index === 0 ? '' : 'ps-6'">
                <SkeletonBar class="size-5 shrink-0 rounded-sm" />
                <SkeletonBar class="h-4" :class="index % 2 === 0 ? 'w-2/3' : 'w-1/2'" />
              </div>
            </template>
          </ContentSkeleton>
          <OrganizationUnitTree v-else v-model:expanded="expanded" class="w-max min-w-full p-2" :units="units" :chosen="chosen?.id ?? null" :dropping="dropUnit" @choose="choose" />
        </nav>
      </template>

      <template #unit>
        <div ref="unitScroll" class="min-h-0 min-w-0 flex-1 overflow-y-auto p-4" data-unit-scroll>
          <ContentSkeleton v-if="chosen === null" class="mx-auto w-full max-w-3xl" :label="$t('organization.status.loading')">
            <!-- The unit's head, its heads and its people, each piece at the real one's height; the words that need
                 no read stand as they are, and the row the edit button stands on is kept for it. -->
            <div class="flex flex-col gap-4">
              <div class="flex flex-col gap-2">
                <div class="flex flex-col">
                  <SkeletonLine width="w-1/3" />
                  <SkeletonLine size="lg" width="w-1/2" />
                </div>
                <div class="h-8" />
              </div>
              <SettingsGroup :title="$t('organization.label.heads')">
                <div class="flex h-14 items-center"><SkeletonBar class="h-4 w-1/3" /></div>
              </SettingsGroup>
              <div class="flex flex-col">
                <div class="flex min-h-8 items-center"><SkeletonBar class="h-4 w-24" /></div>
                <div class="flex flex-col divide-y divide-default">
                  <div v-for="row in 2" :key="row" class="flex h-14 items-center"><SkeletonBar class="h-4 w-1/3" /></div>
                </div>
              </div>
            </div>
          </ContentSkeleton>

          <section v-else class="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-4" :data-unit-chosen="chosen.id">
            <!-- The unit's head: its path standing whole above its name, the name a row of its own, and the edit
                 button on the row under it at its right end. -->
            <div class="flex flex-col gap-2">
              <div class="flex min-w-0 flex-col items-start">
                <p v-if="pathOf(chosen.id).length > 1" class="max-w-full text-sm break-keep text-muted [overflow-wrap:anywhere]" data-unit-path>{{ pathText(chosen.id, false) }}</p>
                <!-- On a phone the name opens the tree's drawer; a name the button cuts short reads whole in its
                     tooltip, a finger resting on it to read it. -->
                <UButton
                  v-if="narrow"
                  color="neutral"
                  variant="ghost"
                  class="-ms-2.5 max-w-full text-lg font-semibold text-highlighted"
                  trailing-icon="i-material-symbols-unfold-more"
                  data-unit-tree-open
                  @click="treeOpen = true"
                >
                  <HintTip :text="chosen.name" cut press class="block min-w-0 truncate" data-unit-name>{{ chosen.name }}</HintTip>
                </UButton>
                <h2 v-else class="max-w-full text-lg font-semibold break-keep text-highlighted [overflow-wrap:anywhere]">{{ chosen.name }}</h2>
              </div>
              <div class="flex justify-end">
                <UButton color="neutral" variant="subtle" icon="i-material-symbols-edit-outline" :label="$t('organization.action.edit')" data-unit-edit @click="openEdit" />
              </div>
            </div>

            <SettingsGroup :title="$t('organization.label.heads')">
              <template #aside>
                <USelectMenu
                  :model-value="undefined"
                  :items="people(chosen.heads)"
                  value-key="value"
                  icon="i-material-symbols-person-add-outline"
                  size="sm"
                  :placeholder="$t('organization.action.add_head')"
                  :search-input="{ placeholder: $t('organization.placeholder.find_person') }"
                  :disabled="busy"
                  class="w-56 min-w-0 shrink"
                  :ui="PICKER_UI"
                  :loading="working === 'heads'"
                  data-unit-add-head
                  @update:model-value="(user: unknown) => user && setHead(String(user), true)"
                />
              </template>
              <SettingsRow v-if="chosen.heads.length === 0" :label="$t('organization.label.no_heads')" />
              <SettingsRow v-for="head in chosen.heads" :key="head" :label="nameOf(head)" data-unit-head>
                <UTooltip :text="$t('organization.action.remove_head', { name: nameOf(head) })">
                  <UButton color="neutral" variant="ghost" icon="i-material-symbols-person-remove-outline" :aria-label="$t('organization.action.remove_head', { name: nameOf(head) })" :loading="working === `head:${head}`" :disabled="busy" @click="setHead(head, false)" />
                </UTooltip>
              </SettingsRow>
            </SettingsGroup>

            <!-- Several people are chosen at once, a run of them by Shift or a held finger, and moved into another unit
                 together after the move's preview (docs/web.md, 「Organisation settings」, the units tab). -->
            <div ref="memberList">
              <SettingsGroup :title="$t('organization.label.members', { count: countText(chosen.members.length) })">
                <template #aside>
                  <USelectMenu
                    :model-value="undefined"
                    :items="people(chosen.members)"
                    value-key="value"
                    icon="i-material-symbols-group-add-outline"
                    size="sm"
                    :placeholder="$t('organization.action.place')"
                    :search-input="{ placeholder: $t('organization.placeholder.find_person') }"
                    :disabled="busy"
                    class="w-56 min-w-0 shrink"
                    :ui="PICKER_UI"
                    :loading="working === 'members'"
                    data-unit-place
                    @update:model-value="(user: unknown) => user && place(String(user))"
                  />
                </template>
                <div v-if="choosable.length > 0" class="flex min-h-12 items-center gap-2" data-unit-choice>
                  <ChooseAll :keys="choosable" :selected="selected" @choose="chooseAll" />
                  <span v-if="selected.size > 0" class="text-sm whitespace-nowrap text-muted tabular-nums" data-unit-chosen-count>{{ $t("organization.label.chosen", { count: countText(selected.size) }) }}</span>
                  <UButton class="ms-auto shrink-0" color="neutral" variant="subtle" icon="i-material-symbols-move-item-outline" :label="$t('organization.action.move')" :disabled="selected.size === 0 || busy" data-unit-move @click="openMove" />
                </div>
                <SettingsRow v-if="chosen.members.length === 0" :label="$t('organization.label.no_members')" />
                <div
                  v-for="member in chosen.members"
                  :key="member"
                  :class="memberRowClass(member)"
                  data-unit-member
                  :data-member-row="member"
                  :data-member-choosable="gone(member) ? undefined : ''"
                  :draggable="!narrow && !gone(member) && !busy"
                  @dragstart="carryPeople($event, member)"
                  @dragend="dropUnit = null"
                >
                  <div v-if="!gone(member)" :class="[CHOOSE_CELL, 'cursor-pointer hover:bg-elevated active:bg-elevated']" data-member-check @click="pick(member, $event.shiftKey)">
                    <UCheckbox :model-value="selected.has(member)" :aria-label="$t('organization.action.choose_person', { name: nameOf(member) })" />
                  </div>
                  <div v-else :class="CHOOSE_CELL" />
                  <span class="min-w-0 flex-1 text-sm break-words text-highlighted">{{ gone(member) ? $t("organization.label.left_member", { name: nameOf(member) }) : nameOf(member) }}</span>
                  <div v-if="!gone(member)" class="flex shrink-0 items-center gap-1" data-member-marks>
                    <UTooltip :text="$t('organization.label.machine', { name: nameOf(member) })">
                      <UButton color="neutral" variant="ghost" icon="i-material-symbols-computer-outline" :aria-label="$t('organization.label.machine', { name: nameOf(member) })" @click="openMachine(member)" />
                    </UTooltip>
                    <UTooltip :text="$t('organization.action.mark_left', { name: nameOf(member) })">
                      <UButton color="neutral" variant="ghost" icon="i-material-symbols-person-off-outline" :aria-label="$t('organization.action.mark_left', { name: nameOf(member) })" :loading="working === `left:${member}`" :disabled="busy" @click="markLeft(member)" />
                    </UTooltip>
                  </div>
                </div>
              </SettingsGroup>
            </div>

            <p v-if="failure !== ''" role="alert" class="text-sm text-error">{{ failure }}</p>
          </section>
        </div>
      </template>
    </USplitter>

    <UDrawer v-if="narrow" v-model:open="treeOpen" :title="$t('organization.label.chart')">
      <template #body>
        <div class="overflow-x-auto [scrollbar-width:thin]">
          <OrganizationUnitTree v-model:expanded="expanded" class="w-max min-w-full" :units="units ?? []" :chosen="chosen?.id ?? null" @choose="choose" />
        </div>
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

    <!-- A person's machine, and a move of the people chosen, each a dialog of its own the people tab opens too. -->
    <OrganizationMachineDialog v-model:open="machineOpen" :user="machineUser" :name="machineUser === null ? '' : nameOf(machineUser)" />
    <OrganizationMoveDialog ref="moveDialog" v-model:open="moving" :units="units ?? []" :name-of="nameOf" @moved="chooseAll(false)" @settled="read" />
  </div>
</template>

<script setup lang="ts">
import { CHOOSE_CELL } from "bmo-ui/app/domain/chooseall";
import { draggedSelection, useDragSelect } from "bmo-ui/app/domain/dragselect";
import { failureText } from "bmo-ui/app/domain/errors";
import { useNarrow } from "bmo-ui/app/domain/screen";
import { SPLIT_HANDLE } from "bmo-ui/app/domain/side-parts";

import { useConfirm } from "~/domain/confirm";
import { countText } from "~/domain/numbers";
import { branchesAbove, branchesOpenAtFirst, isCompany, unitPath } from "~/domain/organization";
import { shownName } from "~/domain/people";

import type { SplitterItem } from "@nuxt/ui";
import type { Ref } from "vue";
import type { UnitRow, UserSummary } from "@web/server-client";

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
const reading = ref(false);
// Which change of the unit is under way, so the control that asked for it spins until it is done.
const working = ref<string | null>(null);

function unitOf(id: number): UnitRow | null {
  return units.value?.find((unit) => unit.id === id) ?? null;
}

// The units from the company down to the one named.
function pathOf(id: number): UnitRow[] {
  return unitPath(units.value ?? [], id);
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

// The branches standing open, by their keys: every company's and every one down to the unit chosen at first, and
// then what the reader opens and closes, kept across every change made on the tab. The unit chosen, wherever it
// moves, and a unit just made always stand in view (docs/web.md, 「Organisation settings」, its chart).
const expanded = ref<string[]>([]);

function openBranches(ids: number[]): void {
  const keys = ids.map(String).filter((key) => !expanded.value.includes(key));

  if (keys.length > 0) expanded.value = [...expanded.value, ...keys];
}

// The chosen unit's path, so a unit moved under another parent opens its new branches too.
const chosenPath = computed(() => (chosen.value === null ? "" : pathOf(chosen.value.id).map((unit) => unit.id).join("/")));
let openedAtFirst = false;

watch(
  chosenPath,
  () => {
    const all = units.value;
    const unit = chosen.value?.id ?? null;

    if (all === null) return;
    if (!openedAtFirst) openBranches(branchesOpenAtFirst(all, unit));
    else if (unit !== null) openBranches(branchesAbove(all, unit));
    openedAtFirst = true;
  },
  { immediate: true }
);

const treeOpen = ref(false);

// The read failed, or the deployment holds no unit: either is said in place of both regions.
const failed = computed(() => units.value === null && failure.value !== "");
const empty = computed(() => units.value !== null && chosen.value === null);

// The regions the splitter parts, in hundredths of its width: the tree, which can be widened to a half, and the unit
// chosen; on a phone the unit alone, the tree in its drawer.
const TREE_REGION: SplitterItem = { slot: "tree", minSize: 15, defaultSize: 28, maxSize: 50 };
const UNIT_REGION: SplitterItem = { slot: "unit", minSize: 50 };
const regions = computed<SplitterItem[]>(() => (narrow.value ? [{ ...UNIT_REGION, minSize: 100, defaultSize: 100 }] : [TREE_REGION, UNIT_REGION]));

// How many units the tree's skeleton stands: a company and the units open under it at first.
const TREE_SKELETON_ROWS = 3;

// Choosing a unit is a step of the history and stands in the address, so a shared link opens the same unit.
function choose(unit: number): void {
  treeOpen.value = false;

  if (unit === chosen.value?.id) return;

  void router.push({ query: { ...route.query, unit: String(unit) } });
}

function nameOf(user: string): string {
  const found = users.value.find((one) => one.user === user);

  return found === undefined ? user : shownName(found);
}

function gone(user: string): boolean {
  return chosen.value?.left?.includes(user) ?? false;
}

function people(except: string[]): { label: string; value: string }[] {
  return users.value.filter((one) => !except.includes(one.user)).map((one) => ({ label: shownName(one), value: one.user }));
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

// The units and the people read; a failure stands until a read goes through, so a read asked again from it spins
// on its button rather than giving way to the skeleton.
async function read(): Promise<void> {
  reading.value = true;
  try {
    [units.value, users.value] = await Promise.all([$fetch<UnitRow[]>("/api/organization/units"), $fetch<UserSummary[]>("/api/users")]);
    failure.value = "";
  } catch (error) {
    failure.value = failureText(error, t("organization.error.failed"));
  } finally {
    reading.value = false;
  }
}

// A record of the unit changed as it is done, a head or a person; the units read again so the lists say so, and a
// refusal said under them.
async function acting(work: () => Promise<unknown>, said: Ref<string>, what: string | null = null): Promise<boolean> {
  busy.value = true;
  working.value = what;
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
    working.value = null;
  }
}

function setHead(user: string, head: boolean): void {
  const unit = chosen.value?.id;

  if (unit !== undefined) void acting(() => $fetch(`/api/organization/units/${unit}/heads/${encodeURIComponent(user)}`, { method: head ? "PUT" : "DELETE" }), failure, head ? "heads" : `head:${user}`);
}

function place(user: string): void {
  const unit = chosen.value?.id;

  if (unit !== undefined) void acting(() => $fetch(`/api/organization/users/${encodeURIComponent(user)}/unit`, { method: "PUT", body: { unit } }), failure, "members");
}

// A person marked left once the question is answered yes.
async function markLeft(user: string): Promise<void> {
  const taken = await confirm({
    title: t("organization.title.mark_left"),
    item: nameOf(user),
    effect: t("organization.message.mark_left"),
    confirm: t("organization.action.mark_left_confirm")
  });

  if (taken) await acting(() => $fetch(`/api/organization/users/${encodeURIComponent(user)}/leave`, { method: "POST" }), failure, `left:${user}`);
}

// The people chosen in the unit chosen, by their ids, and the person last pressed, from whom a press with Shift chooses
// the run. The choice belongs to the unit chosen: choosing another gives it up.
const selected = ref(new Set<string>());
const anchor = ref<string | null>(null);
const memberList = ref<HTMLElement | null>(null);
const unitScroll = ref<HTMLElement | null>(null);

// The people who may be chosen, in the order they stand: everyone in the unit who has not left.
const choosable = computed(() => (chosen.value === null ? [] : chosen.value.members.filter((member) => !gone(member))));

watch(
  () => chosen.value?.id,
  () => {
    selected.value = new Set();
    anchor.value = null;
  }
);

function pick(user: string, run: boolean): void {
  if (run && anchor.value !== null) {
    selected.value = draggedSelection(choosable.value, selected.value, anchor.value, user);

    return;
  }

  const next = new Set(selected.value);

  if (!next.delete(user)) next.add(user);
  selected.value = next;
  anchor.value = user;
}

function chooseAll(all: boolean): void {
  selected.value = all ? new Set(choosable.value) : new Set();
  anchor.value = null;
}

// A finger held on a person chooses them, and one that goes on to move chooses every person it passes, the
// console's own gesture for every list that chooses more than one.
useDragSelect({
  surface: () => memberList.value,
  scroller: () => unitScroll.value,
  rowMark: "data-member-row",
  choosableMark: "data-member-choosable",
  keys: () => choosable.value,
  selected,
  hold: (user) => {
    selected.value = new Set([...selected.value, user]);
    anchor.value = user;
  }
});

// A person's row, as tall as a head's row above it, and the tint behind the people chosen one after another, which
// reads as one box: rounded at the run's two ends, with no line between its rows, lying behind them so a run joining or
// parting moves nothing.
function memberRowClass(member: string): string[] {
  const members = chosen.value?.members ?? [];
  const at = members.indexOf(member);
  const on = (index: number) => index >= 0 && index < members.length && selected.value.has(members[index]!);
  const classes = ["relative isolate flex items-center gap-2 py-2.5"];

  if (!on(at)) return classes;

  classes.push("before:absolute before:-inset-x-2 before:top-0 before:-z-10 before:bg-primary/10 before:content-['']");
  classes.push(on(at + 1) ? "border-transparent before:-bottom-px" : "before:bottom-0 before:rounded-b-lg");
  if (!on(at - 1)) classes.push("before:rounded-t-lg");

  return classes;
}

// A move of the people chosen, in its own dialog: the unit they go to and the role each takes there, then the preview
// of who goes where and the one act that writes it.
const moving = ref(false);
const moveDialog = useTemplateRef<{ start: (people: readonly string[], to?: number | null) => void }>("moveDialog");

function openMove(): void {
  moveDialog.value?.start(choosable.value.filter((member) => selected.value.has(member)));
}

// --- People carried by the pointer onto a unit of the tree ---

// The drag type the people chosen travel under from the unit's list to the tree.
const PEOPLE_DRAG = "application/x-organization-people";
// The unit of the tree carried people stand over.
const dropUnit = ref<number | null>(null);

// A person's row carried takes the people chosen with it, or the person alone where they are not chosen.
function carryPeople(event: DragEvent, member: string): void {
  if (!selected.value.has(member)) {
    selected.value = new Set([member]);
    anchor.value = member;
  }

  event.dataTransfer?.setData(PEOPLE_DRAG, member);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

// The unit whose row of the tree the pointer is level with, read off where the rows stand.
function unitAt(event: DragEvent): number | null {
  const tree = event.currentTarget as HTMLElement;

  for (const mark of tree.querySelectorAll<HTMLElement>("[data-unit-drop]")) {
    const box = (mark.closest<HTMLElement>('[data-slot="link"]') ?? mark).getBoundingClientRect();

    if (event.clientY >= box.top && event.clientY < box.bottom) return Number(mark.dataset.unitDrop);
  }

  return null;
}

function peopleOver(event: DragEvent): void {
  if (!(event.dataTransfer?.types.includes(PEOPLE_DRAG) ?? false)) return;

  const unit = unitAt(event);

  dropUnit.value = unit === chosen.value?.id ? null : unit;
  if (dropUnit.value === null) return;

  event.preventDefault();
  event.dataTransfer!.dropEffect = "move";
}

function peopleLeave(event: DragEvent): void {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) dropUnit.value = null;
}

// People dropped on a unit: the move's preview, the unit chosen as where they go and each staying a member.
function peopleDropped(event: DragEvent): void {
  const unit = dropUnit.value;

  dropUnit.value = null;
  if (unit === null || !(event.dataTransfer?.types.includes(PEOPLE_DRAG) ?? false)) return;

  event.preventDefault();
  moveDialog.value?.start(choosable.value.filter((member) => selected.value.has(member)), unit);
}

// A person picker's words name its action rather than hint at a value, so they read at the words' own colour.
const PICKER_UI = { placeholder: "text-default" };

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

  if (!(await acting(() => $fetch("/api/organization/units", { method: "POST", body }), formFailure))) return;

  adding.value = false;
  if (body.parent !== null) openBranches([...branchesAbove(units.value ?? [], body.parent), body.parent]);
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

// The person whose machine is open in its dialog.
const machineOpen = ref(false);
const machineUser = ref<string | null>(null);

function openMachine(user: string): void {
  machineUser.value = user;
  machineOpen.value = true;
}

onMounted(() => void read());

// The tab's create: a unit, by its form.
defineExpose({ addLabel: computed(() => t("organization.action.add")), openAdd });
</script>
