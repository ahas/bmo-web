<template>
  <!-- The units tab (docs/web.md, 「Organisation」, its chart): the organisation chosen's units as a tree, the
       organisation at its top, beside the unit chosen, its heads and its people, two regions across the whole body
       that each scroll on their own, parted by a splitter. On a narrow screen the unit chosen fills the body and the
       tree opens as a bottom drawer from the button at the unit's head. What a unit is called is its name alone. -->
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
          <template v-else>
            <div v-if="kindItems.length > 1" class="px-2 pt-2" data-unit-kind-filter>
              <ChoiceSelect :model-value="kindFilter" :items="kindItems" value-key="value" size="sm" class="w-full" :aria-label="$t('organization.label.kind')" @update:model-value="(value: string) => setKindFilter(value)" />
            </div>
            <OrganizationUnitTree v-if="kindFilter === KIND_ALL" v-model:expanded="expanded" class="w-max min-w-full p-2" :units="units" :chosen="chosen?.id ?? null" :dropping="dropUnit" @choose="choose" />
            <OrganizationKindUnits v-else class="p-2" :units="unitsOfKind" :chosen="chosen?.id ?? null" @choose="choose" />
          </template>
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
                <div v-if="chosen.kind || chosen.shortName || reportsToOf(chosen) !== null" class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted" data-unit-attributes>
                  <UBadge v-if="chosen.kind" :label="chosen.kind.name" color="neutral" variant="subtle" size="sm" data-unit-kind />
                  <span v-if="chosen.shortName" data-unit-short-name>{{ $t("organization.label.short_name_line", { name: chosen.shortName }) }}</span>
                  <ULink v-if="reportsToOf(chosen) !== null" class="text-start text-sm break-keep [overflow-wrap:anywhere]" data-unit-reports-to @click="choose(reportsToOf(chosen)!)">{{ $t("organization.label.reports_to_line", { path: pathText(reportsToOf(chosen)!, true) }) }}</ULink>
                </div>
              </div>
              <div class="flex justify-end">
                <UButton color="neutral" variant="subtle" icon="i-material-symbols-edit-outline" :label="$t('organization.action.edit')" data-unit-edit @click="openEdit" />
              </div>
            </div>

            <SettingsGroup :title="$t('organization.label.heads')">
              <template #aside>
                <ChoiceSelect
                  :model-value="undefined"
                  :items="people(chosen.heads)"
                  value-key="value"
                  icon="i-material-symbols-person-add-outline"
                  size="sm"
                  :placeholder="$t('organization.action.add_head')"
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
                <template #description>
                  <span v-if="actingUser === head || postHeads.has(head)" class="flex gap-1">
                    <UBadge v-if="actingUser === head" :label="$t('organization.label.acting_mark')" color="neutral" variant="subtle" size="sm" data-unit-head-acting />
                    <UBadge v-if="postHeads.has(head)" :label="$t('organization.label.post_mark')" color="neutral" variant="subtle" size="sm" data-unit-head-post />
                  </span>
                </template>
                <UTooltip v-if="actingUser !== head" :text="$t('organization.action.remove_head', { name: nameOf(head) })">
                  <UButton color="neutral" variant="ghost" icon="i-material-symbols-person-remove-outline" :aria-label="$t('organization.action.remove_head', { name: nameOf(head) })" :loading="working === `head:${head}`" :disabled="busy" @click="setHead(head, false)" />
                </UTooltip>
              </SettingsRow>
            </SettingsGroup>

            <!-- The person acting for the unit's head while an appointment runs (docs/accounts.md, 「Acting」). -->
            <SettingsGroup :title="$t('organization.label.acting')" data-unit-acting>
              <template #aside>
                <UButton color="neutral" variant="subtle" size="sm" icon="i-material-symbols-person-add-outline" :label="$t('organization.action.appoint')" :disabled="busy || view === null" data-unit-appoint @click="actingOpen = true" />
              </template>
              <div v-if="view === null" class="flex h-14 items-center"><SkeletonBar class="h-4 w-1/3" /></div>
              <SettingsRow v-else-if="view.acting" :label="nameOf(view.acting.user)" :description="$t('organization.label.acting_until', { date: lastDay(view.acting.until) })" data-unit-acting-row>
                <UButton color="neutral" variant="outline" :label="$t('organization.action.end_acting')" :aria-label="$t('organization.action.end_acting_of', { name: nameOf(view.acting.user) })" :loading="working === 'acting'" :disabled="busy" data-unit-end-acting @click="endActing" />
              </SettingsRow>
              <SettingsRow v-else :label="$t('organization.label.acting_none')" />
            </SettingsGroup>

            <!-- Several people are chosen at once, a run of them by Shift or a held finger, and moved into another unit
                 together after the move's preview (docs/web.md, 「Organisation settings」, the units tab). -->
            <div ref="memberList">
              <SettingsGroup :title="$t('organization.label.members', { count: countText(chosen.members.length) })">
                <template #aside>
                  <ChoiceSelect
                    :model-value="undefined"
                    :items="people(chosen.members)"
                    value-key="value"
                    icon="i-material-symbols-group-add-outline"
                    size="sm"
                    :placeholder="$t('organization.action.place')"
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
                  <div class="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                    <span class="min-w-0 flex-1 text-sm break-words text-highlighted">{{ gone(member) ? $t("organization.label.left_member", { name: nameOf(member) }) : nameOf(member) }}</span>
                    <ChoiceSelect
                      v-if="!gone(member) && chosenRoles.length > 0 && view !== null"
                      :model-value="roleOfMember(member)"
                      :items="roleItems"
                      value-key="value"
                      size="sm"
                      class="w-36 shrink-0"
                      :disabled="busy"
                      :loading="working === `role:${member}`"
                      :aria-label="$t('organization.label.position_of', { name: nameOf(member) })"
                      data-member-position
                      @update:model-value="(value: string) => setRole(member, value)"
                    />
                  </div>
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

            <!-- The people holding a post in the unit, beside the people whose home unit it is (docs/accounts.md,
                 「Concurrent posts」). -->
            <SettingsGroup :title="$t('organization.label.posts', { count: countText(view?.concurrent.length ?? 0) })" data-unit-posts>
              <template #aside>
                <UButton color="neutral" variant="subtle" size="sm" icon="i-material-symbols-group-add-outline" :label="$t('organization.action.add_post')" :disabled="busy || view === null" data-unit-add-post @click="openPost(null)" />
              </template>
              <div v-if="view === null" class="flex h-14 items-center"><SkeletonBar class="h-4 w-1/3" /></div>
              <SettingsRow v-else-if="view.concurrent.length === 0" :label="$t('organization.label.no_posts')" />
              <SettingsRow v-for="post in view?.concurrent ?? []" v-else :key="post.user" :label="nameOf(post.user)" data-unit-post>
                <template #description>
                  <span v-if="post.role || post.head" class="flex flex-wrap items-center gap-1">
                    <span v-if="post.role">{{ post.role.name }}</span>
                    <UBadge v-if="post.head" :label="$t('organization.label.role_head')" color="neutral" variant="subtle" size="sm" />
                  </span>
                </template>
                <div class="flex shrink-0 items-center gap-1">
                  <UTooltip :text="$t('organization.action.edit_post', { name: nameOf(post.user) })">
                    <UButton color="neutral" variant="ghost" icon="i-material-symbols-edit-outline" :aria-label="$t('organization.action.edit_post', { name: nameOf(post.user) })" :disabled="busy" data-unit-edit-post @click="openPost(post.user)" />
                  </UTooltip>
                  <UTooltip :text="$t('organization.action.remove_post', { name: nameOf(post.user) })">
                    <UButton color="neutral" variant="ghost" icon="i-material-symbols-person-remove-outline" :aria-label="$t('organization.action.remove_post', { name: nameOf(post.user) })" :loading="working === `post:${post.user}`" :disabled="busy" data-unit-remove-post @click="removePost(post.user)" />
                  </UTooltip>
                </div>
              </SettingsRow>
            </SettingsGroup>

            <p v-if="failure !== ''" role="alert" class="text-sm text-error">{{ failure }}</p>
          </section>
        </div>
      </template>
    </USplitter>

    <UDrawer v-if="narrow" v-model:open="treeOpen" :title="$t('organization.label.chart')">
      <template #body>
        <div v-if="kindItems.length > 1" class="pb-2">
          <ChoiceSelect :model-value="kindFilter" :items="kindItems" value-key="value" size="sm" class="w-full" :aria-label="$t('organization.label.kind')" @update:model-value="(value: string) => setKindFilter(value)" />
        </div>
        <div v-if="kindFilter === KIND_ALL" class="overflow-x-auto [scrollbar-width:thin]">
          <OrganizationUnitTree v-model:expanded="expanded" class="w-max min-w-full" :units="units ?? []" :chosen="chosen?.id ?? null" @choose="choose" />
        </div>
        <OrganizationKindUnits v-else :units="unitsOfKind" :chosen="chosen?.id ?? null" @choose="choose" />
      </template>
    </UDrawer>

    <SettingsDialog v-model:open="adding" :title="$t('organization.action.add')" :dirty="addChanges">
      <UForm id="unit-add-form" :state="draft" class="flex flex-col gap-4" @submit="add">
        <UFormField :label="$t('organization.label.name')" name="name" required>
          <UInput v-model="draft.name" class="w-full" />
        </UFormField>
        <UFormField :label="$t('organization.label.parent')" name="parent">
          <ChoiceSelect v-model="draft.parent" :items="parents(null)" value-key="value" class="w-full" data-unit-add-parent />
        </UFormField>
        <UAlert v-if="formFailure !== ''" color="error" variant="subtle" :description="formFailure" />
      </UForm>
      <template #footer="{ close }">
        <UButton color="neutral" variant="ghost" :label="$t('common.action.cancel')" @click="close()" />
        <UButton type="submit" form="unit-add-form" :label="$t('common.action.save')" :loading="busy" :disabled="busy || draft.name.trim() === ''" />
      </template>
    </SettingsDialog>

    <SettingsDialog v-model:open="editing" :title="editOf?.name ?? ''" :dirty="editChanges">
      <UForm id="unit-edit-form" :state="edit" class="flex flex-col gap-4" @submit="saveEdit">
        <UFormField :label="$t('organization.label.name')" name="name" required>
          <UInput v-model="edit.name" class="w-full" />
        </UFormField>
        <UFormField v-if="editOf !== null && !isCompany(editOf)" :label="$t('organization.label.parent')" name="parent">
          <ChoiceSelect v-model="edit.parent" :items="parents(editOf.id)" value-key="value" class="w-full" />
        </UFormField>
        <UFormField :label="$t('organization.label.kind')" name="kind">
          <ChoiceSelect v-model="edit.kind" :items="editKindItems" value-key="value" class="w-full" data-unit-edit-kind />
        </UFormField>
        <UFormField :label="$t('organization.label.short_name')" name="shortName">
          <UInput v-model="edit.shortName" class="w-full" :maxlength="20" data-unit-edit-short-name />
        </UFormField>
        <UFormField v-if="editOf !== null && !isCompany(editOf)" :label="$t('organization.label.reports_to')" name="reportsTo">
          <ChoiceSelect v-model="edit.reportsTo" :items="reportsToItems(editOf.id)" value-key="value" class="w-full" data-unit-edit-reports-to />
        </UFormField>
        <UAlert v-if="formFailure !== ''" color="error" variant="subtle" :description="formFailure" />
      </UForm>
      <template #footer="{ close }">
        <UButton color="neutral" variant="ghost" :label="$t('common.action.cancel')" @click="close()" />
        <UButton type="submit" form="unit-edit-form" :label="$t('common.action.save')" :loading="busy" :disabled="busy || !editChanges.dirty.value || edit.name.trim() === ''" />
      </template>
    </SettingsDialog>

    <!-- A person's machine, and a move of the people chosen, each a dialog of its own the people tab opens too. -->
    <OrganizationMachineDialog v-model:open="machineOpen" :user="machineUser" :name="machineUser === null ? '' : nameOf(machineUser)" />
    <OrganizationMoveDialog ref="moveDialog" v-model:open="moving" :units="units ?? []" :name-of="nameOf" :roles-of="rolesOf" @moved="chooseAll(false)" @settled="read" />
    <OrganizationActingDialog v-if="chosen !== null" v-model:open="actingOpen" :unit="chosen.id" :people="companyPeople(chosen.id, [])" :acting="view?.acting ? nameOf(view.acting.user) : null" @saved="read" />
    <OrganizationPostDialog
      v-if="chosen !== null"
      v-model:open="postOpen"
      :title="postUser === null ? $t('organization.action.add_post') : $t('organization.action.edit_post', { name: nameOf(postUser) })"
      :unit="chosen.id"
      :user="postUser"
      :people="companyPeople(chosen.id, [...chosen.members, ...(view?.concurrent ?? []).map((post) => post.user)])"
      :roles="chosenRoles"
      :saved="postSaved"
      @saved="read"
    />
  </div>
