<template>
  <!-- The people tab (docs/web.md, 「Organisation」, the people tab): the people the reader looks through, found by a
       search on the server and narrowed by four filters, beside the person chosen, two regions across the whole body
       parted by a splitter whose widths this browser keeps. The address carries the words, the filters and the person.
       On a narrow screen the list fills the body, its filters in a bottom drawer, and a person chosen opens over it,
       filling the screen; the back arrow and the back gesture return to the list as it was left, which never goes
       away beneath. -->
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <USplitter id="organization-people-splitter" auto-save-id="bmo-organization-people-splitter" :items="regions" :ui="{ handle: SPLIT_HANDLE }" class="min-h-0 flex-1">
      <template #list>
        <section class="flex min-h-0 min-w-0 flex-1 flex-col" :aria-label="$t('roster.label.tab')" data-roster-list>
          <!-- The list's head: the search box, the filters, and how many people match. -->
          <div class="flex shrink-0 flex-col gap-2 border-b border-default p-4" data-roster-head>
            <div class="flex min-w-0 items-center gap-2">
              <UInput
                v-model="words"
                icon="i-material-symbols-search"
                :placeholder="$t('roster.placeholder.search')"
                :aria-label="$t('roster.placeholder.search')"
                :loading="typing"
                class="min-w-0 flex-1"
                data-roster-search
              />
              <UButton v-if="narrow" color="neutral" variant="outline" icon="i-material-symbols-filter-list" :label="$t('roster.action.filter')" class="shrink-0" data-roster-filter-open @click="filtersOpen = true">
                <template v-if="filtersSet > 0" #trailing>
                  <UBadge v-bind="COUNT_BADGE" color="neutral" :label="countText(filtersSet)" />
                </template>
              </UButton>
              <UBadge v-if="total !== null" v-bind="COUNT_BADGE" color="neutral" class="shrink-0" :label="countText(total)" :aria-label="$t('roster.aria.count', { count: countText(total) })" data-roster-count />
            </div>
            <OrganizationPeopleFilters v-if="!narrow" :view="view" :companies="companies" :units="units" @change="setView" />
          </div>

          <!-- The list itself: a failure, the first read's skeleton, a line where nobody stands, or the rows. -->
          <div v-if="failure !== ''" class="min-h-0 flex-1 overflow-y-auto p-4">
            <FailedRead :message="failure" :reading="reading" @retry="readFirst" />
          </div>
          <template v-else-if="people === null">
            <DataTableSkeleton v-if="!narrow" layout="fill" :headers="tableHeaders(columns)" :rows="8" :label="$t('roster.status.loading')" />
            <ContentSkeleton v-else :rows="8" listClass="flex flex-col divide-y divide-default" :label="$t('roster.status.loading')">
              <div class="flex flex-col gap-1 px-4 py-2">
                <div class="flex h-6 items-center gap-2">
                  <SkeletonBar class="size-6 shrink-0 rounded-full" />
                  <SkeletonBar class="h-4 w-1/3" />
                </div>
                <SkeletonLine width="w-1/2" />
              </div>
            </ContentSkeleton>
          </template>
          <div v-else-if="people.length === 0" class="flex min-h-0 flex-1 items-center justify-center p-4">
            <p class="text-sm text-muted" data-roster-empty>{{ $t(view.q === "" && filtersSet === 0 ? "roster.status.none" : "roster.status.no_results") }}</p>
          </div>

          <SettingsTable
            v-else-if="!narrow"
            layout="fill"
            selectable
            :data="people"
            :columns="columns"
            :row-key="(row: RosterPerson) => row.user"
            :row-class="(row: RosterPerson) => (row.user === user ? 'bg-elevated' : '')"
            data-roster-table
            @select="(row: RosterPerson) => openPerson(row.user)"
          >
            <template #name-cell="{ row }">
              <span :class="CELL_TEXT_LINE" class="ps-4" :data-roster-row="row.original.user">
                <UAvatar v-bind="faceOf(row.original)" size="xs" class="shrink-0" />
                <span class="flex min-w-0 flex-col">
                  <SearchText class="truncate text-sm font-medium text-highlighted" :text="shownName(row.original)" :query="view.q" />
                  <!-- A hit only in a field the row does not show, said under the name. -->
                  <span v-if="hiddenHit(row.original, true) !== null" class="truncate text-xs text-muted" data-roster-hidden-hit>
                    {{ hiddenHit(row.original, true)!.label }} · <SearchText :text="hiddenHit(row.original, true)!.snippet" :query="view.q" />
                  </span>
                </span>
              </span>
            </template>
            <template #login-cell="{ row }">
              <span :class="CELL_TEXT"><SearchText class="truncate text-sm text-toned" :text="row.original.login" :query="view.q" /></span>
            </template>
            <template #company-cell="{ row }">
              <span :class="CELL_TEXT"><SearchText class="truncate text-sm text-toned" :text="row.original.company.name" :query="view.q" /></span>
            </template>
            <template #unit-cell="{ row }">
              <span :class="CELL_TEXT"><SearchText class="truncate text-sm text-toned" :text="row.original.unit.name" :query="view.q" /></span>
            </template>
            <template #role-cell="{ row }">
              <span :class="CELL_TEXT" class="text-sm text-toned">{{ $t(ROSTER_ROLE_LABELS[rosterRoleOf(row.original)]) }}</span>
            </template>
            <template #state-cell="{ row }">
              <span :class="CELL_TEXT_LINE">
                <HintTip :text="$t(ROSTER_STATE_FACES[row.original.state].label)" press class="inline-flex">
                  <UIcon :name="ROSTER_STATE_FACES[row.original.state].icon" class="size-5" :class="ROSTER_STATE_FACES[row.original.state].tone" :aria-label="$t(ROSTER_STATE_FACES[row.original.state].label)" />
                </HintTip>
              </span>
            </template>
            <template #machine-cell="{ row }">
              <span :class="[CELL_TEXT, row.original.machine === null ? 'text-muted' : 'font-mono text-toned']" class="truncate text-sm">{{ row.original.machine ?? "—" }}</span>
            </template>
            <template #signIn-cell="{ row }">
              <span :class="CELL_TEXT" class="pe-4 text-sm text-toned tabular-nums">{{ signInText(row.original) }}</span>
            </template>

            <!-- The next page's place while it comes, the list's end once a list of more than one page has no more,
                 a failure of the next page, and the foot the next page is asked by. -->
            <template #body-bottom>
              <template v-if="adding">
                <tr v-for="n in NEXT_SKELETON_ROWS" :key="`more-${n}`" :role="n === 1 ? 'status' : undefined" :aria-label="n === 1 ? $t('roster.status.more_loading') : undefined" class="border-b border-default">
                  <td v-for="(column, index) in columns" :key="String(column.id)" class="p-0"><div class="flex h-12 items-center px-2" :class="index === 0 ? 'ps-4' : ''"><SkeletonBar class="h-4 w-4/5" /></div></td>
                </tr>
              </template>
              <tr v-else-if="moreFailure !== ''">
                <td :colspan="columns.length" class="p-4"><FailedRead :message="moreFailure" :reading="reading" @retry="retryMore" /></td>
              </tr>
              <tr v-else-if="ended">
                <td :colspan="columns.length" class="py-3 text-center text-sm text-muted" data-roster-end>{{ $t("roster.status.end") }}</td>
              </tr>
              <tr ref="foot" aria-hidden="true"><td :colspan="columns.length" class="h-px p-0" /></tr>
            </template>
          </SettingsTable>

          <div v-else class="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
            <ul class="flex flex-col divide-y divide-default" data-roster-rows>
              <li v-for="one in people" :key="one.user">
                <button
                  type="button"
                  class="flex w-full min-w-0 flex-col gap-1 px-4 py-2 text-start transition-colors select-none hover:bg-elevated active:bg-accented focus-inset"
                  :class="one.user === user ? 'bg-elevated' : ''"
                  :data-roster-row="one.user"
                  @click="openPerson(one.user)"
                >
                  <span class="flex h-6 min-w-0 items-center gap-2">
                    <UAvatar v-bind="faceOf(one)" size="2xs" class="shrink-0" />
                    <SearchText class="min-w-0 flex-1 truncate text-sm font-medium text-highlighted" :text="shownName(one)" :query="view.q" />
                    <HintTip :text="$t(ROSTER_STATE_FACES[one.state].label)" press class="inline-flex shrink-0">
                      <UIcon :name="ROSTER_STATE_FACES[one.state].icon" class="size-5" :class="ROSTER_STATE_FACES[one.state].tone" :aria-label="$t(ROSTER_STATE_FACES[one.state].label)" />
                    </HintTip>
                  </span>
                  <span class="flex min-w-0 items-center gap-2 text-sm text-muted">
                    <SearchText class="min-w-0 truncate" :text="one.unit.name" :query="view.q" />
                    <span class="shrink-0">·</span>
                    <span class="shrink-0">{{ $t(ROSTER_ROLE_LABELS[rosterRoleOf(one)]) }}</span>
                  </span>
                  <span v-if="hiddenHit(one, false) !== null" class="truncate text-xs text-muted" data-roster-hidden-hit>
                    {{ hiddenHit(one, false)!.label }} · <SearchText :text="hiddenHit(one, false)!.snippet" :query="view.q" />
                  </span>
                </button>
              </li>
            </ul>
            <ContentSkeleton v-if="adding" :rows="NEXT_SKELETON_ROWS" listClass="flex flex-col divide-y divide-default border-t border-default" :label="$t('roster.status.more_loading')">
              <div class="flex flex-col gap-1 px-4 py-2">
                <div class="flex h-6 items-center gap-2">
                  <SkeletonBar class="size-6 shrink-0 rounded-full" />
                  <SkeletonBar class="h-4 w-1/3" />
                </div>
                <SkeletonLine width="w-1/2" />
              </div>
            </ContentSkeleton>
            <div v-else-if="moreFailure !== ''" class="p-4"><FailedRead :message="moreFailure" :reading="reading" @retry="retryMore" /></div>
            <p v-else-if="ended" class="border-t border-default px-4 py-3 text-center text-sm text-muted" data-roster-end>{{ $t("roster.status.end") }}</p>
            <div ref="foot" aria-hidden="true" class="h-px" />
          </div>
        </section>
      </template>

      <!-- The person chosen, in a reading column of its region, or one line asking for one. -->
      <template #person>
        <div class="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 [scrollbar-width:thin]" data-roster-person-region>
          <OrganizationPerson v-if="user !== null" :key="user" :user="user" @changed="personChanged" />
          <div v-else class="flex h-full items-center justify-center">
            <p class="text-sm text-muted">{{ $t("roster.label.choose") }}</p>
          </div>
        </div>
      </template>
    </USplitter>

    <!-- On a narrow screen the person stands over the list, the whole screen, the list kept beneath as it was. -->
    <div v-if="narrow && user !== null" class="fixed inset-x-0 z-40 flex flex-col bg-default" :style="SCREEN_FRAME" data-roster-person-sheet>
      <div class="min-h-0 flex-1 overflow-y-auto p-4">
        <OrganizationPerson :key="user" :user="user" back @back="closePerson" @changed="personChanged" />
      </div>
    </div>

    <UDrawer v-if="narrow" v-model:open="filtersOpen" :title="$t('roster.action.filter')">
      <template #body>
        <OrganizationPeopleFilters stacked :view="view" :companies="companies" :units="units" @change="setView" />
      </template>
    </UDrawer>
  </div>
