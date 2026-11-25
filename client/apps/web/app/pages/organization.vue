<template>
  <!-- The organisation screen (docs/web.md, 「System and organisation」): one tree of the organisations at its left, companies at
       its top and their units under them, and the node chosen at its right, two regions parted by a splitter whose
       width this browser keeps, each scrolling on its own. On a narrow screen the node chosen fills the body and the
       tree rises as a bottom drawer from the button at the start of the tab row, which carries its name. Inside the
       node chosen the tab row stands at its head, the open tab's own add at its right end where it has one, the row's
       grey icon at every width, and the open tab scrolled into the row's view. A tab's content stands in a reading column centred in the region, the region's padding outside it, and
       scrolls; a tab laid across the whole region takes it unpadded and scrolls its own parts. A reader with no
       organisation to set is told so, with no tab. -->
  <UDashboardPanel id="organization" :ui="{ body: 'p-0 sm:p-0 gap-0 [&>*]:max-w-none' }">
    <template #header>
      <ConsoleTitleBar :title="$t('screens.label.organization')" icon="i-material-symbols-settings" />
    </template>

    <template #body>
      <!-- The organisations in bmo-ui's side tree (docs/web.md, 「System and organisation」), the open tab taking people carried
           onto a unit of it where it takes any. With none to set, no tree and no tab: the words saying so alone, and the
           administrator's add of a company beside them, so the first is made there. -->
      <ChoiceTree
        :listed="!none"
        :label="$t('organization.label.list')"
        :nodes="nodes"
        :chosen="chosenNode"
        save-id="bmo-organization-list-splitter"
        :failure="organizations.failure.value"
        :reading="organizations.reading.value"
        :no-match-text="$t('organization.label.list_no_match')"
        opener-in-body
        :drop-types="treeDrop?.types ?? []"
        :drop-takes="(key: string | number) => (typeof key === 'number' && treeDrop?.takes(key)) || false"
        @choose="choose"
        @retry="organizations.refresh"
        @drop="(key: string | number, event: DragEvent) => typeof key === 'number' && treeDrop?.onto(key, event)"
      >
        <template v-if="administrator" #actions>
          <IconButton size="sm" :icon="TAB_ADD_ICON" :label="$t('organization.action.add_company')" data-organization-add @click="openAdd" />
        </template>

        <template #default="{ opener }">
          <div v-if="none" class="mx-auto flex w-full max-w-3xl items-center gap-2 p-4" data-organization-none>
            <p class="min-w-0 flex-1 text-sm text-muted">{{ $t("organization.label.list_none") }}</p>
          </div>

          <section v-else class="flex min-h-0 min-w-0 flex-1 flex-col" :aria-label="chosenName" :data-organization-chosen="link !== null ? undefined : chosen?.id" :data-organization-node="chosenNode ?? undefined">
            <!-- On a phone the tree's button stands at the row's start, giving way to the tabs. -->
            <div ref="tabRow" :class="['flex h-12 shrink-0 items-center gap-2 ps-2 pe-4 sm:ps-4', TAB_ROW_LINE, OPENER_GIVES_WAY]">
              <component :is="opener" />
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

            <div v-if="tab === null || (chosen === null && link === null)" class="flex min-h-0 min-w-0 flex-1 flex-col" aria-busy="true" data-organization-body data-organization-waiting />
            <!-- A link node chosen, the platform or the reader's own: the tab's own view of that link of its settings,
                 which stands for no company. Only a tab holding such a view stands in the row, so one is always drawn
                 here. -->
            <div v-else-if="link !== null" class="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto p-4" data-organization-body>
              <div class="mx-auto flex w-full min-w-0 max-w-3xl flex-col" data-organization-column>
                <component :is="tabComponent" v-if="tabComponent !== null" :key="link" ref="section" />
              </div>
            </div>
            <div v-else-if="tab.wide" class="flex min-h-0 min-w-0 flex-1 flex-col" data-organization-body>
              <component :is="tabComponent" :key="chosen!.id" ref="section" :company="chosen" />
            </div>
            <div v-else class="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto p-4" data-organization-body>
              <div class="mx-auto flex w-full min-w-0 max-w-3xl flex-col" data-organization-column>
                <component :is="tabComponent" :key="chosen!.id" ref="section" :company="chosen" />
              </div>
            </div>
          </section>
        </template>
      </ChoiceTree>

      <!-- A new company: one name, and one save at its foot (docs/web.md, 「System and organisation」). -->
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
import { TAB_ROW_LINE, TAB_ROW_UI } from "bmo-ui/app/domain/tabs";

