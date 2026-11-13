<template>
  <!-- The organisation settings screen (docs/web.md, 「Organisation settings」): what is set for the whole deployment
       or for other people, a tab to a section. The tab row stands under the title bar with the open tab's own add
       at its right end where it has one, the row's grey icon at every width; the tab's content scrolls in the body,
       in a reading column at the screen's left. -->
  <UDashboardPanel id="organization" :ui="{ body: 'p-0 sm:p-0 gap-0 [&>*]:max-w-none' }">
    <template #header>
      <ConsoleTitleBar :title="$t('screens.label.organization')" icon="i-material-symbols-domain" />

      <div :class="['flex h-12 shrink-0 items-center gap-2 ps-2 pe-4 sm:ps-4', TAB_ROW_LINE]">
        <UTabs
          :model-value="tab.value"
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
    </template>

    <template #body>
      <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto" data-organization-body>
        <div class="flex w-full min-w-0 flex-1 flex-col px-4 py-4 sm:px-6" :class="tab.wide ? '' : 'max-w-3xl'">
          <component :is="tabComponent" ref="section" />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { TAB_ROW_LINE, TAB_ROW_UI } from "bmo-ui/app/domain/tabs";

import { useAdministrator } from "~/domain/access";
import { ORGANIZATION_TABS, organizationAddress, organizationMovedAway, organizationTabOf, organizationTabsFor } from "~/domain/organization";
import { TAB_ADD_ICON } from "~/domain/tab-create";

import type { TabCreate } from "~/domain/tab-create";
import type { Component } from "vue";

// A member opens it for invitations where they head a unit; the tab says so where they head none (docs/web.md,
// 「Organisation
// settings」).
definePageMeta({ member: true });

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const administrator = useAdministrator();

const tabs = computed(() => organizationTabsFor(administrator.value));
const tab = computed(() => organizationTabOf(route.query.tab ?? ORGANIZATION_TABS[0]!.value, tabs.value));
const tabItems = computed(() => tabs.value.map((one) => ({ value: one.value, icon: one.icon, label: t(one.label) })));

// An address naming a tab that moved away is taken to where its section stands now, and one naming a tab the reader
// may not open to the first one they may, each with no step of the history.
watch(
  tabs,
  (list) => {
    if (!import.meta.client) return;

    const asked = route.query.tab;
    const moved = organizationMovedAway(asked);

    if (moved !== null) {
      void router.replace(moved);

      return;
    }

    if (asked === undefined || list.some((one) => one.value === asked)) return;

    void router.replace(organizationAddress(list[0]!.value, route.query));
  },
  { immediate: true }
);

// The tab stands in the address, and moving to another is a step of the history; the first is the screen's own.
function setTab(next: string): void {
  if (next === tab.value.value) return;

  void router.push(organizationAddress(next, route.query));
}

// Each tab's component, made once and loaded the first time it is opened.
const components = new Map<string, Component>();
const tabComponent = computed(() => {
  const { value, load } = tab.value;

  if (!components.has(value)) components.set(value, defineAsyncComponent(load));

  return components.get(value)!;
});

// The open tab's own create, which it names and opens itself; a tab with none leaves the row without the button.
const section = useTemplateRef<TabCreate>("section");
const addLabel = computed(() => section.value?.addLabel ?? null);
</script>