</template>

<script setup lang="ts">
import { tableHeaders } from "bmo-ui/app/domain/column-widths";
import { failureText } from "bmo-ui/app/domain/errors";
import { useFootInView } from "bmo-ui/app/domain/foot";
import { SCREEN_FRAME, useNarrow } from "bmo-ui/app/domain/screen";
import { SPLIT_HANDLE } from "bmo-ui/app/domain/side-parts";
import { formatStamp, toUnixSeconds } from "bmo-ui/app/domain/time";

import { identityMark } from "~/domain/avatars";
import { useNextPages } from "~/domain/next-pages";
import { COUNT_BADGE, countText } from "~/domain/numbers";
import {
  ROSTER_ROLE_LABELS,
  ROSTER_STATE_FACES,
  rosterAsk,
  rosterFiltersSet,
  rosterHiddenHit,
  rosterListKey,
  rosterRoleOf,
  rosterUserOf,
  rosterViewOf,
  useRosterCompanies,
  withRosterRow,
  withRosterView
} from "~/domain/roster";
import { CELL_TEXT, CELL_TEXT_LINE } from "~/domain/settings-cells";

import type { RosterView } from "~/domain/roster";
import type { SettingsColumn } from "~/domain/settings-columns";
import type { RosterDetail, RosterPage, RosterPerson } from "#shared/roster";
import type { SplitterItem } from "@nuxt/ui";
import type { InviteUnit } from "@web/server-client";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const narrow = useNarrow();