</template>

<script setup lang="ts">
import { CHOOSE_CELL } from "bmo-ui/app/domain/chooseall";
import { draggedSelection, useDragSelect } from "bmo-ui/app/domain/dragselect";
import { failureText } from "bmo-ui/app/domain/errors";
import { useOpenedWith } from "bmo-ui/app/domain/form-save";
import { useNarrow } from "bmo-ui/app/domain/screen";
import { SPLIT_HANDLE } from "bmo-ui/app/domain/side-parts";
import { dayKey, toUnixSeconds } from "bmo-ui/app/domain/time";

import { useConfirm } from "~/domain/confirm";
import { countText } from "~/domain/numbers";
import { ORGANIZATION_UNITS_KEY, branchesAbove, branchesOpenAtFirst, isCompany, unitPath } from "~/domain/organization";
import { shownName } from "~/domain/people";

import type { Organization } from "~/domain/organization";
import type { SplitterItem } from "@nuxt/ui";
import type { Ref } from "vue";
import type { RoleView } from "#shared/roster";
import type { Unit, UnitRow, UserSummary } from "@web/server-client";

interface Props {
  // The organisation chosen, whose tree alone the tab stands.
  company: Organization;
}

const props = defineProps<Props>();

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

// The unit the address names, or the organisation itself where it names none of its tree.
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