import { useAdministrator, useSignedUser } from "~/domain/access";
import {
  LINK_NODES,
  ORGANIZATION_KEY,
  ORGANIZATION_PATH,
  PERSON_NODE,
  PLATFORM_NODE,
  UNIT_KEY,
  chosenOrganization,
  companyOfNode,
  linkChosen,
  linkNode,
  linkNodesFor,
  organizationLinkAddress,
  organizationAddress,
  organizationMovedAway,
  organizationNodeAddress,
  organizationNodes,
  organizationRowTabs,
  platformOnlyTab,
  organizationTabOf,
  organizationTabsFor,
  useOrganizationReader,
  useOrganizations
} from "~/domain/organization";
import { TAB_ADD_ICON } from "~/domain/tab-create";
import { revealOpenTab } from "~/domain/tab-row";

import type { LinkNode, TreeDrop } from "~/domain/organization";
import type { TabCreate } from "~/domain/tab-create";
import type { RosterDetail } from "#shared/roster";
import type { Component } from "vue";

// A member opens it for the organisations where they head a unit, manage the supply or head the company; one with
// none is told so (docs/web.md, 「System and organisation」).
definePageMeta({ member: true });

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const administrator = useAdministrator();
const signedUser = useSignedUser();
// The link nodes the reader's tree holds: their own where they have a user, the platform for the administrator.
const reach = computed(() => ({ administrator: administrator.value, user: signedUser.value !== null }));

// The organisations the reader may set anything in, and the one the address chooses among them: the one it names, a
// link's unit's own, or the first. The list stands once the page is in the browser's hands: the server draws none, and
// a read that answered while the browser was still taking over what the server drew must not change what it draws.
const organizations = useOrganizations((error) => failureText(error, t("organization.error.failed")));
const mounted = ref(false);
const listed = computed(() => (mounted.value ? organizations.list.value : null));
const treeUnits = computed(() => (mounted.value ? organizations.units.value : null));

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
// None to set: no organisation, and no link node of the reader's own either.
const none = computed(() => listed.value !== null && listed.value.length === 0 && organizations.failure.value === "" && linkNodesFor(reach.value).length === 0);

// The unit the address names beside its company, where the tree holds it under the company chosen; the company itself
// is the node chosen otherwise.
const askedUnit = computed(() => {
  const value = route.query[UNIT_KEY];
  const text = Array.isArray(value) ? value[0] : value;

  return typeof text === "string" && /^[1-9][0-9]*$/.test(text) ? Number(text) : null;
});
const chosenUnit = computed(() => {
  const company = chosen.value?.id;

  return treeUnits.value?.find((unit) => unit.id === askedUnit.value && unit.company === company && unit.id !== company) ?? null;
});
// The link node chosen — the reader's own, or the platform for the administrator — where the address names one; a
// reader with no organisation to set stands on the first of theirs where it names nothing.
const link = computed<LinkNode | null>(() => {
  const named = linkChosen(route.query, reach.value);

  if (named !== null) return named;

  return listed.value !== null && listed.value.length === 0 ? (linkNodesFor(reach.value)[0] ?? null) : null;
});
const chosenNode = computed(() => link.value ?? chosenUnit.value?.id ?? chosen.value?.id ?? null);
const chosenName = computed(() => (link.value !== null ? t(LINK_NODES[link.value].label) : (chosenUnit.value?.name ?? chosen.value?.name)));

// The tree's nodes: the link nodes the reader's tree holds, then the organisations, each company's units under it;
// none until both are read.
const nodes = computed(() => {
  if (listed.value === null || treeUnits.value === null) return null;

  return [...linkNodesFor(reach.value).map((node) => linkNode(node, t)), ...organizationNodes(listed.value, treeUnits.value)];
});

// Each tab says which readers it stands for; who reads is known at once for the administrator, and for a member once
// the people roster and the supply read have said whether they cover the organisation chosen. Until then the row
// holds the tab the address names as well, chosen, and the region draws no tab not yet known to stand for the reader:
// the server draws the page before it knows, and a tab it drew that the browser then took away would leave the
// server's markup behind on the page.
const reader = useOrganizationReader(() => (link.value !== null ? null : (chosen.value?.id ?? null)));

const tabs = computed(() => organizationTabsFor(reader.value, link.value));
const tab = computed(() => organizationTabOf(route.query.tab, reader.value, link.value));
const tabChosen = computed(() => tab.value?.value ?? String(route.query.tab ?? ""));
const tabItems = computed(() => organizationRowTabs(reader.value, route.query.tab, link.value).map((one) => ({ value: one.value, icon: one.icon, label: t(one.label) })));
// The row is drawn again whenever the tabs it holds change, so its underline is measured afresh under the chosen tab
// where a tab came in before it.
const rowKey = computed(() => tabItems.value.map((one) => one.value).join(" "));

