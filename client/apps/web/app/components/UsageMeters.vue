<template>
  <UPopover :content="{ align: 'end' }" :ui="{ content: 'w-96 max-w-[calc(100vw-1rem)] flex flex-col gap-3 p-3' }">
    <!-- The two limit windows of the slot the chat runs on, or one honest dash for a provider with
         no limit, on every title bar and nothing else. One axis: a percentage is what a window is, and a count of
         tokens set beside one is read as though it were another percentage.
         A phone's bar has no room even for the two — the room's own name was being cut to fit
         them — so below that width they fold into the one mark that opens them, and the mark
         carries the louder of them in its colour: an icon standing in for a share at red says
         red. Everything they say is a press away either way, since the press is the same press
         that was always there.

         The letters here are the interface's own face, not a typewriter's: only the digits want
         a fixed width, and they get it from the figures being tabular rather than from dragging
         the Korean along into a monospace stack that has no Korean in it. -->
    <!-- On a phone it is an icon alone, named on hover like every icon button and as square as the
         bar's icon button. The login it stands for is named there too, since the folded mark has
         nowhere else to say it. -->
    <UTooltip :text="accountName === null ? $t('usage.title.remaining') : $t('usage.title.remaining_of', { name: accountName })" :disabled="!narrow">
      <button
        type="button"
        class="flex shrink-0 items-center gap-2 rounded-md p-1.5 text-sm tabular-nums transition-colors hover:bg-elevated active:bg-accented sm:shrink sm:px-2 sm:py-0.5"
        :aria-label="$t('usage.title.remaining')"
      >
        <UIcon name="i-material-symbols-speed" class="size-5 shrink-0 sm:hidden" :class="toneClass(loudest)" />

        <SkeletonStatus v-if="usageInitial" class="hidden sm:block" :label="$t('usage.status.loading')"><SkeletonBar class="h-4 w-32" /></SkeletonStatus>
        <span v-else class="hidden sm:contents">
          <!-- The slot the chat runs on, under its provider's name: the agency's answer, never the screen's pick. -->
          <template v-if="usage.active !== null">
            <span class="max-w-32 truncate text-sm text-muted">{{ slotName(usage.active) }}</span>
            <!-- Which login the two figures are of, where the agency holds more than one to tell apart.
                 Two logins report the same windows, each about its own limit, so a figure with no
                 login named is a figure about nobody. -->
            <template v-if="accountName !== null">
              <span class="text-muted">·</span>
              <span class="max-w-32 truncate text-sm text-muted">{{ accountName }}</span>
            </template>
            <span class="text-muted">·</span>
          </template>
          <!-- A provider with no login and no window has no limit to show, so it stands as its name and what it has
               left in money where the agency reads a balance, and one dash where it reads none, rather than as two
               windows it does not have. -->
          <template v-if="limitless(usage.active)">
            <span v-if="usage.active?.balance" class="tabular-nums text-muted"><span class="text-sm text-muted">{{ $t("usage.label.balance") }}</span> {{ moneyText(usage.active.balance) }}</span>
            <span v-else class="text-muted"><span class="text-sm text-muted">{{ $t("usage.title.remaining") }}</span> —</span>
          </template>
          <template v-else>
            <span :class="toneClass(shareTone(liveWindow(session, now)))">
              <span class="text-sm text-muted">{{ $t("usage.label.window_session") }}</span> {{ shareText(liveWindow(session, now)) }}
            </span>
            <span class="text-muted">·</span>
            <span :class="toneClass(shareTone(liveWindow(weekly, now)))">
              <span class="text-sm text-muted">{{ $t("usage.label.window_weekly") }}</span> {{ shareText(liveWindow(weekly, now)) }}
            </span>
          </template>
        </span>
      </button>
    </UTooltip>

    <template #content>
      <ReadFailure :failure="usageFailure" :message="usageFailureText" :reading="usageReading" @retry="rereadAll()" />
      <ContentSkeleton v-if="usageInitial" :rows="3" listClass="flex flex-col gap-3" :label="$t('usage.status.loading')">
        <div class="flex flex-col gap-1">
          <SkeletonLine width="w-24" />
          <SkeletonLine width="w-full" />
        </div>
      </ContentSkeleton>
      <div v-if="!usageInitial && (usageStatus === 'success' || usageLoaded)" class="flex flex-col gap-3">
        <div class="flex flex-col gap-2">
          <!-- Where these figures are settled: which logins the road walks, in what order and
               which of them are on. A mark standing on every screen leads to the page it is
               about, and this one is about the accounts. -->
          <div class="flex items-center justify-between gap-2">
            <p class="text-sm font-medium text-muted">{{ $t("usage.title.remaining") }}</p>
            <UButton
              to="/agents?tab=general"
              size="sm"
              color="neutral"
              variant="link"
              trailing-icon="i-material-symbols-chevron-right"
              :label="$t('usage.label.claude_accounts')"
            />
          </div>

          <!-- Every registered account as a group of its own, in the agency's order, whichever of them is
               serving: each login keeps its own limit, so each keeps its own figures, and the one the chat runs
               on now is marked. A slot on a provider with no login stands ahead of them, marked the same way. -->
          <div v-for="group in groups" :key="group.id" class="flex flex-col gap-1">
            <div class="flex min-w-0 items-center gap-2 text-sm">
              <span class="min-w-0 truncate font-medium text-muted">{{ slotName(group) }}<template v-if="group.name !== null"> · {{ group.name }}</template></span>
              <UBadge v-if="group.inUse" size="sm" color="primary" variant="subtle" :label="$t('usage.label.in_use')" class="shrink-0" />
            </div>

            <div v-for="window in group.windows" :key="window.name" class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span class="min-w-0 flex-1 basis-24 break-words text-dimmed">{{ windowLabel($t, window) }}</span>
              <span class="tabular-nums" :class="toneClass(shareTone(liveWindow(window, now)))">{{ shareText(liveWindow(window, now)) }}</span>
              <!-- How long is left of the window, not the hour it turns over at: the length is
                   what the figure beside it is read against. More than a day out, the day it
                   turns over on stands beside it, since that day is what tells one login's week
                   from another's. The clock face is kept on the row, for a reader who wants it. -->
              <span
                v-if="resetText($t, window, now) !== ''"
                class="ms-auto text-sm tabular-nums text-dimmed"
                :title="resetClock($t, window)"
              >
                {{ resetText($t, window, now) }}<template v-if="resetDay($t, window, now) !== ''"> · {{ resetDay($t, window, now) }}</template>
              </span>
            </div>

            <!-- What a provider paid by the request or an endpoint account has left in money, and how long ago it was
                 read. -->
            <div v-if="group.balance !== null" class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span class="min-w-0 flex-1 basis-24 break-words text-dimmed">{{ $t("usage.label.balance") }}</span>
              <span class="tabular-nums text-muted">{{ moneyText(group.balance) }}</span>
              <span class="ms-auto text-sm tabular-nums text-dimmed">{{ $t("usage.label.balance_seen", { wait: elapsedText($t, Math.max(0, now - group.balance.seenAt)) }) }}</span>
            </div>

            <!-- An account whose windows and balance the agency states none of says so, and no figure stands in their
                 place. -->
            <p v-if="group.windows.length === 0 && group.balance === null" class="text-sm text-dimmed">{{ $t("usage.status.no_info") }}</p>
          </div>

          <p v-if="groups.length === 0" class="text-sm text-dimmed">{{ $t("usage.status.no_accounts") }}</p>
        </div>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import { useInitialRead, useLastRead } from "bmo-ui/app/domain/loading";
