<!-- One machine's full hardware monitor (docs/web.md, 「Monitor screen」), read again every few
     seconds while it stands: a row of cards of one form — whatever the screen leads with, a node's
     connection card, beside the system card — then one card per piece of hardware — the CPU, memory,
     each GPU, the storage devices, the board — each with its own figures and its charts, and the
     services that failed. The system card carries the machine's live tracking switch, and a machine
     not tracked says so there and stands no hardware cards. A machine that cannot be read says so
     with what was met; a figure it did not answer is marked unreadable. It reads one machine for as long as
     it stands, so a screen that moves to another machine stands a new one. -->
<template>
  <div class="@container flex flex-col gap-4" data-machine-monitor>
    <!-- Half and half where the monitor has the room, one above the other where it has not; the
         system card alone takes the whole row. -->
    <div class="grid gap-4 @3xl:grid-cols-2">
      <slot name="lead" />

      <MonitorFacts
        :title="$t('hardware.title.system')"
        :facts="systemFacts"
        :loading="failure === null && hardware === null && !off"
        :loading-label="$t('hardware.status.system_loading')"
        :rows="6"
        :class="$slots.lead ? '' : '@3xl:col-span-2'"
      >
        <template #actions>
          <USwitch
            v-if="machine !== null"
            :model-value="tracking.on.value"
            :label="$t('hardware.title.live')"
            :aria-label="$t('hardware.label.tracking')"
            :loading="tracking.busy.value"
            :disabled="tracking.busy.value"
            @update:model-value="tracking.set($event as boolean)"
          />
          <SkeletonStatus v-else-if="failure === null" :label="$t('hardware.status.tracking_loading')" class="flex">
            <SkeletonBar class="h-5 w-20" />
          </SkeletonStatus>
        </template>

        <p v-if="tracking.failed.value !== null" role="alert" class="text-sm text-error">{{ tracking.failed.value }}</p>
        <p v-if="off" class="text-sm text-muted">{{ $t("hardware.status.tracking_off") }}</p>
        <p v-else-if="failure !== null" class="text-sm text-error">
          <span class="font-mono">{{ failure }}</span>
        </p>
      </MonitorFacts>
    </div>

    <!-- Laid out by the room the monitor has rather than by the window: wide, the CPU and the storage
         take the broader column and the smaller pieces stand beside them; middling, the two columns
         share the width; narrow, every piece stands in one column in the order it is read. -->
    <div v-if="failure === null && !off" class="flex flex-col gap-4 @3xl:grid @3xl:grid-cols-2 @3xl:items-start @6xl:grid-cols-12">
      <div class="contents @3xl:flex @3xl:flex-col @3xl:gap-4 @6xl:col-span-7">
        <HardwareCpu class="order-1 @3xl:order-none" :cpu="hardware?.cpu ?? null" :limit="cpuLimit" />
        <HardwareStorage class="order-4 @3xl:order-none" :storage="hardware?.storage ?? null" />
      </div>

      <div class="contents @3xl:flex @3xl:flex-col @3xl:gap-4 @6xl:col-span-5">
        <HardwareMemory class="order-2 @3xl:order-none" :memory="hardware?.memory ?? null" />
        <HardwareGpu v-for="gpu in gpus" :key="gpu.index" class="order-3 @3xl:order-none" :gpu="gpu" :title="gpus.length > 1 ? `GPU ${gpu.index}` : 'GPU'" />
        <HardwareBoard class="order-5 @3xl:order-none" :board="hardware?.board ?? null" :sensor-library="hardware?.sensorLibrary ?? null" />

        <MonitorCard v-if="(hardware?.services.failed?.length ?? 0) > 0" class="order-6 @3xl:order-none" :title="$t('hardware.label.failed_services')">
          <ul class="flex flex-col gap-2 text-sm">
            <li v-for="unit in hardware!.services.failed" :key="unit" class="flex items-center gap-2">
              <UIcon name="i-material-symbols-error-outline" class="size-4 shrink-0 text-error" />
              <span class="min-w-0 truncate font-mono">{{ unit }}</span>
            </li>
          </ul>
        </MonitorCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { HARDWARE_CHARTING, loadText, UNREAD, uptimeText, useHardwareCpuLimit, useHardwareRanges, useHardwareTracking, useMachineHardware } from "~/domain/hardware";
import { useInitialRead } from "bmo-ui/app/domain/loading";
import { countText } from "~/domain/numbers";

import type { MonitorFact } from "~/domain/hardware";
import type { HardwareView, MachineHardware } from "#shared/types";

const props = defineProps<{ url: string; historyUrl: string; liveUrl: string }>();
// Every reading as it lands, whether the last asking failed outright, and whether the node service answered the
// machine is none it knows, for a screen that names the machine by what its reading says.
const emit = defineEmits<{ read: [reading: MachineHardware | null, failed: boolean, missing: boolean] }>();
const { t } = useI18n();

const { machine, status, error, missing, live } = useMachineHardware(computed(() => props.url), { url: props.liveUrl, metrics: [] });

watch([machine, error, missing], ([reading, failed, gone]) => emit("read", reading, failed !== null, gone));
const hardware = computed<HardwareView | null>(() => machine.value?.hardware ?? null);
const failure = computed<string | null>(() => machine.value?.failure ?? error.value);
const gpus = computed(() => hardware.value?.gpus ?? []);
const off = computed(() => machine.value?.tracking === false);
const tracking = useHardwareTracking(t, machine);
const cpuLimit = useHardwareCpuLimit(t, machine);

provide(HARDWARE_CHARTING, {
  live,
  ranges: useHardwareRanges(computed(() => props.historyUrl)),
  loading: useInitialRead(status),
});

const systemFacts = computed<MonitorFact[]>(() => {
  const view = hardware.value;

  if (view === null) return [];

  const failed = view.services.failed;

  return [
    { label: "OS", value: view.os ?? t(UNREAD) },
    ...(view.wsl ? [{ label: "Windows", value: view.hostOs ?? t(UNREAD) }] : []),
    { label: t("hardware.label.kernel"), value: view.kernel ?? t(UNREAD), tone: "font-mono" },
    { label: t("hardware.label.host"), value: view.host ?? t(UNREAD), tone: "font-mono" },
    { label: t("hardware.label.uptime"), value: uptimeText(t, view.uptimeSeconds), tone: "tabular-nums" },
    { label: t("hardware.label.load"), value: loadText(t, view.load), tone: "tabular-nums" },
    { label: t("hardware.label.services"), value: view.services.running === null || failed === null ? t(UNREAD) : t("hardware.label.service_counts", { running: countText(view.services.running), failed: countText(failed.length) }), tone: failed !== null && failed.length > 0 ? "text-error" : "" },
  ];
});
</script>
