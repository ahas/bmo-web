<!-- The logs tab's list (docs/web.md, 「Monitor's logs tab」): the lines the machine's background units wrote, the
     newest first, each with the time it was written, its unit and its words, masked by the server. Older lines are
     read as the reader scrolls to the foot, and new ones come in on top while the tab stands. The list fills the
     panel edge to edge, its rows sharing the columns of the time and the unit. -->
<template>
  <div class="flex min-h-full flex-col" data-monitor-logs>
    <ContentSkeleton v-if="lines === null" :rows="12" listClass="flex flex-col" :label="$t('monitor_logs.status.loading')">
      <div class="flex flex-col gap-1 px-4 py-1.5 sm:flex-row sm:gap-3">
        <SkeletonLine width="w-36 shrink-0" />
        <SkeletonLine width="w-4/5" />
      </div>
    </ContentSkeleton>

    <p v-else-if="failed && lines.length === 0" class="px-4 py-3 text-sm text-error">{{ $t("monitor_logs.error.read_failed") }}</p>

    <BodyLine v-else-if="lines.length === 0 && next === null">{{ logFiltered(filter) ? $t("monitor_logs.status.empty_found") : $t("monitor_logs.status.empty") }}</BodyLine>

    <template v-else>
      <div role="list" :aria-label="$t('monitor_logs.aria.list')" class="font-mono text-sm sm:grid sm:grid-cols-[max-content_max-content_minmax(0,1fr)]">
        <div v-for="line in lines" :key="line.id" role="listitem" class="flex flex-col px-4 py-1.5 sm:contents" :data-log-level="line.level">
          <div class="flex min-w-0 items-center gap-3 sm:contents">
            <span class="shrink-0 tabular-nums sm:py-1.5 sm:ps-4" :class="toneOf(line)">{{ stampOf(line) }}</span>
            <span class="min-w-0 truncate sm:py-1.5 sm:ps-3" :class="toneOf(line)" :title="line.unit"><SearchText :text="line.unit" :query="filter.query" /></span>
          </div>
          <span class="min-w-0 whitespace-pre-wrap text-default [overflow-wrap:anywhere] sm:py-1.5 sm:ps-3 sm:pe-4"><SearchText :text="line.text" :query="filter.query" /></span>
        </div>
      </div>

      <p v-if="failed" class="px-4 py-3 text-sm text-error">{{ $t("monitor_logs.error.read_failed") }}</p>

      <!-- The foot: coming into view asks for the next page, and while one comes a few rows of skeleton stand here. -->
      <div v-if="next !== null" ref="foot">
        <ContentSkeleton :rows="3" listClass="flex flex-col" :label="$t('monitor_logs.status.loading')">
          <div class="flex flex-col gap-1 px-4 py-1.5 sm:flex-row sm:gap-3">
            <SkeletonLine width="w-36 shrink-0" />
            <SkeletonLine width="w-4/5" />
          </div>
        </ContentSkeleton>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { formatStamp } from "bmo-ui/app/domain/time";

import { useMonitorLogFilter } from "~/domain/monitor-logs";
import { usePolling } from "~/domain/polling";
import { logFiltered, logFilterQuery, MONITOR_LOGS_POLL_MS, MONITOR_LOGS_URL } from "#shared/monitor-logs";

import type { LogFilter, LogLine, LogPage } from "#shared/monitor-logs";

const { filter } = useMonitorLogFilter();

// Null until the first page lands.
const lines = ref<LogLine[] | null>(null);
// Where older lines are read on from; null once the journal's start is reached.
const next = ref<string | null>(null);
// The newest entry read, which new lines are read after.
const head = ref<string | null>(null);
const failed = ref(false);
const foot = useTemplateRef<HTMLElement>("foot");

// Each read belongs to the filter it was asked under; one that lands after the filter changed is dropped.
let generation = 0;
let reading = false;

function stampOf(line: LogLine): string {
  return formatStamp(Math.floor(line.at / 1000));
}

function toneOf(line: LogLine): string {
  if (line.level === "error") return "text-error";

  return line.level === "warning" ? "text-warning" : "text-muted";
}

async function ask(asked: LogFilter, cursor: Record<string, string>): Promise<LogPage> {
  return $fetch<LogPage>(MONITOR_LOGS_URL, { query: { ...logFilterQuery(asked), ...cursor } });
}

async function readFirst(): Promise<void> {
  const mine = ++generation;
  const asked = filter.value;

  reading = true;
  lines.value = null;
  next.value = null;
  head.value = null;
  failed.value = false;

  try {
    const page = await ask(asked, {});

    if (mine !== generation) return;

    lines.value = page.lines;
    next.value = page.next;
    head.value = page.head;
  } catch {
    if (mine !== generation) return;

    lines.value = [];
    failed.value = true;
  } finally {
    if (mine === generation) reading = false;
  }
}

async function readOlder(): Promise<void> {
  if (reading || lines.value === null || next.value === null) return;

  const mine = generation;

  reading = true;

  try {
    const page = await ask(filter.value, { before: next.value });

    if (mine !== generation) return;

    lines.value = [...lines.value, ...page.lines];
    next.value = page.next;
    failed.value = false;
  } catch {
    if (mine === generation) failed.value = true;
  } finally {
    if (mine === generation) reading = false;
  }
}

async function readNewer(): Promise<void> {
  if (reading || lines.value === null || head.value === null || document.visibilityState !== "visible") return;

  const mine = generation;

  reading = true;

  try {
    const page = await ask(filter.value, { after: head.value });

    if (mine !== generation) return;

    if (page.gap) {
      reading = false;
      await readFirst();

      return;
    }

    if (page.lines.length > 0) lines.value = [...page.lines, ...lines.value];
    head.value = page.head;
  } catch {
    // A missed read of new lines is asked again on the next tick; the lines held stand.
  } finally {
    if (mine === generation) reading = false;
  }
}

// The foot coming into view asks for the next page, a page ahead of the end, so it is coming as the reader nears it.
let watcher: IntersectionObserver | null = null;

watch(foot, (element) => {
  watcher?.disconnect();
  watcher = null;

  if (element === null) return;

  watcher = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) void readOlder();
  }, { rootMargin: "400px" });
  watcher.observe(element);
});

// A page that leaves the foot in view asks for the one after it, until the foot leaves the view or the start is read.
watch(lines, async () => {
  await nextTick();

  const element = foot.value;

  if (element === null || reading) return;

  const box = element.getBoundingClientRect();

  if (box.top < window.innerHeight + 400) void readOlder();
});

onBeforeUnmount(() => watcher?.disconnect());

watch(() => JSON.stringify(logFilterQuery(filter.value)), () => void readFirst());

onMounted(() => void readFirst());

usePolling(() => void readNewer(), MONITOR_LOGS_POLL_MS);
</script>
