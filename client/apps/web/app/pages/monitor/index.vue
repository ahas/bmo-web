<!-- The Monitor screen (docs/web.md, 「Monitor screen」): Devices, every machine's hardware, and
     Services, the card arbiter's board, a tab each under the title bar. The tab stands in the address, so a link opens
     it and moving between them is a step of the history; only the open tab reads anything. -->
<template>
  <UDashboardPanel id="monitor" :ui="{ body: '[&>*]:max-w-none' }">
    <template #header>
      <UDashboardNavbar :title="$t('screens.label.monitor')" icon="i-material-symbols-monitor-heart-outline">
        <template #right>
          <DeployMark />
          <TodoOpenButton />
          <UsageMeters />
        </template>
      </UDashboardNavbar>

      <div :class="['flex h-12 shrink-0 items-center sm:ps-4 sm:pe-4', TAB_ROW_LINE]">
        <UTabs
          :model-value="tab"
          :items="tabItems"
          :content="false"
          color="neutral"
          variant="link"
          size="sm"
          class="min-w-0 flex-1 self-stretch"
          :ui="TAB_ROW_UI"
          :aria-label="$t('hardware.aria.monitor_tabs')"
          @update:model-value="(value: string | number) => setTab(String(value))"
        />
      </div>
    </template>

    <template #body>
      <MonitorDevices v-if="tab === 'devices'" />
      <CardsArbiter v-else />
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { isMonitorTab, MONITOR_TABS } from "~/domain/hardware";
import { TAB_ROW_LINE, TAB_ROW_UI } from "bmo-ui/app/domain/tabs";

import type { MonitorTab } from "~/domain/hardware";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const tab = computed<MonitorTab>(() => (isMonitorTab(route.query.tab) ? route.query.tab : "devices"));
const tabItems = MONITOR_TABS.map((one) => ({ ...one, label: t(one.label) }));

function setTab(next: string): void {
  if (!isMonitorTab(next) || next === tab.value) return;

  void router.push({ query: { ...route.query, tab: next === MONITOR_TABS[0].value ? undefined : next } });
}
</script>