// The companies the reader looks through, and the units the unit filter chooses among, as the invitations read them.
const { companies } = useRosterCompanies();
const { data: unitData } = useFetch<InviteUnit[]>("/api/invites/units", { key: "invite-units", server: false, lazy: true, default: () => [] });
const units = computed(() => unitData.value ?? []);

// What the address shows: the words and the filters, and the person open.
const view = computed(() => rosterViewOf(route.query));
const user = computed(() => rosterUserOf(route.query));
const filtersSet = computed(() => rosterFiltersSet(view.value));
const filtersOpen = ref(false);

// The regions the splitter parts, in hundredths of its width: the list, which can be widened to most of it, and the
// person; on a phone the list alone, the person over it.
const LIST_REGION: SplitterItem = { slot: "list", minSize: 30, defaultSize: 55, maxSize: 75 };
const PERSON_REGION: SplitterItem = { slot: "person", minSize: 25 };
const regions = computed<SplitterItem[]>(() => (narrow.value ? [{ ...LIST_REGION, minSize: 100, defaultSize: 100, maxSize: 100 }] : [LIST_REGION, PERSON_REGION]));

const columns = computed<SettingsColumn<RosterPerson>[]>(() => [
  { id: "name", header: t("account.label.full_name"), ceiling: 280 },
  { id: "login", header: t("account.label.user_id"), ceiling: 200 },
  { id: "company", header: t("invites.label.company"), ceiling: 200 },
  { id: "unit", header: t("invites.label.unit"), ceiling: 240 },
  { id: "role", header: t("organization.label.role") },
  { id: "state", header: t("roster.label.state") },
  { id: "machine", header: t("roster.label.machine"), ceiling: 200 },
  { id: "signIn", header: t("roster.label.last_sign_in") }
]);

