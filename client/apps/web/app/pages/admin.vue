<template>
  <!-- The administrator's screen (docs/web.md, 「Administration」): what is set for the platform itself, a tab to a
       section, laid out as the organisation screen is. The tab row stands under the title bar with the open tab's own add
       at its right end where it has one, the row's grey icon at every width, and the open tab scrolled into the row's
       view. A tab's content stands in a reading column centred in the body, the body's padding outside it, and the
       body scrolls; a tab laid across the whole body takes it unpadded and scrolls its own regions. -->
  <UDashboardPanel id="admin" :ui="{ body: 'p-0 sm:p-0 gap-0 [&>*]:max-w-none' }">
    <template #header>
      <ConsoleTitleBar :title="$t('screens.label.admin')" icon="i-material-symbols-shield-person-outline" />

      <div ref="tabRow" :class="['flex h-12 shrink-0 items-center gap-2 ps-2 pe-4 sm:ps-4', TAB_ROW_LINE]">
        <UTabs
          :model-value="tab.value"
          :items="tabItems"
          :content="false"
          color="neutral"
          variant="link"
          size="sm"
          class="min-w-0 flex-1 self-stretch"
          :ui="TAB_ROW_UI"
          :aria-label="$t('admin.aria.tabs')"
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
      <div v-if="tab.wide" class="flex min-h-0 min-w-0 flex-1 flex-col" data-admin-body>
        <component :is="tabComponent" ref="section" />
      </div>
      <div v-else class="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto p-4" data-admin-body>
        <div class="mx-auto flex w-full min-w-0 max-w-3xl flex-col" data-admin-column>
          <component :is="tabComponent" ref="section" />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { TAB_ROW_LINE, TAB_ROW_UI } from "bmo-ui/app/domain/tabs";

import { ADMIN_TABS, adminAddress, adminTabOf } from "~/domain/administration";
import { TAB_ADD_ICON } from "~/domain/tab-create";
import { revealOpenTab } from "~/domain/tab-row";

import type { TabCreate } from "~/domain/tab-create";
import type { Component } from "vue";

// The administrator's alone: no member opens it, and the console's guard takes a member home (docs/web.md,
// 「Administration」).

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const tab = computed(() => adminTabOf(route.query.tab));
const tabItems = computed(() => ADMIN_TABS.map((one) => ({ value: one.value, icon: one.icon, label: t(one.label) })));

// An address naming no tab is taken to the first, with no step of the history.
watch(
  () => route.query.tab,
  (asked) => {
    if (!import.meta.client || asked === undefined || ADMIN_TABS.some((one) => one.value === asked)) return;

    void router.replace(adminAddress(ADMIN_TABS[0]!.value, route.query));
  },
  { immediate: true }
);

// The tab stands in the address, and moving to another is a step of the history; the first is the screen's own.
function setTab(next: string): void {
  if (next === tab.value.value) return;

  void router.push(adminAddress(next, route.query));
}

// The open tab brought into the row's view as it changes and as the row first stands.
const tabRow = useTemplateRef<HTMLElement>("tabRow");

watch(
  () => [tab.value.value, tabRow.value] as const,
  () => void nextTick(() => revealOpenTab(tabRow.value)),
  { immediate: true, flush: "post" }
);

// Each tab's component, made once and loaded the first time it is opened.
const components = new Map<string, Component>();
const tabComponent = computed(() => {
  const { value, load } = tab.value;

  if (!components.has(value)) components.set(value, defineAsyncComponent(load));

  return components.get(value)!;
});

// The open tab's own create, which it names and opens itself.
const section = useTemplateRef<TabCreate>("section");
const addLabel = computed(() => section.value?.addLabel ?? null);
</script>
