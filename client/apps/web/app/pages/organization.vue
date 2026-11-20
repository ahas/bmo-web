<template>
  <!-- The organisation screen (docs/web.md, 「Organisation」): the organisations at its left and the one chosen at its
       right, two regions parted by a splitter whose width this browser keeps, each scrolling on its own. On a narrow
       screen the organisation chosen fills the body and the list rises as a bottom drawer from the button at its head,
       which carries its name. Inside the organisation chosen the tab row stands at its head, the open tab's own add at
       its right end where it has one, the row's grey icon at every width, and the open tab scrolled into the row's
       view. A tab's content stands in a reading column centred in the region, the region's padding outside it, and
       scrolls; a tab laid across the whole region takes it unpadded and scrolls its own parts. A reader with no
       organisation to set is told so, with no tab. -->
  <UDashboardPanel id="organization" :ui="{ body: 'p-0 sm:p-0 gap-0 [&>*]:max-w-none' }">
    <template #header>
      <ConsoleTitleBar :title="$t('screens.label.organization')" icon="i-material-symbols-domain" />
    </template>

    <template #body>
      <!-- With no organisation to set, the list's empty state alone; the administrator's keeps its add of a company above it,
           so the first company is made there. -->
      <div v-if="none" class="flex min-h-0 flex-1 flex-col" data-organization-none>
        <div v-if="administrator" class="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
          <OrganizationList drawer :organizations="listed" :chosen="null" :administrator="administrator" :failure="''" :reading="false" @add="openAdd" />
        </div>
        <p v-else class="mx-auto w-full max-w-3xl p-4 text-sm text-muted">{{ $t("organization.label.list_none") }}</p>
      </div>

      <USplitter v-else id="organization-list-splitter" auto-save-id="bmo-organization-list-splitter" :items="regions" :ui="{ handle: SPLIT_HANDLE }" class="min-h-0 flex-1">
        <template #list>
          <OrganizationList :organizations="listed" :chosen="chosen?.id ?? null" :administrator="administrator" :failure="organizations.failure.value" :reading="organizations.reading.value" @choose="choose" @add="openAdd" @retry="organizations.refresh" />
        </template>

        <template #organization>
          <section class="flex min-h-0 min-w-0 flex-1 flex-col" :aria-label="chosen?.name" :data-organization-chosen="chosen?.id">
            <!-- On a phone the organisation's name opens the list's drawer; a name the button cuts short reads whole in
                 its tooltip, a finger resting on it to read it. -->
            <div v-if="narrow" class="flex h-12 shrink-0 items-center px-2">
              <UButton v-if="chosen !== null" color="neutral" variant="ghost" class="max-w-full font-semibold text-highlighted" trailing-icon="i-material-symbols-unfold-more" data-organization-list-open @click="listOpen = true">
                <HintTip :text="chosen.name" cut press class="block min-w-0 truncate" data-organization-name>{{ chosen.name }}</HintTip>
              </UButton>
              <SkeletonBar v-else class="ms-2.5 h-4 w-1/2" />
            </div>

            <div ref="tabRow" :class="['flex h-12 shrink-0 items-center gap-2 ps-2 pe-4 sm:ps-4', TAB_ROW_LINE]">
              <UTabs
                :key="rowKey"
                :model-value="tabChosen"
                :items="tabItems"
                :content="false"
                color="neutral"
                variant="link"
                size="sm"
                class="min-w-0 flex-1 self-stretch"
                :ui="TAB_ROW_UI"
                :aria-label="$t('organization.aria.tabs')"
                @update:model-value="(value: string | number) => setTab(String(value))"
              />

              <IconButton
                v-if="addLabel !== null"
                size="sm"
                :icon="TAB_ADD_ICON"
                :label="addLabel"
                :disabled="section?.addDisabled ?? false"
                data-tab-add
                @click="section?.openAdd?.()"
              />
            </div>

            <div v-if="tab === null || chosen === null" class="flex min-h-0 min-w-0 flex-1 flex-col" aria-busy="true" data-organization-body data-organization-waiting />
            <div v-else-if="tab.wide" class="flex min-h-0 min-w-0 flex-1 flex-col" data-organization-body>
              <component :is="tabComponent" :key="chosen.id" ref="section" :company="chosen" />
            </div>
            <div v-else class="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto p-4" data-organization-body>
              <div class="mx-auto flex w-full min-w-0 max-w-3xl flex-col" data-organization-column>
                <component :is="tabComponent" :key="chosen.id" ref="section" :company="chosen" />
              </div>
            </div>
          </section>
        </template>
      </USplitter>

      <UDrawer v-if="narrow" v-model:open="listOpen" :title="$t('organization.label.list')" :ui="FULL_SHEET">
        <template #body>
          <OrganizationList drawer :organizations="listed" :chosen="chosen?.id ?? null" :administrator="administrator" :failure="organizations.failure.value" :reading="organizations.reading.value" @choose="choose" @add="openAdd" @retry="organizations.refresh" />
        </template>
      </UDrawer>

      <!-- A new company: one name, and one save at its foot (docs/web.md, 「Organisation」). -->
      <SettingsDialog v-model:open="adding" :title="$t('organization.action.add_company')" :dirty="addChanges">
        <UForm id="company-add-form" :state="draft" class="flex flex-col gap-4" @submit="add">
          <UFormField :label="$t('organization.label.name')" name="name" required>
            <UInput v-model="draft.name" class="w-full" data-company-add-name />
          </UFormField>
          <UAlert v-if="addFailure !== ''" color="error" variant="subtle" :description="addFailure" />
        </UForm>
        <template #footer="{ close }">
          <UButton color="neutral" variant="ghost" :label="$t('common.action.cancel')" @click="close()" />
          <UButton type="submit" form="company-add-form" :label="$t('common.action.save')" :loading="addBusy" :disabled="addBusy || draft.name.trim() === ''" />
        </template>
      </SettingsDialog>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useOpenedWith } from "bmo-ui/app/domain/form-save";