// The parents a unit may stand under, each by its path from the organisation: for a new unit any unit of it, the
// organisation first; for a unit standing, those that do not stand under it.
function parents(of: number | null): { label: string; value: string }[] {
  const all = units.value ?? [];
  const choice = (unit: UnitRow) => ({ label: pathText(unit.id, true), value: String(unit.id) });

  if (of === null) return all.map(choice);

  const company = pathOf(of)[0]?.id;
  const below = new Set<number>([of]);

  for (const unit of all) if (!isCompany(unit) && below.has(unit.parent!)) below.add(unit.id);

  return all.filter((unit) => pathOf(unit.id)[0]?.id === company && !below.has(unit.id)).map(choice);
}

// The organisation's units and the people read; a failure stands until a read goes through, so a read asked again
// from it spins on its button rather than giving way to the skeleton. The unit chosen is read whole beside them, and
// the organisation's own lists with them.
async function read(): Promise<void> {
  reading.value = true;
  try {
    const [all, people] = await Promise.all([$fetch<UnitRow[]>("/api/organization/units"), $fetch<UserSummary[]>("/api/users")]);

    units.value = all.filter((unit) => unitPath(all, unit.id)[0]?.id === props.company.id);
    users.value = people;
    failure.value = "";
    await Promise.all([readView(), readCatalogues()]);
  } catch (error) {
    failure.value = failureText(error, t("organization.error.failed"));
  } finally {
    reading.value = false;
  }
}