// How many rows the next page's place stands while it comes.
const NEXT_SKELETON_ROWS = 3;

function shownName(person: RosterPerson): string {
  return person.state === "left" ? t("organization.label.left_member", { name: person.name }) : person.name;
}

// A search hit only in a field the row does not show: the table shows the name, the login, the company and the unit,
// and a phone's row the name and the unit.
function hiddenHit(person: RosterPerson, wide: boolean): { label: string; snippet: string } | null {
  const shown = wide ? [person.name, person.login, person.company.name, person.unit.name] : [person.name, person.unit.name];

  return rosterHiddenHit(person, view.value.q, shown, { jobTitle: t("account.label.job_title"), email: t("account.label.email") });
}

function faceOf(person: RosterPerson): ReturnType<typeof identityMark> {
  return identityMark(`user:${person.user}`, person.name);
}

function signInText(person: RosterPerson): string {
  return person.lastSignInAt === null ? t("common.label.no_record") : formatStamp(toUnixSeconds(person.lastSignInAt));
}

// --- The search, as typing stops ---

// The words in the box, which reach the address once typing stops; the address replaces itself as they change.
const SEARCH_PAUSE_MS = 250;
const words = ref(view.value.q);
const typing = ref(false);
let typed: ReturnType<typeof setTimeout> | null = null;