import { useNarrow } from "bmo-ui/app/domain/screen";
import { FULL_SHEET, SPLIT_HANDLE } from "bmo-ui/app/domain/side-parts";
import { TAB_ROW_LINE, TAB_ROW_UI } from "bmo-ui/app/domain/tabs";

import { useAdministrator } from "~/domain/access";
import {
  ORGANIZATION_KEY,
  ORGANIZATION_PATH,
  chosenOrganization,
  organizationAddress,
  organizationChosenAddress,
  organizationMovedAway,
  organizationRowTabs,
  organizationTabOf,
  organizationTabsFor,
  useOrganizationReader,
  useOrganizations
} from "~/domain/organization";
import { TAB_ADD_ICON } from "~/domain/tab-create";
import { revealOpenTab } from "~/domain/tab-row";

import type { TabCreate } from "~/domain/tab-create";
import type { RosterDetail } from "#shared/roster";
import type { SplitterItem } from "@nuxt/ui";
import type { Component } from "vue";

// A member opens it for the organisations where they head a unit, manage the supply or head the company; one with
// none is told so (docs/web.md, 「Organisation」).
definePageMeta({ member: true });

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const narrow = useNarrow();
const administrator = useAdministrator();

// The organisations the reader may set anything in, and the one the address chooses among them: the one it names, a
// link's unit's own, or the first. The list stands once the page is in the browser's hands: the server draws none, and
// a read that answered while the browser was still taking over what the server drew must not change what it draws.
const organizations = useOrganizations((error) => failureText(error, t("organization.error.failed")));
const mounted = ref(false);
const listed = computed(() => (mounted.value ? organizations.list.value : null));

onMounted(() => {
  mounted.value = true;
});

// A link naming a person but no organisation — a person's tab from before the list, the console search's person —
// opens the organisation that person stands in, read off the person; until it is read no organisation is chosen. A
// read that fails leaves the link to the first organisation.
const personAsked = computed(() => {
  const user = route.query.user;

  return route.query[ORGANIZATION_KEY] === undefined && typeof user === "string" && /^[1-9][0-9]*$/.test(user) ? user : null;
});
const personCompany = ref<{ user: string; company: number | null } | null>(null);

onMounted(() =>
  watch(
    personAsked,
    async (user) => {
      if (user === null || personCompany.value?.user === user) return;

      const company = await $fetch<RosterDetail>(`/api/organization/people/${user}`).then((person) => person.company.id, () => null);

      personCompany.value = { user, company };
    },
    { immediate: true }
  )
);

const chosen = computed(() => {
  if (listed.value === null) return null;
  if (personAsked.value === null) return chosenOrganization(route.query, listed.value, organizations.companyOf);
  if (personCompany.value?.user !== personAsked.value) return null;

  const company = personCompany.value.company;

  return chosenOrganization(company === null ? route.query : { ...route.query, [ORGANIZATION_KEY]: String(company) }, listed.value, organizations.companyOf);
});
const none = computed(() => listed.value !== null && listed.value.length === 0 && organizations.failure.value === "");

// Each tab says which readers it stands for; who reads is known at once for the administrator, and for a member once
// the people roster and the supply read have said whether they cover the organisation chosen. Until then the row
// holds the tab the address names as well, chosen, and the region draws no tab not yet known to stand for the reader:
// the server draws the page before it knows, and a tab it drew that the browser then took away would leave the
// server's markup behind on the page.
const reader = useOrganizationReader(() => chosen.value?.id ?? null);

const tabs = computed(() => organizationTabsFor(reader.value));
const tab = computed(() => organizationTabOf(route.query.tab, reader.value));
const tabChosen = computed(() => tab.value?.value ?? String(route.query.tab ?? ""));
const tabItems = computed(() => organizationRowTabs(reader.value, route.query.tab).map((one) => ({ value: one.value, icon: one.icon, label: t(one.label) })));
// The row is drawn again whenever the tabs it holds change, so its underline is measured afresh under the chosen tab
// where a tab came in before it.
const rowKey = computed(() => tabItems.value.map((one) => one.value).join(" "));