// --- The unit chosen read whole: the roles its people carry, the people holding a post in it, the appointment ---

const view = ref<Unit | null>(null);

async function readView(): Promise<void> {
  const id = chosen.value?.id;

  if (id === undefined) return;

  const read = await $fetch<Unit>(`/api/organization/units/${id}`);

  if (chosen.value?.id === id) view.value = read;
}

watch(
  () => chosen.value?.id,
  (id, before) => {
    if (id === before || units.value === null) return;

    view.value = null;
    readView().catch((error: unknown) => (failure.value = failureText(error, t("organization.error.failed"))));
  }
);

// The person acting for the unit's head, and the people heading it through a post.
const actingUser = computed(() => view.value?.acting?.user ?? null);
const postHeads = computed(() => new Set((view.value?.concurrent ?? []).filter((post) => post.head).map((post) => post.user)));

// The last day an appointment runs: its end is the start of the day after.
function lastDay(until: number): string {
  return dayKey(toUnixSeconds(until - 1));
}

// --- Each company's own lists: its roles, lowest first, and its unit kinds ---

const catalogues = ref<Record<number, { roles: RoleView[]; kinds: { key: string; name: string }[] }>>({});

async function readCatalogues(): Promise<void> {
  const companies = (units.value ?? []).filter(isCompany);
  const read = await Promise.all(
    companies.map(async (company) => {
      const [roles, kinds] = await Promise.all([
        $fetch<RoleView[]>(`/api/organization/companies/${company.id}/roles`),
        $fetch<{ key: string; name: string }[]>(`/api/organization/companies/${company.id}/unit-kinds`)
      ]);

      return [company.id, { roles, kinds }] as const;
    })
  );

  catalogues.value = Object.fromEntries(read);
}