import { failureText } from "bmo-ui/app/domain/errors";
import { elapsedText } from "bmo-ui/app/domain/time";
import { useReadFailure } from "~/domain/events";
import { useNarrow } from "bmo-ui/app/domain/screen";
import { usePolling } from "~/domain/polling";
import { modeLabel } from "~/domain/status";
import {
  emptyUsage,
  knownMode,
  limitless,
  liveWindow,
  loudestTone,
  moneyText,
  resetClock,
  resetDay,
  resetText,
  shareText,
  shareTone,
  titleAccountLabel,
  titleWindows,
  usageGroups,
  USAGE_REFRESH_MS,
  windowLabel
} from "~/domain/usage";

import type { FallbackView, UsageView } from "#shared/types";
import type { UsageTone } from "~/domain/usage";

const { t } = useI18n();
const narrow = useNarrow();

// The figures are the agency's, so the same numbers stand on every screen and every screen reads them from one
// place.
const { data, refresh, status: usageStatus, error: usageError } = useFetch<UsageView>("/api/usage", {
  key: "usage",
  lazy: true,
  server: false,
  default: emptyUsage
});

// The route chooser reads the fallback under this key, and a change made there reads it again; the slot the chat
// runs on may have moved with it, so the figures are read again at once rather than at the next minute.
const { data: fallbackShared } = useNuxtData<FallbackView>("fallback");