// An address naming a tab that moved away is taken to where its section stands now, one naming a tab the reader may
// not open to the first one they may, one naming no organisation, or one the reader may not set, to the one chosen in
// its place, and one naming a unit the tree does not hold under it to the company itself, each with no step of the
// history; the tab waits until who reads is known, and the unit until the tree is read. Each waits until
// the page stands in the browser: an address replaced while the page is still taking over what the server drew would
// leave the page on the address before it.
onMounted(() =>
  watch(
    () => [route.query.tab, tabs.value, reader.value.known, chosen.value?.id, treeUnits.value, chosenUnit.value, link.value, route.query[UNIT_KEY]] as const,
    ([asked, list, , company, units, unit]) => {
      // Once the page is being left, its address is no longer its own to set.
      if (router.currentRoute.value.path !== ORGANIZATION_PATH) return;

      const moved = organizationMovedAway(asked, route.query);

      if (moved !== null) {
        void router.replace(moved);

        return;
      }

      // An address naming one of the platform's three tabs with no node chosen — the console search's entry and the
      // settings dialog's door among them — names the platform's link for the administrator, with no step; a member
      // opens none of the three, and the rule below lands them on the first tab they may (docs/web.md,
      // 「System and organisation」).
      if (
        asked !== undefined &&
        reader.value.administrator &&
        route.query[ORGANIZATION_KEY] === undefined &&
        personAsked.value === null &&
        platformOnlyTab(asked) !== null
      ) {
        void router.replace(organizationLinkAddress(PLATFORM_NODE, route.query, String(Array.isArray(asked) ? asked[0] : asked)));

        return;
      }

      if (asked !== undefined && reader.value.known && !list.some((one) => one.value === asked)) {
        void router.replace(organizationAddress(list[0]!.value, route.query));

        return;
      }

      // A link node chosen holds no company and no unit of one.
      if (link.value !== null) {
        if (route.query[UNIT_KEY] !== undefined) void router.replace(organizationLinkAddress(link.value, route.query));

        return;
      }

      if (company === undefined) return;

      const strayUnit = units !== null && askedUnit.value !== null && unit === null;

      if (route.query[ORGANIZATION_KEY] !== String(company) || strayUnit) {
        const { [UNIT_KEY]: _unit, ...rest } = route.query;

        void router.replace({ query: { ...(strayUnit ? rest : route.query), [ORGANIZATION_KEY]: String(company) } });
      }
    },
    { immediate: true }
  )
);

// The tab stands in the address, and moving to another is a step of the history that keeps the node chosen; the first
// is the node's own address.
function setTab(next: string): void {
  if (next === tabChosen.value) return;

  void router.push(organizationAddress(next, route.query));
}

// Choosing a node of the tree is a step of the history and stands in the address, so a shared link opens the same one:
// a company by its number, a unit by its own beside its company's, and a link node by its own key.
function choose(node: string | number): void {
  if (node === chosenNode.value || listed.value === null) return;

  if (node === PLATFORM_NODE || node === PERSON_NODE) {
    void router.push(organizationLinkAddress(node, route.query));

    return;
  }

  if (typeof node !== "number") return;

  const company = companyOfNode(listed.value, treeUnits.value ?? [], node);

  if (company !== null) void router.push(organizationNodeAddress(company, node === company ? null : node, route.query));
}

// The open tab's own create, which it names and opens itself; a tab with none leaves the row without the button.
const section = useTemplateRef<TabCreate & { treeDrop?: TreeDrop }>("section");
const addLabel = computed(() => section.value?.addLabel ?? null);
// What the open tab takes carried onto a unit of the tree, where it takes anything.
const treeDrop = computed(() => section.value?.treeDrop ?? null);

// On a phone the tree's button shares the tab row with the tabs, and the button is drawn by the tree, so it is told
// there: it gives way to its own name, which reads whole in its tooltip when cut, and the tabs hold the rest.
const OPENER_GIVES_WAY = "[&_[data-choice-sidebar-open]]:min-w-0 [&_[data-choice-sidebar-open]]:max-w-[40%]";

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
  const shown = link.value !== null ? tab.value.links?.[link.value] : load;
  const key = link.value !== null ? `${link.value}:${value}` : value;

  if (shown === undefined) return null;
  if (!components.has(key)) components.set(key, defineAsyncComponent(shown));

  return components.get(key)!;
});


// --- A new company, the administrator's from the list's head ---

const adding = ref(false);
const addBusy = ref(false);
const addFailure = ref("");
const draft = reactive({ name: "" });
const addChanges = useOpenedWith(() => draft, { open: adding });

function openAdd(): void {
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
