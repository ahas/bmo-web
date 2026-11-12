<!-- The Monitor screen (docs/web.md, 「Monitor screen」): Devices, every machine's hardware, Services, the card arbiter's
     board, Role slots, the agency's slots, and for the administrator Logs, what the machine's background units wrote, a tab each under the title bar.
     The tab stands in the address, so a link opens it and moving between them is a step of the history; only the open
     tab reads anything. The logs tab's filters stand at the right end of the same row. -->
<template>
  <UDashboardPanel id="monitor" :ui="{ body: '[&>*]:max-w-none' }">
    <template #header>
      <ConsoleTitleBar :title="$t('screens.label.monitor')" icon="i-material-symbols-monitor-heart-outline" />

      <div :class="['flex h-12 shrink-0 items-center sm:ps-4 sm:pe-4', TAB_ROW_LINE]">
        <UTabs
          :model-value="tab"
          :items="tabItems"
          :content="false"
          color="neutral"
          variant="link"
          size="sm"
          class="min-w-0 flex-1 self-stretch overflow-x-auto [scrollbar-width:none]"
          :ui="TAB_ROW_UI"
          :aria-label="$t('hardware.aria.monitor_tabs')"
          @update:model-value="(value: string | number) => setTab(String(value))"
        />
        <MonitorLogFilters v-if="tab === 'logs'" class="shrink-0 ps-2 pe-2 sm:pe-0" />
      </div>
    </template>

    <template #body>
      <MonitorDevices v-if="tab === 'devices'" />
      <CardsArbiter v-else-if="tab === 'services'" />
      <RoleSlotsBoard v-else-if="tab === 'slots'" />
      <MonitorLogs v-else />
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { useAdministrator } from "~/domain/access";
import { isMonitorTab, MONITOR_ADMINISTRATOR_TAB, MONITOR_TABS } from "~/domain/hardware";
import { useNarrow } from "bmo-ui/app/domain/screen";
import { TAB_ROW_LINE, TAB_ROW_UI } from "bmo-ui/app/domain/tabs";

import type { MonitorTab } from "~/domain/hardware";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const administrator = useAdministrator();
// The logs tab is the administrator's alone: a member who opens its address stands on the first tab.
const shown = computed(() => MONITOR_TABS.filter((one) => administrator.value || one.value !== MONITOR_ADMINISTRATOR_TAB));
const tab = computed<MonitorTab>(() => {
  const asked = route.query.tab;

  return isMonitorTab(asked) && shown.value.some((one) => one.value === asked) ? asked : "devices";
});
// On a phone the names are what a reader picks a tab by, so the marks are what gives way.
const narrow = useNarrow();
const tabItems = computed(() => shown.value.map((one) => (narrow.value ? { value: one.value, label: t(one.label) } : { ...one, label: t(one.label) })));

function setTab(next: string): void {
  if (!isMonitorTab(next) || next === tab.value) return;

  // A tab's filters belong to it, so moving to another tab leaves them behind.
  void router.push({ query: { tab: next === MONITOR_TABS[0].value ? undefined : next } });
}
</script>
