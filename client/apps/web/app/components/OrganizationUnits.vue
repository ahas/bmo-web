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
        <nav class="min-h-0 min-w-0 flex-1 overflow-auto [scrollbar-width:thin]" :aria-label="$t('organization.label.chart')" data-unit-tree>
          <ContentSkeleton v-if="units === null" class="p-2" :rows="TREE_SKELETON_ROWS" listClass="flex flex-col" :label="$t('organization.status.loading')">
            <template #default="{ index }">
              <div class="flex h-8 items-center gap-1.5 px-2.5" :class="index === 0 ? '' : 'ps-6'">
                <SkeletonBar class="size-5 shrink-0 rounded-sm" />
                <SkeletonBar class="h-4" :class="index % 2 === 0 ? 'w-2/3' : 'w-1/2'" />
              </div>
            </template>
          </ContentSkeleton>
          <OrganizationUnitTree v-else v-model:expanded="expanded" class="w-max min-w-full p-2" :units="units" :chosen="chosen?.id ?? null" @choose="choose" />
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

    <!-- A move of the people chosen (docs/web.md, 「Organisation settings」, the units tab): the unit they go to and
         the role each takes there, then who goes where, shown once before the one act writes the whole set. Closing
         it at either step writes nothing. -->
    <SettingsDialog v-model:open="moving" :title="moveStep === 'form' ? $t('organization.action.move') : $t('organization.action.preview')" :dirty="moveDirty">
      <UForm v-if="moveStep === 'form'" id="unit-move-form" :state="moveDraft" class="flex flex-col gap-4" @submit="previewMove">
        <UFormField :label="$t('organization.label.move_to')" name="to" required>
          <USelect v-model="moveDraft.to" :items="destinations" class="w-full" data-move-to />
        </UFormField>
        <SettingsGroup :title="$t('organization.label.role')">
          <SettingsRow v-for="user in moveDraft.people" :key="user" :label="nameOf(user)" data-move-person>
            <USelect v-model="moveDraft.roles[user]" :items="roleItems" class="w-28" :aria-label="$t('organization.label.role_of', { name: nameOf(user) })" data-move-role />
          </SettingsRow>
        </SettingsGroup>
      </UForm>

      <div v-else class="flex flex-col divide-y divide-default" data-move-preview>
        <div v-for="row in plan" :key="row.user" class="flex flex-col gap-1 py-3" data-move-row>
          <span class="text-sm font-medium text-highlighted">{{ nameOf(row.user) }}</span>
          <span v-if="row.unchanged" class="text-sm text-muted">{{ $t("organization.label.unchanged") }}</span>
          <template v-else>
            <span class="text-sm text-muted" data-move-units>{{ row.from === row.to ? pathText(row.to, true) : `${pathText(row.from, true)} → ${pathText(row.to, true)}` }}</span>
            <span class="text-sm" data-move-roles>{{ row.wasHead === row.head ? roleName(row.head) : `${roleName(row.wasHead)} → ${roleName(row.head)}` }}</span>
            <span v-if="row.headDropped" class="flex items-center gap-1 text-sm font-medium text-highlighted" data-move-head-dropped><UIcon name="i-material-symbols-person-remove-outline" class="size-4 shrink-0 text-muted" />{{ $t("organization.label.head_dropped", { unit: unitOf(row.from)?.name ?? "" }) }}</span>
          </template>
        </div>
      </div>

      <UAlert v-if="moveFailure !== ''" color="error" variant="subtle" :description="moveFailure" class="whitespace-pre-line" />

      <template #footer="{ close }">
        <UButton color="neutral" variant="ghost" :label="$t('common.action.cancel')" data-move-cancel @click="close()" />
        <template v-if="moveStep === 'form'">
          <UButton type="submit" form="unit-move-form" :label="$t('organization.action.preview')" :disabled="moveDraft.to === ''" data-move-preview-open />
        </template>
        <template v-else>
          <UButton color="neutral" variant="subtle" :label="$t('common.action.back')" :disabled="moveBusy" data-move-back @click="moveStep = 'form'" />
          <UButton :label="$t('organization.action.move_confirm')" :loading="moveBusy" :disabled="moveBusy || plan.every((row) => row.unchanged)" data-move-apply @click="applyMove" />
        </template>
      </template>
    </SettingsDialog>
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
import { branchesAbove, branchesOpenAtFirst, isCompany, movePlan, unitPath } from "~/domain/organization";

import type { SplitterItem } from "@nuxt/ui";
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

// A move of the people chosen: the unit they go to, every unit offered by its path, and the role each takes there,
// then the preview of who goes where, read off the units as last read, and the one act that writes it.
const moving = ref(false);
const moveStep = ref<"form" | "preview">("form");
const moveBusy = ref(false);
const moveFailure = ref("");
const moveDraft = reactive<{ to: string; people: string[]; roles: Record<string, "member" | "head"> }>({ to: "", people: [], roles: {} });
const moveDirty = computed(() => moveDraft.to !== "" || Object.values(moveDraft.roles).includes("head"));
const destinations = computed(() => (units.value ?? []).map((unit) => ({ label: pathText(unit.id, true), value: String(unit.id) })));
const roleItems = computed(() => [
  { label: t("organization.label.role_member"), value: "member" },
  { label: t("organization.label.role_head"), value: "head" }
]);
const plan = computed(() =>
  movePlan(
    units.value ?? [],
    moveDraft.people.map((user) => ({ user, head: moveDraft.roles[user] === "head" })),
    Number(moveDraft.to)
  )
);

function roleName(head: boolean): string {
  return head ? t("organization.label.role_head") : t("organization.label.role_member");
}

function openMove(): void {
  const people = choosable.value.filter((member) => selected.value.has(member));

  Object.assign(moveDraft, { to: "", people, roles: Object.fromEntries(people.map((user) => [user, "member"])) });
  moveStep.value = "form";
  moveFailure.value = "";
  moving.value = true;
}

function previewMove(): void {
  if (moveDraft.to === "") return;

  moveFailure.value = "";
  moveStep.value = "preview";
}

// The whole set in one act, each person named with the unit they stood in when it was shown; a refusal moves nobody
// and reads the units again, so the preview shows where everyone now stands.
async function applyMove(): Promise<void> {
  const people = plan.value.map((row) => ({ user: row.user, from: row.from, head: row.head }));

  moveBusy.value = true;
  moveFailure.value = "";
  try {
    await $fetch(`/api/organization/units/${Number(moveDraft.to)}/members`, { method: "POST", body: { people } });
    moving.value = false;
    selected.value = new Set();
    anchor.value = null;
  } catch (error) {
    moveFailure.value = failureText(error, t("organization.error.failed"));
  } finally {
    moveBusy.value = false;
  }
  await read();
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

// The tab's create: a unit, by its form.
defineExpose({ addLabel: computed(() => t("organization.action.add")), openAdd });
</script>
