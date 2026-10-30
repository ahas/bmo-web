<template>
  <!-- An item's research run in a sheet over the queue (docs/web.md, 「Research screen」): its facts, the question it
       was asked and its log oldest first, read again on a clock while the run has not closed. -->
  <USlideover v-model:open="open" :title="props.title" :description="$t('research.title.run')">
    <template #close="{ ui }">
      <ShellClose :class="ui.close()" @close="open = false" />
    </template>

    <template #body>
      <div class="flex min-w-0 flex-col gap-4">
        <ReadFailure :failure="readFailure" :message="failureText(failure, $t('research.error.run_read_failed'))" :reading="reading" @retry="void read()" />

        <SkeletonStatus v-if="detail === null && failure === null" as="div" class="flex flex-col gap-1" :label="$t('research.status.run_loading')">
          <SkeletonLine v-for="n in 6" :key="n" :width="n % 2 === 0 ? 'w-2/3' : 'w-1/2'" />
        </SkeletonStatus>

        <template v-if="detail !== null">
          <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
            <template v-for="fact in facts" :key="fact.label">
              <dt class="text-muted">{{ fact.label }}</dt>
              <dd class="min-w-0 break-words tabular-nums text-highlighted">{{ fact.value }}</dd>
            </template>

            <template v-if="documentLink !== null">
              <dt class="text-muted">{{ $t("research.label.document") }}</dt>
              <dd class="min-w-0">
                <a :href="documentLink" target="_blank" rel="noopener noreferrer" class="break-all text-primary underline-offset-2 hover:underline">
                  {{ documentLink }}<span class="sr-only"> {{ $t("common.aria.opens_new_tab") }}</span>
                </a>
              </dd>
            </template>

            <template v-if="detail.run.error !== null">
              <dt class="text-muted">{{ $t("research.label.run_error") }}</dt>
              <dd class="min-w-0 break-words text-error">{{ detail.run.error }}</dd>
            </template>
          </dl>

          <section class="flex min-w-0 flex-col gap-1" aria-labelledby="research-run-query">
            <h3 id="research-run-query" class="text-sm font-semibold text-highlighted">{{ $t("research.label.query") }}</h3>
            <p class="whitespace-pre-wrap break-words rounded-md bg-elevated p-3 text-sm text-toned">{{ detail.run.query }}</p>
          </section>

          <section class="flex min-w-0 flex-col gap-2" :aria-label="$t('research.aria.log')">
            <p v-if="detail.lines.length === 0" class="text-sm text-muted">{{ $t("research.status.no_log") }}</p>

            <ol v-else class="flex flex-col gap-2">
              <li v-for="line in detail.lines" :key="line.id" class="flex min-w-0 flex-col gap-1 border-b border-default pb-2 last:border-b-0">
                <div class="flex items-center gap-2">
                  <span class="text-xs tabular-nums text-muted">{{ formatTime(toUnixSeconds(line.at)) }}</span>
                  <UBadge :color="logKindLook($t, line.kind).color" variant="subtle" size="sm" :label="logKindLook($t, line.kind).label" />
                </div>
                <p class="whitespace-pre-wrap break-words text-sm text-toned">{{ line.text }}</p>
              </li>
            </ol>
          </section>
        </template>
      </div>
    </template>
  </USlideover>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { countText } from "bmo-ui/app/domain/numbers";
import { formatStamp, formatTime, toUnixSeconds } from "bmo-ui/app/domain/time";
import { useReadFailure } from "~/domain/events";
import { usePolling } from "~/domain/polling";
import { logKindLook, openableAddress, outcomeLabel, profileLabel, runOpen, runStateLabel } from "~/domain/research";

import type { ResearchRunDetail } from "#shared/research";

const props = defineProps<{
  // The research run the sheet shows, null where none is chosen.
  runId: number | null;
  // The item the run was asked for, the sheet's title.
  title: string;
}>();

const open = defineModel<boolean>("open", { required: true });

const { t } = useI18n();

// How often an open run and its log are read again while the run has not closed.
const POLL_MS = 3_000;

const detail = ref<ResearchRunDetail | null>(null);
const failure = ref<unknown>(null);
const reading = ref(false);
// Which read is the latest, so an answer for a run since replaced is dropped.
let latest = 0;

const readFailure = useReadFailure({ failed: () => failure.value !== null, reading: () => reading.value, reread: () => void read() });

async function read(): Promise<void> {
  const runId = props.runId;

  if (runId === null) return;

  const asked = ++latest;

  reading.value = true;

  try {
    const answered = await $fetch<ResearchRunDetail>(`/api/research/runs/${runId}`);

    if (asked !== latest) return;

    detail.value = answered;
    failure.value = null;
  } catch (error) {
    if (asked === latest) failure.value = error;
  } finally {
    if (asked === latest) reading.value = false;
  }
}

// A run opened is read afresh, its place held until the answer lands.
watch([open, () => props.runId], ([opened]) => {
  if (!opened) return;

  detail.value = null;
  failure.value = null;
  void read();
}, { immediate: true });

usePolling(() => {
  if (open.value && document.visibilityState === "visible" && !reading.value && (detail.value === null || runOpen(detail.value.run.state))) void read();
}, POLL_MS);

const documentLink = computed(() => openableAddress(detail.value?.run.link ?? null));

const facts = computed(() => {
  const run = detail.value?.run;

  if (run === undefined) return [];

  const stamp = (at: number | null) => (at === null ? "—" : formatStamp(toUnixSeconds(at)));

  return [
    { label: t("research.label.depth"), value: profileLabel(t, run.key) },
    { label: t("research.label.state"), value: runStateLabel(t, run.state) },
    ...(run.outcome === null ? [] : [{ label: t("research.label.outcome"), value: outcomeLabel(t, run.outcome) }]),
    { label: t("research.label.road"), value: `${run.provider} · ${run.model}` },
    { label: t("research.label.started"), value: stamp(run.startedAt) },
    { label: t("research.label.closes"), value: stamp(run.closesAt) },
    { label: t("research.label.finished"), value: stamp(run.finishedAt) },
    { label: t("research.label.branches"), value: countText(run.branches) }
  ];
});
</script>