// The regions the splitter parts, in hundredths of its width: the list, wide enough for its search box and a name,
// which can be widened to two fifths, and the organisation chosen; on a phone the organisation alone, the list in its
// drawer.
const LIST_REGION: SplitterItem = { slot: "list", minSize: 18, defaultSize: 26, maxSize: 40 };
const ORGANIZATION_REGION: SplitterItem = { slot: "organization", minSize: 60 };
const regions = computed<SplitterItem[]>(() => (narrow.value ? [{ ...ORGANIZATION_REGION, minSize: 100, defaultSize: 100 }] : [LIST_REGION, ORGANIZATION_REGION]));
const listOpen = ref(false);

// An address naming a tab that moved away is taken to where its section stands now, one naming a tab the reader may
// not open to the first one they may, and one naming no organisation, or one the reader may not set, to the one
// chosen in its place, each with no step of the history; the last two wait until who reads is known. Each waits until
// the page stands in the browser: an address replaced while the page is still taking over what the server drew would
// leave the page on the address before it.
onMounted(() =>
  watch(
    () => [route.query.tab, tabs.value, reader.value.known, chosen.value?.id] as const,
    ([asked, list, , company]) => {
      // Once the page is being left, its address is no longer its own to set.
      if (router.currentRoute.value.path !== ORGANIZATION_PATH) return;

      const moved = organizationMovedAway(asked, route.query);

      if (moved !== null) {
        void router.replace(moved);

        return;
      }

      if (asked !== undefined && reader.value.known && !list.some((one) => one.value === asked)) {
        void router.replace(organizationAddress(list[0]!.value, route.query));

        return;
      }

      if (company !== undefined && route.query[ORGANIZATION_KEY] !== String(company)) void router.replace({ query: { ...route.query, [ORGANIZATION_KEY]: String(company) } });
    },
    { immediate: true }
  )
);

// The tab stands in the address, and moving to another is a step of the history that keeps the organisation chosen;
// the first is the organisation's own address.
function setTab(next: string): void {
  if (next === tabChosen.value) return;

  void router.push(organizationAddress(next, route.query));
}

// Choosing an organisation is a step of the history and stands in the address, so a shared link opens the same one; on
// a phone it closes the drawer it was chosen in.
function choose(company: number): void {
  listOpen.value = false;

  if (company === chosen.value?.id) return;

  void router.push(organizationChosenAddress(company, route.query));
}

// The open tab's own create, which it names and opens itself; a tab with none leaves the row without the button.
const section = useTemplateRef<TabCreate>("section");
const addLabel = computed(() => section.value?.addLabel ?? null);

// The open tab brought into the row's view as it changes, as the row first stands and as it is drawn again, and
// whenever the row's tabs are laid out at another width — the region turning narrow, the open tab's add coming in at
// the row's end — on a phone where the row scrolls sideways.
const tabRow = useTemplateRef<HTMLElement>("tabRow");
const rowWidth = import.meta.client ? new ResizeObserver(() => revealOpenTab(tabRow.value)) : null;

watch(
  () => [tabChosen.value, rowKey.value, tabRow.value] as const,
  () =>
    void nextTick(() => {
      const list = tabRow.value?.querySelector('[role="tablist"]');

      rowWidth?.disconnect();
      if (list) rowWidth?.observe(list);
      revealOpenTab(tabRow.value);
    }),
  { immediate: true, flush: "post" }
);

onScopeDispose(() => rowWidth?.disconnect());

// Each tab's component, made once and loaded the first time it is opened; none while no tab is drawn. It is made
// afresh for each organisation chosen, so nothing one organisation read stands in another's.
const components = new Map<string, Component>();
const tabComponent = computed(() => {
  if (tab.value === null) return null;

  const { value, load } = tab.value;

  if (!components.has(value)) components.set(value, defineAsyncComponent(load));

  return components.get(value)!;
});


// --- A new company, the administrator's from the list's head ---

const adding = ref(false);
const addBusy = ref(false);
const addFailure = ref("");
const draft = reactive({ name: "" });
const addChanges = useOpenedWith(() => draft, { open: adding });

function openAdd(): void {
  listOpen.value = false;
  draft.name = "";
  addFailure.value = "";
  adding.value = true;
}

// The company made, the list read again and the new company chosen.
async function add(): Promise<void> {
  addBusy.value = true;
  addFailure.value = "";
  try {
    const made = await $fetch<{ id: number }>("/api/organization/units", { method: "POST", body: { name: draft.name.trim(), parent: null } });

    await organizations.refresh();
    adding.value = false;
    choose(made.id);
  } catch (error) {
    addFailure.value = failureText(error, t("organization.error.failed"));
  } finally {
    addBusy.value = false;
  }
}
</script>