watch(words, (now) => {
  if (typed !== null) clearTimeout(typed);

  typing.value = now.trim() !== view.value.q;
  typed = setTimeout(() => {
    typed = null;
    typing.value = false;
    if (now.trim() !== view.value.q) setView({ ...view.value, q: now.trim() });
  }, SEARCH_PAUSE_MS);
});

// Words the address brings from elsewhere — the back gesture, a shared link — stand in the box, unless the reader is
// typing over them.
watch(
  () => view.value.q,
  (q) => {
    if (typed === null && q !== words.value.trim()) words.value = q;
  }
);

onBeforeUnmount(() => {
  if (typed !== null) clearTimeout(typed);
});

// The words and the filters replace the address rather than step it; the person open stays.
function setView(next: RosterView): void {
  void router.replace({ query: withRosterView(route.query, next) });
}

// --- The list, a page at a time ---

const people = ref<RosterPerson[] | null>(null);
const total = ref<number | null>(null);
const next = ref<string | null>(null);
const pages = ref(0);
const reading = ref(false);
const failure = ref("");
const moreFailure = ref("");
// Which read of the list is the latest; an answer to any before it is dropped, so words typed past never land.
let asked = 0;

const ended = computed(() => next.value === null && pages.value > 1);

// The first page of what the address asks. What stood stays on the screen while it is read again.
async function readFirst(): Promise<void> {
  const mine = ++asked;

  reading.value = true;

  try {
    const page = await $fetch<RosterPage>("/api/organization/people", { query: rosterAsk(view.value) });

    if (mine !== asked) return;

    people.value = page.people;
    total.value = page.total;
    next.value = page.next;
    pages.value = 1;
    failure.value = "";
    moreFailure.value = "";
  } catch (error) {
    if (mine === asked) failure.value = failureText(error, t("roster.error.read_failed"));
  } finally {
    if (mine === asked) reading.value = false;
  }
}

// One page more, after the last person held; a failure keeps what was read and says why at the list's foot.
async function readNext(): Promise<boolean> {
  const mine = asked;
  const after = next.value;

  if (after === null || people.value === null) return false;

  reading.value = true;

  try {
    const page = await $fetch<RosterPage>("/api/organization/people", { query: rosterAsk(view.value, after) });

    if (mine !== asked) return false;

    people.value = [...people.value, ...page.people];
    total.value = page.total;
    next.value = page.next;
    pages.value += 1;
    moreFailure.value = "";

    return true;
  } catch (error) {
    if (mine === asked) moreFailure.value = failureText(error, t("roster.error.read_failed"));

    return false;
  } finally {
    if (mine === asked) reading.value = false;
  }
}

function retryMore(): void {
  moreFailure.value = "";
  void readNext();
}

// The list is read again only as the words or a filter change, never as a person opens or closes.
watch(() => rosterListKey(view.value), () => void readFirst(), { immediate: true });

const foot = useTemplateRef<HTMLElement>("foot");
const atFoot = useFootInView(foot, reading, { rootMargin: "200px" });
const { adding } = useNextPages({
  atFoot,
  more: () => next.value !== null && failure.value === "" && moreFailure.value === "",
  busy: () => reading.value,
  next: readNext
});

// --- The person open ---

// Opening a person is a step of the history, so the back gesture returns to the list.
function openPerson(chosen: string): void {
  if (chosen === user.value) return;

  void router.push({ query: { ...route.query, user: chosen } });
}

// The way back from a person over the list: the step that opened them where the history holds it, so the back arrow
// and the back gesture are one; otherwise the list's own address in place of the person's.
function closePerson(): void {
  const { user: _user, ...rest } = route.query;
  const back = window.history.state?.back;

  if (typeof back === "string" && router.resolve(back).fullPath === router.resolve({ query: rest }).fullPath) router.back();
  else void router.replace({ query: rest });
}

// A person read again after an act stands as they now are in their row.
function personChanged(person: RosterDetail): void {
  if (people.value !== null) people.value = withRosterRow(people.value, person);
}
</script>