function companyOf(unit: number): number | undefined {
  return pathOf(unit)[0]?.id;
}

/** The roles of the company a unit stands in, lowest first. */
function rolesOf(unit: number): RoleView[] {
  return catalogues.value[companyOf(unit) ?? -1]?.roles ?? [];
}

// The people of a unit's company but those named, for a picker.
function companyPeople(unit: number, except: string[]): { label: string; value: string }[] {
  const company = companyOf(unit);
  const homes = new Map((units.value ?? []).flatMap((one) => one.members.map((member) => [member, one.id] as const)));

  return users.value
    .filter((one) => !except.includes(one.user) && !gone(one.user) && companyOf(homes.get(one.user) ?? -1) === company)
    .map((one) => ({ label: shownName(one), value: one.user }));
}

// --- A person's role in the unit chosen, set as it is chosen ---

// No role is a value of its own, since a select item's value is never empty.
const NO_ROLE = "none";
const chosenRoles = computed(() => (chosen.value === null ? [] : rolesOf(chosen.value.id)));
const roleItems = computed(() => [{ label: t("organization.label.no_position"), value: NO_ROLE }, ...[...chosenRoles.value].reverse().map((role) => ({ label: role.name, value: role.key }))]);

function roleOfMember(user: string): string {
  return view.value?.roles.find((one) => one.user === user)?.role.key ?? NO_ROLE;
}

// The role written by the move that keeps the person where they stand, their place in the unit as it is.
function setRole(user: string, role: string): void {
  const unit = chosen.value;

  if (unit === null || role === roleOfMember(user)) return;

  const head = unit.heads.includes(user) && actingUser.value !== user;
  const people = [{ user, from: unit.id, head, role: role === NO_ROLE ? null : role }];

  void acting(() => $fetch(`/api/organization/units/${unit.id}/members`, { method: "POST", body: { people } }), failure, `role:${user}`);
}

// --- The appointment and the posts ---

const actingOpen = ref(false);

async function endActing(): Promise<void> {
  const unit = chosen.value;
  const who = view.value?.acting?.user;

  if (unit === null || who === undefined) return;

  const taken = await confirm({ title: t("organization.title.end_acting"), item: nameOf(who), effect: t("organization.message.end_acting"), confirm: t("organization.action.end_acting") });

  if (taken) await acting(() => $fetch(`/api/organization/units/${unit.id}/acting`, { method: "DELETE" }), failure, "acting");
}

const postOpen = ref(false);
const postUser = ref<string | null>(null);
const postSaved = computed(() => {
  const post = view.value?.concurrent.find((one) => one.user === postUser.value);

  return post === undefined ? null : { role: post.role?.key ?? null, head: post.head };
});

function openPost(user: string | null): void {
  postUser.value = user;
  postOpen.value = true;
}

async function removePost(user: string): Promise<void> {
  const unit = chosen.value;

  if (unit === null) return;

  const taken = await confirm({ title: t("organization.title.remove_post"), item: nameOf(user), effect: t("organization.message.remove_post"), confirm: t("organization.action.remove_post_confirm") });

  if (taken) await acting(() => $fetch(`/api/organization/units/${unit.id}/posts/${encodeURIComponent(user)}`, { method: "DELETE" }), failure, `post:${user}`);
}

// --- The tree narrowed by kind ---

// The whole tree is a value of its own, since a select item's value is never empty; a kind is named with its company,
// `<company>:<key>`, as each company keeps its own and the address names it so.
const KIND_ALL = "all";
const kindFilter = computed(() => {
  const asked = String(route.query.kind ?? "");

  return kindItems.value.some((item) => "value" in item && item.value === asked) ? asked : KIND_ALL;
});
const kindItems = computed(() => [
  { label: t("organization.label.kind_all"), value: KIND_ALL },
  ...(units.value ?? []).filter(isCompany).flatMap((company) => {
    const kinds = catalogues.value[company.id]?.kinds ?? [];

    return kinds.map((kind) => ({ label: kind.name, value: `${company.id}:${kind.key}` }));
  })
]);
const unitsOfKind = computed(() => {
  const [company, key] = kindFilter.value.split(":");

  return (units.value ?? [])
    .filter((unit) => unit.kind?.key === key && String(companyOf(unit.id)) === company)
    .map((unit) => ({ id: unit.id, name: unit.name, path: pathText(unit.id, false) }));
});

