<!-- One figure of a piece of hardware as a row of its group (docs/web.md, 「Monitor screen」 and
     「Units」): its name, a bar where the figure is a share of a whole, the figure in its own unit,
     and after it the share, where the figure has a whole or is a share itself — a use has only the
     share. It stands in a HardwareMeters grid, so
     every row's bar, figure and share line up down the group; a figure with no whole keeps the bar's
     and the share's places empty. Where the group is narrow the bar takes a line of its own under
     the rest. The figure and the share keep the width of the widest each reaches, so a reading
     never moves the bar or the name beside it. A figure with steps of colour says them in a tooltip
     on its name (docs/web.md, 「Monitor screen」); one with none — a use — has a bar in the quiet
     colour. -->
<template>
  <div class="col-span-full grid grid-cols-subgrid items-center @max-sm:gap-y-1">
    <dt class="col-start-1 row-start-1 max-w-48 min-w-0 text-muted">
      <UTooltip v-if="criteria" :text="criteria">
        <span class="block cursor-help truncate underline decoration-dotted underline-offset-4" tabindex="0">{{ label }}</span>
      </UTooltip>
      <span v-else class="block truncate" :title="label">{{ label }}</span>
    </dt>
    <dd class="contents">
      <UProgress v-if="share !== null" class="col-span-full row-start-2 @sm:col-span-1 @sm:col-start-2 @sm:row-start-1" :model-value="Math.round(Math.min(1, share) * 1000) / 10" :max="100" size="sm" :ui="{ indicator: heatClasses(heat).bar }" aria-hidden="true" />
      <span class="col-start-2 row-start-1 text-right whitespace-nowrap @sm:col-start-3" :class="tone ?? ''"><SteadyFigure :widest="widest">{{ value }}</SteadyFigure></span>
      <span v-if="shares" class="col-start-3 row-start-1 text-right whitespace-nowrap text-muted @sm:col-start-4"><SteadyFigure :widest="SHARE_WIDEST">{{ shareText }}</SteadyFigure></span>
    </dd>
  </div>
</template>

<script setup lang="ts">
import { HARDWARE_METER_SHARES, heatClasses, UNREAD } from "~/domain/hardware";

import type { Heat } from "~/domain/hardware";

// Beside the figure, its widest form, which its owner names (docs/web.md, 「Fonts」), and the steps its
// colour stands on, said in a tooltip on its name; none where it has no steps.
const props = withDefaults(defineProps<{ label: string; value?: string; widest?: string; share?: number | null; heat?: Heat | null; criteria?: string | null; tone?: string | null; percent?: boolean }>(), { value: "", widest: "", share: null, heat: null, criteria: null, tone: null, percent: false });

// A share reads widest whole; one past it, a power over its limit, still has three places.
const SHARE_WIDEST = "100%";

const shares = inject(HARDWARE_METER_SHARES, ref(false));
const { t } = useI18n();

// A row that is only its share — a use — says it was not read where the share would stand.
const shareText = computed(() => {
  if (!props.percent) return "";
  if (props.share !== null) return `${Math.round(props.share * 100)}%`;

  return props.value === "" ? t(UNREAD) : "";
});
</script>
