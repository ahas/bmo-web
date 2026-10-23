<!-- A group of HardwareMeter rows (docs/web.md, 「Monitor screen」). Where the group has the
     room, a row is one line: the names in a column as wide as the longest — giving way first when
     the room runs short — the bars taking what is left, the figures in a column of their own and,
     where the group has any figure with a whole, the share after them in one more. Where it has
     not, a row is two: the name, the figure and the share on the first, the bar across the second.
     Either way every row's parts line up down the group. -->
<template>
  <div class="@container">
    <dl class="grid gap-x-3 gap-y-2 text-sm" :class="shares ? 'grid-cols-[minmax(0,1fr)_max-content_max-content] @sm:grid-cols-[minmax(0,max-content)_minmax(3rem,1fr)_max-content_max-content]' : 'grid-cols-[minmax(0,1fr)_max-content] @sm:grid-cols-[minmax(0,max-content)_minmax(3rem,1fr)_max-content]'">
      <slot />
    </dl>
  </div>
</template>

<script setup lang="ts">
import { HARDWARE_METER_SHARES } from "~/domain/hardware";

const props = withDefaults(defineProps<{ shares?: boolean }>(), { shares: false });

provide(HARDWARE_METER_SHARES, toRef(props, "shares"));
</script>
