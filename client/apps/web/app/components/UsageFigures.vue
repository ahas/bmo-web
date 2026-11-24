<template>
  <!-- What one group has left (docs/web.md, 「Usage in the title bar」 and 「Administration」): each window as the share
       remaining with a bar and how long is left until it resets, the balance in its currency with how long ago it was
       read, and a request allowance as how many are left of the day's ceiling with a bar. The rows stand on shared
       columns, so the names read down one column, the bars start on one line and the figures end on one line; the
       balance, which has no whole, keeps the bar's place empty. Where the group is narrow each bar takes a line of its
       own under its row. A group the agency states neither windows nor a balance for says so in one line. -->
  <div class="@container/usage-figures" data-usage-figures>
    <dl class="grid grid-cols-[minmax(0,max-content)_minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-1 text-sm">
      <div v-for="window in props.group.windows" :key="window.name" class="col-span-full grid grid-cols-subgrid items-center gap-y-1" data-usage-window>
        <dt class="col-start-1 row-start-1 max-w-32 min-w-0 truncate text-muted">{{ windowLabel($t, window) }}</dt>
        <dd class="contents">
          <UProgress
            v-if="sharePercent(liveWindow(window, props.now)) !== null"
            class="col-span-full row-start-2 @md/usage-figures:col-span-1 @md/usage-figures:col-start-2 @md/usage-figures:row-start-1"
            :model-value="sharePercent(liveWindow(window, props.now))"
            :max="100"
            size="sm"
            :color="barColor(shareTone(liveWindow(window, props.now)))"
            aria-hidden="true"
          />
          <span class="col-start-4 row-start-1 text-right tabular-nums" :class="figureClass(shareTone(liveWindow(window, props.now)))">{{ shareText(liveWindow(window, props.now)) }}</span>
          <!-- How long is left of the window, not the hour it turns over at, standing before the figure it is read
               against so every row ends on its figure. More than a day out, the day it turns over on stands beside it, since that day is what
               tells one login's week from another's. The clock face is in the shared tooltip, for a reader who wants
               it. -->
          <HintTip as="span" :text="resetClock($t, window)" class="col-start-3 row-start-1 text-right tabular-nums whitespace-nowrap text-muted">
            {{ resetText($t, window, props.now) }}<template v-if="resetDay($t, window, props.now) !== ''"> · {{ resetDay($t, window, props.now) }}</template>
          </HintTip>
        </dd>
      </div>

      <!-- What a provider paid by the request or an endpoint account has left in money, and how long ago it was read. -->
      <div v-if="props.group.balance !== null" class="col-span-full grid grid-cols-subgrid items-center" data-usage-balance>
        <dt class="col-start-1 max-w-32 min-w-0 truncate text-muted">{{ $t("usage.label.balance") }}</dt>
        <dd class="contents">
          <span class="col-start-4 text-right tabular-nums whitespace-nowrap text-default">{{ moneyText(props.group.balance) }}</span>
          <span class="col-start-3 text-right tabular-nums whitespace-nowrap text-muted">{{ $t("usage.label.balance_seen", { wait: elapsedText($t, Math.max(0, props.now - props.group.balance.seenAt)) }) }}</span>
        </dd>
      </div>

      <!-- The request allowance read with the balance: what it covers, and how many are left of the day's ceiling. -->
      <div v-if="props.group.balance?.requests" class="col-span-full grid grid-cols-subgrid items-center gap-y-1" data-usage-requests>
        <dt class="col-start-1 row-start-1 max-w-32 min-w-0 truncate text-muted">{{ requestsLabel($t, props.group.balance.requests) }}</dt>
        <dd class="contents">
          <UProgress
            v-if="requestsPercent(props.group.balance.requests) !== null"
            class="col-span-full row-start-2 @md/usage-figures:col-span-1 @md/usage-figures:col-start-2 @md/usage-figures:row-start-1"
            :model-value="requestsPercent(props.group.balance.requests)"
            :max="100"
            size="sm"
            color="primary"
            aria-hidden="true"
          />
          <span class="col-start-4 row-start-1 text-right tabular-nums whitespace-nowrap text-default">{{ requestsText($t, props.group.balance.requests) }}</span>
        </dd>
      </div>
    </dl>

    <p v-if="props.group.windows.length === 0 && props.group.balance === null" class="text-sm text-muted">{{ $t("usage.status.no_info") }}</p>
  </div>
</template>

<script setup lang="ts">
import { elapsedText } from "bmo-ui/app/domain/time";

import { liveWindow, moneyText, requestsLabel, requestsPercent, requestsText, resetClock, resetDay, resetText, sharePercent, shareText, shareTone, toneClass, windowLabel } from "~/domain/usage";

import type { UsageGroup, UsageTone } from "~/domain/usage";

const props = defineProps<{
  group: UsageGroup;
  // The second the lengths are counted from.
  now: number;
}>();

// A figure reads in the body's own colour while its share is quiet, a step above the names beside it, and takes the
// share's own colour once it is worth a look.
function figureClass(tone: UsageTone): string {
  return tone === "muted" ? "text-default" : toneClass(tone);
}

// A bar fills in the accent while the share is quiet, and takes the share's own colour once it is worth a look.
function barColor(tone: UsageTone): "primary" | "warning" | "error" {
  return tone === "muted" ? "primary" : tone;
}
</script>