watch(fallbackShared, () => void refresh({ dedupe: "defer" }));

const usageInitial = useInitialRead(usageStatus);
const usageLoaded = ref(usageStatus.value === "success");
watch(usageStatus, value => { if (value === "success") usageLoaded.value = true; });
const usageReading = computed(() => usageStatus.value === "pending");
const usageFailureText = computed(() => failureText(usageError.value, t("usage.error.read_failed")));

// A failed read puts the fetch back to its empty default; what was read last stays on the screen through it, so a
// figure is never taken down for a read that did not happen.
const usageRead = useLastRead(data, usageStatus);
const usage = computed<UsageView>(() => usageRead.value ?? emptyUsage());

function rereadAll(): void {
  void refresh();
}

// Held where the title stands rather than in the popover, so the read the bot's return brings is
// made whether the popover is open or not.
const usageFailure = useReadFailure({
  failed: () => usageError.value !== undefined && usageError.value !== null,
  reading: () => usageReading.value,
  reread: rereadAll
});

// Each account as a group of its own, and the slot the chat runs on where it is no account.
const groups = computed(() => usageGroups(usage.value));

// Whose figures the title's are is the agency's answer: the provider the road answers on and the login it walks to
// now, not the head of the account order.
const accountName = computed(() => titleAccountLabel(usage.value.active));
const focusedWindows = computed(() => titleWindows(usage.value.active));
const session = computed(() => focusedWindows.value[0]);
const weekly = computed(() => focusedWindows.value[1]);

// What the folded mark reads as: the loudest of the two windows it stands for. Those two are the
// whole of the bar, so the mark stands for the whole of it.
const loudest = computed<UsageTone>(() => loudestTone([liveWindow(session.value, now.value), liveWindow(weekly.value, now.value)]));

// The second the lengths are counted from. It moves once a minute because that is the smallest
// unit those lengths are said in: a clock of its own ticking every second would redraw the rows
// sixty times for every word that changed.
const now = ref(Math.floor(Date.now() / 1000));

usePolling(() => {
  now.value = Math.floor(Date.now() / 1000);
  void refresh({ dedupe: "defer" });
}, USAGE_REFRESH_MS);

// A provider under this console's own name for it where it has one, and under the agency's label otherwise.
function slotName(slot: { provider: string; label: string }): string {
  const mode = knownMode(slot.provider);

  return mode === null ? slot.label : modeLabel(t, mode);
}

function toneClass(tone: UsageTone): string {
  if (tone === "error") {
    return "text-error";
  }

  return tone === "warning" ? "text-warning" : "text-muted";
}
</script>
