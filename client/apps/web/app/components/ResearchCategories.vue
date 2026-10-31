<template>
  <!-- The research unit's categories (docs/web.md, 「Research screen」): whether the loop runs, with the one button
       that changes every category, then each category with its state, its figures with its stuck items, its road, the
       holds that name it and its own stop or resume. -->
  <section class="flex min-w-0 flex-col gap-3" aria-labelledby="research-categories-title">
    <div class="flex flex-wrap items-center gap-2">
      <h2 id="research-categories-title" class="text-base font-semibold text-highlighted">{{ $t("research.title.categories") }}</h2>

      <template v-if="props.view">
        <UBadge :color="loopRunning ? 'success' : 'neutral'" variant="subtle" size="sm" :label="$t(loopRunning ? 'research.label.loop_running' : 'research.label.loop_stopped')" />
        <span v-if="props.view.changedAt !== null" class="text-sm tabular-nums text-muted">
          {{ $t("research.label.loop_changed", { time: formatDayClock(toUnixSeconds(props.view.changedAt)) }) }}
        </span>
      </template>

      <UButton
        v-if="props.view && props.view.categories.length > 0"
        class="ms-auto"
        size="sm"
        color="neutral"
        variant="subtle"
        :icon="loopRunning ? 'i-material-symbols-pause-circle-outline' : 'i-material-symbols-play-circle-outline'"
        :label="$t(loopRunning ? 'research.action.stop_all' : 'research.action.resume_all')"
        :loading="props.changing === ALL"
        :disabled="props.changing !== null"
        @click="emit('change', null, loopRunning ? 'stopped' : 'running')"
      />
    </div>

    <SkeletonStatus v-if="!props.view" as="div" class="flex flex-col gap-3" :label="$t('research.status.state_loading')">
      <div v-for="n in 3" :key="n" class="rounded-md border border-default p-3">
        <SkeletonLine size="base" width="w-1/3" />
        <SkeletonLine width="w-2/3" />
        <SkeletonLine width="w-4/5" />
      </div>
    </SkeletonStatus>

    <p v-else-if="props.view.categories.length === 0" class="py-4 text-sm text-muted">{{ $t("research.status.no_categories") }}</p>

    <ul v-else class="flex flex-col gap-3">
      <li v-for="category in props.view.categories" :key="category.name" class="flex min-w-0 flex-col gap-1 rounded-md border border-default p-3">
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <span class="font-mono font-medium text-highlighted">{{ category.name }}</span>
          <UBadge :color="categoryStateLook($t, category.state).color" variant="subtle" size="sm" :label="categoryStateLook($t, category.state).label" />
          <UBadge v-if="holdsOf(props.view.holds, category.name).length > 0" color="warning" variant="subtle" size="sm" :label="$t('research.label.held')" />

          <UButton
            class="ms-auto"
            size="xs"
            color="neutral"
            variant="ghost"
            :icon="category.state === 'running' ? 'i-material-symbols-pause-circle-outline' : 'i-material-symbols-play-circle-outline'"
            :label="$t(category.state === 'running' ? 'research.action.stop' : 'research.action.resume')"
            :aria-label="$t(category.state === 'running' ? 'research.aria.stop_named' : 'research.aria.resume_named', { name: category.name })"
            :loading="props.changing === category.name"
            :disabled="props.changing !== null"
            @click="emit('change', category.name, category.state === 'running' ? 'stopped' : 'running')"
          />
        </div>

        <p class="break-words text-sm text-toned">{{ category.purpose }}</p>

        <p class="flex flex-wrap gap-x-3 gap-y-1 text-sm tabular-nums text-muted">
          <span>{{ shapeLabel($t, category.shape) }}</span>
          <span>{{ $t("research.label.cap_counts", { waiting: countText(category.waitingCount), running: countText(category.runningCount), cap: countText(category.cap) }) }}</span>
          <span :class="{ 'text-error': category.stuckCount > 0 }">{{ $t("research.label.stuck_count", { n: countText(category.stuckCount) }) }}</span>
          <span>{{ $t("research.label.cadence", { n: countText(category.cadenceMinutes) }) }}</span>
          <span v-if="category.gatherMinutes !== null">{{ $t("research.label.gather", { n: countText(category.gatherMinutes) }) }}</span>
          <span class="min-w-0 break-all" :class="{ 'font-mono': category.provider !== null || category.model !== null }">{{ roadText($t, category) }}</span>
        </p>

        <p
          v-for="hold in holdsOf(props.view.holds, category.name)"
          :key="`${hold.registration}-${hold.reason}`"
          class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-warning"
        >
          <UIcon name="i-material-symbols-warning-outline" class="size-4 shrink-0" />
          <span class="break-all font-mono">{{ hold.registration }}</span>
          <span>{{ holdReasonText($t, hold) }}</span>
          <span class="tabular-nums">{{ $t("research.label.hold_since", { time: formatDayClock(toUnixSeconds(hold.since)) }) }}</span>
          <span v-if="hold.reported">{{ $t("research.label.hold_reported") }}</span>
        </p>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { countText } from "bmo-ui/app/domain/numbers";
import { formatDayClock, toUnixSeconds } from "bmo-ui/app/domain/time";
import { categoryStateLook, holdReasonText, holdsOf, roadText, shapeLabel } from "~/domain/research";

import type { ResearchStateChange, ResearchStateView } from "#shared/research";

const props = defineProps<{
  // The state as the unit last answered it, null before the first answer.
  view: ResearchStateView | null;
  // The category whose change is going, `*` for every one at once, or null where none is.
  changing: string | null;
}>();

const emit = defineEmits<{ change: [categoryName: string | null, state: ResearchStateChange["state"]] }>();

const ALL = "*";

const loopRunning = computed(() => props.view?.state === "running");
</script>