// The kind chosen stands in the address in place of the one before.
function setKindFilter(value: string): void {
  const { kind: _, ...rest } = route.query;

  void router.replace({ query: value === KIND_ALL ? rest : { ...rest, kind: value } });
}

// The unit a unit's matters go up through, where it reports to one.
function reportsToOf(unit: UnitRow): number | null {
  return unit.reportsTo ?? null;
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

// A new unit of the organisation: a name and a parent, the organisation itself at first. A new company is the
// organisation list's own add.
const adding = ref(false);
const draft = reactive({ name: "", parent: String(props.company.id) });
const addChanges = useOpenedWith(() => draft, { open: adding });

function openAdd(): void {
  Object.assign(draft, { name: "", parent: String(props.company.id) });
  formFailure.value = "";
  adding.value = true;
}

async function add(): Promise<void> {
  const body = { name: draft.name.trim(), parent: Number(draft.parent) };

  if (!(await acting(() => $fetch("/api/organization/units", { method: "POST", body }), formFailure))) return;

  adding.value = false;
  openBranches([...branchesAbove(units.value ?? [], body.parent), body.parent]);
}

// The unit's own form: its name and its parent, held until its one save sends what differs from what is saved.
const editing = ref(false);
const editId = ref<number | null>(null);
const editOf = computed(() => (editId.value === null ? null : unitOf(editId.value)));
const NO_KIND = "none";
const edit = reactive({ name: "", parent: "", kind: NO_KIND, shortName: "", reportsTo: "" });
const editKindItems = computed(() => [
  { label: t("organization.label.no_kind"), value: NO_KIND },
  ...(editOf.value === null ? [] : (catalogues.value[companyOf(editOf.value.id) ?? -1]?.kinds ?? []).map((kind) => ({ label: kind.name, value: kind.key })))
]);

// The units a unit's matters may go up through: those of its company but itself, its parent marked as the default,
// which it reports to where none is set.
function reportsToItems(of: number): { label: string; value: string }[] {
  const unit = unitOf(of);
  const company = companyOf(of);
  const parent = unit === null ? undefined : String(unit.parent ?? "");

  return (units.value ?? [])
    .filter((one) => one.id !== of && companyOf(one.id) === company)
    .map((one) => {
      const label = pathText(one.id, true);

      return { label: String(one.id) === parent ? t("organization.label.default_mark", { label }) : label, value: String(one.id) };
    });
}

// What the unit's form holds as saved: its reports-to the parent where none is set.
function savedEdit(unit: UnitRow): typeof edit {
  const parent = isCompany(unit) ? "" : String(unit.parent);

  return { name: unit.name, parent, kind: unit.kind?.key ?? NO_KIND, shortName: unit.shortName ?? "", reportsTo: unit.reportsTo === undefined || unit.reportsTo === null ? parent : String(unit.reportsTo) };
}

const editChanges = useOpenedWith(() => edit, { open: editing });

function openEdit(): void {
  const unit = chosen.value;

  if (unit === null) return;

  editId.value = unit.id;
  Object.assign(edit, savedEdit(unit));
  formFailure.value = "";
  editing.value = true;
}

async function saveEdit(): Promise<void> {
  const unit = editOf.value;

  if (unit === null || !editChanges.dirty.value) return;

  const saved = savedEdit(unit);
  const body: { name?: string; parent?: number; kind?: string | null; shortName?: string | null; reportsTo?: number | null } = {};

  if (edit.name.trim() !== saved.name) body.name = edit.name.trim();
  if (edit.parent !== saved.parent) body.parent = Number(edit.parent);
  if (edit.kind !== saved.kind) body.kind = edit.kind === NO_KIND ? null : edit.kind;
  if (edit.shortName.trim() !== saved.shortName) body.shortName = edit.shortName.trim() === "" ? null : edit.shortName.trim();
  // Reporting to the unit's own parent is reporting to none: the line goes up through the parent then.
  if (edit.reportsTo !== saved.reportsTo) body.reportsTo = edit.reportsTo === edit.parent ? null : Number(edit.reportsTo);

  if (!(await acting(() => $fetch(`/api/organization/units/${unit.id}`, { method: "PATCH", body }), formFailure))) return;

  editing.value = false;
  // The organisation list names each company as its own unit is named, so a company renamed is read again there.
  if (isCompany(unit) && body.name !== undefined) void refreshNuxtData(ORGANIZATION_UNITS_KEY);
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
