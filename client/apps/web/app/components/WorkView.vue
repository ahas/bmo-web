<template>
  <!-- The work view (docs/web.md, 「The work view」 under 「Agent screen」): a worker's screen, the agent log dialog and
       the co-work stage dialog are this one view, opened from different places. A compact head that stays in view
       however far the log is scrolled — the job line, what the session is doing now and the work order on one line,
       spread on a press — over the stages, what the job left and the log. -->
  <!-- It never shrinks to the box it scrolls in: squeezed by a column of flex items, as a page's body is, its log would
       run past its foot and the head, held only inside the view, would scroll away with the lines. -->
  <div class="flex min-h-full shrink-0 flex-col">
    <!-- The head paints the one pixel above itself in its own background: a sticky box lands on a fraction of a pixel at
         some zooms, and without it the lines scrolling under the head show through a seam between the head and the
         bar above it. -->
    <div v-if="hasHead" class="sticky top-0 z-10 flex flex-col gap-2 border-b border-default bg-default px-4 py-3 shadow-[0_-1px_0_0_var(--ui-bg)] sm:px-6" data-work-head>
      <!-- The job: its item, its state, how long, how many calls and the tokens, read off the log while it runs. -->
      <p v-if="view !== null" class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted tabular-nums" data-work-figures>
        <UIcon
          :name="running ? 'i-material-symbols-progress-activity' : 'i-material-symbols-check-circle-outline'"
          class="size-4 shrink-0"
          :class="running ? 'animate-spin text-primary motion-reduce:animate-none' : 'text-success'"
          :aria-label="running ? $t('agents.status.job_running') : $t('agents.status.job_ended')"
          role="img"
        />
        <ItemTip v-if="view.todoId !== null" :id="view.todoId" press class="flex min-w-0 items-center gap-2">
          <span class="shrink-0 tabular-nums text-highlighted">#{{ view.todoId }}</span>
          <span class="min-w-0 truncate text-default">{{ view.title }}</span>
        </ItemTip>
        <span v-else class="min-w-0 truncate text-default">{{ view.title }}</span>
        <span>{{ view.time }}</span>
        <span aria-hidden="true">·</span>
        <span data-work-calls>{{ calls }}</span>
        <span aria-hidden="true">·</span>
        <UTooltip :text="$t(CHIP_LABELS.tokens)">
          <span class="flex items-center gap-1" data-work-tokens>
            <UIcon :name="CHIP_ICONS.tokens" class="size-4 shrink-0" />
            {{ tokens }}
          </span>
        </UTooltip>
        <template v-if="contextShare !== null">
          <span aria-hidden="true">·</span>
          <UTooltip :text="$t(CHIP_LABELS.context)">
            <span class="flex items-center gap-1" data-work-context>
              <UIcon :name="CHIP_ICONS.context" class="size-4 shrink-0" />
              {{ contextShare }}
            </span>
          </UTooltip>
        </template>
      </p>

      <!-- What the session is doing now, while it runs: the current stage's own words, or the newest call it described. -->
      <p v-if="running && now !== ''" class="flex min-w-0 items-center gap-2 text-sm" data-work-now>
        <span class="shrink-0 text-muted">{{ $t("agents.title.work_now") }}</span>
        <span class="min-w-0 truncate text-highlighted">{{ now }}</span>
      </p>

      <!-- The work order on one line, spread whole on a press with the English its worker was handed and every
           model's share. -->
      <section v-if="$slots.order || job !== null" class="flex min-w-0 flex-col gap-1" data-work-order>
        <button
          type="button"
          class="-mx-1 flex min-w-0 items-center gap-2 rounded-sm px-1 text-start text-sm hover:bg-elevated active:bg-accented"
          :aria-expanded="orderOpen"
          data-work-order-toggle
          @click="orderOpen = !orderOpen"
        >
          <UIcon name="i-material-symbols-chevron-right" aria-hidden="true" class="size-4 shrink-0 text-dimmed transition-transform" :class="orderOpen ? 'rotate-90' : ''" />
          <span class="shrink-0 text-muted">{{ $t("agents.title.work_order") }}</span>
          <span v-if="!orderOpen && orderLine !== ''" class="min-w-0 truncate text-default">{{ orderLine }}</span>
          <SkeletonBar v-else-if="!orderOpen && !promptLoaded && $slots.order === undefined" class="h-4 min-w-0 flex-1" />
        </button>

        <div v-if="orderOpen" class="flex max-h-[40dvh] min-w-0 flex-col gap-2 overflow-y-auto overscroll-contain ps-6">
          <slot name="order">
            <SkeletonStatus v-if="!promptLoaded" as="div" :label="$t('common.status.loading')" class="flex flex-col gap-1">
              <SkeletonBar class="h-4 w-full" />
              <SkeletonBar class="h-4 w-2/3" />
            </SkeletonStatus>
            <p v-else-if="promptFailed" class="text-sm text-error">{{ $t("agents.error.job_prompt_failed") }}</p>
            <template v-else-if="prompt !== null">
              <p class="text-sm break-words whitespace-pre-wrap text-default">{{ prompt.text }}</p>
              <template v-if="prompt.english !== null">
                <p class="mt-1 text-sm text-muted">{{ $t("agents.label.job_prompt_english") }}</p>
                <p class="font-mono text-sm break-words whitespace-pre-wrap text-default">{{ prompt.english }}</p>
              </template>
            </template>
          </slot>

          <ul v-if="view !== null && view.models.length > 0" class="flex flex-col gap-2 text-sm">
            <li v-for="model in view.models" :key="model.model" class="flex flex-col gap-1">
              <span class="flex min-w-0 items-baseline gap-2">
                <UTooltip :text="model.whole" :disabled="model.whole === model.model">
                  <span class="min-w-0 truncate font-mono text-highlighted" data-job-model>{{ model.model }}</span>
                </UTooltip>
                <span class="ms-auto whitespace-nowrap text-muted tabular-nums">{{ model.total }}</span>
              </span>
              <UsageSplit :tally="model.tally" />
            </li>
          </ul>
        </div>
      </section>
    </div>

    <!-- The stages and what the job left, at the top of the body the log scrolls in. -->
    <div v-if="(props.stepper && stages.length > 0) || $slots.result" class="flex flex-col gap-4 px-4 pt-4 sm:px-6">
      <section v-if="props.stepper && stages.length > 0" class="flex min-w-0 flex-col gap-1" data-work-stages>
        <h3 class="text-sm font-medium text-muted">{{ $t("agents.title.work_stages") }}</h3>
        <StageStepper :stages="stages" :label="$t('agents.title.work_stages')" @open="openStage" />
      </section>

      <section v-if="$slots.result" class="flex min-w-0 flex-col gap-1" data-work-result>
        <h3 class="text-sm font-medium text-muted">{{ $t("agents.title.work_result") }}</h3>
        <slot name="result" />
      </section>
    </div>

    <AgentLogView ref="log" :name="props.agent" :place="props.place" :end="props.end" :live="props.live" :only="props.only" @rows="rows = $event" @lines="lines = $event" />

    <WorkTaskDialog
      v-if="order !== null && job?.todoId != null"
      v-model:open="taskOpen"
      :step="openedStep"
      :task-id="openedTask"
      :ended="order.ended ?? {}"
      :todo-id="job.todoId"
      :order-status="order.status"
      :agent="order.worker ?? props.agent"
      @changed="order = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { CHIP_ICONS, CHIP_LABELS } from "~/domain/chips";
import { jobLineView, useJobLine, useJobPrompt } from "~/domain/job-line";
import { useLiveRefresh } from "~/domain/events";
import { usePolling } from "~/domain/polling";
import { planStages } from "~/domain/stepper";
import { logFigures } from "~/domain/log";
import { countText } from "~/domain/numbers";
import { callDescription, planOf } from "~/domain/tool-view";
import { tokenText } from "~/domain/usage";
import { taskStageKey, workStages, workSteps } from "~/domain/workorder";

import type { AgentLogLine, RunProgress, WorkOrderView } from "#shared/types";
import type { LogPlace, LogRow } from "~/domain/log";
import type { Stage } from "~/domain/stepper";
import type { WorkStep } from "~/domain/workorder";

interface Props {
  agent: string;
  place?: LogPlace | null;
  live?: { chatId: number; progress: RunProgress | null }[];
  // One run's name, where the view stands at a co-work stage's run.
  only?: string | null;
  // The run whose job the view speaks of; the one the screen was opened at, else the worker's job now.
  run?: string | null;
  // Whether the view stands the stepper of the job's stages, which a stage's own view does not.
  stepper?: boolean;
  // Whether the view stands the job's own figures and work order, which a view of an agent with no jobs has none of.
  job?: boolean;
  // Whether the log opens at its end, the newest lines in view, whatever place it was opened at.
  end?: boolean;
}

const props = withDefaults(defineProps<Props>(), { place: null, live: () => [], only: null, run: null, stepper: false, job: true, end: false });
const { t } = useI18n();
const slots = useSlots();

// The screen's own clock, in seconds, which a running job's time and a running stage's counter move with.
const clock = ref(Math.floor(Date.now() / 1000));

usePolling(() => {
  clock.value = Math.floor(Date.now() / 1000);
}, 1000);

// The job this view speaks of, by its number where the screen was opened at one: the number is what its log, its
// line and its prompt are read by, whatever name the screen was opened under.
const jobId = computed<number | null>(() => (props.place !== null && "job" in props.place ? props.place.job ?? null : null));
const jobRun = computed(() => props.run ?? props.only);
// Read again every few seconds, so a running job's tool calls and tokens move as they happen.
const { job: jobRead } = useJobLine(props.agent, jobRun, 3000, jobId);
// A stage's view speaks of that stage's own run alone, never of whatever its worker runs now.
const job = computed(() => (props.job && (props.only === null || jobRead.value?.run === props.only) ? jobRead.value : null));
const view = computed(() => (job.value === null ? null : jobLineView(t, job.value, clock.value)));
const running = computed(() => job.value !== null && job.value.finishedAt === null);

// The job's prompt, read once the job is known; a stage's view hands its own work order instead.
const promptRun = computed(() => (slots.order === undefined && job.value !== null ? job.value.run : null));
const { prompt, loaded: promptLoaded, failed: promptFailed } = useJobPrompt(props.agent, promptRun, ref(true), jobId);

const rows = ref<LogRow[]>([]);
const lines = ref<AgentLogLine[]>([]);

// What the job's log says it has done so far, which stands while the job runs and its own figures are not in yet.
const figures = computed(() => logFigures(lines.value, job.value?.run ?? jobRun.value));
const calls = computed(() => {
  if (view.value === null) return "";
  if (!running.value || figures.value.calls === 0) return view.value.tools;

  return t("agents.label.job_tools", { n: countText(Math.max(job.value?.tools ?? 0, figures.value.calls)) });
});
// While the job runs: the newest usage record its log holds, else what its run's requests have reported so far.
const tokens = computed(() => {
  const usage = figures.value.usage ?? job.value?.spent ?? null;

  if (view.value === null) return "";
  if (!running.value || usage === null) return view.value.written;

  return [
    usage.inputTokens === null ? null : t("agents.label.usage_input", { n: tokenText(usage.inputTokens) }),
    usage.outputTokens === null ? null : t("agents.label.usage_output", { n: tokenText(usage.outputTokens) }),
    usage.cacheReadTokens === null ? null : t("agents.label.usage_cache_read", { n: tokenText(usage.cacheReadTokens) })
  ]
    .filter((part) => part !== null)
    .join(" · ");
});
const contextShare = computed(() => {
  const context = figures.value.context;

  return running.value && context !== null ? `${Math.round((context.used / context.size) * 100)}%` : null;
});

// The work order on one line, until it is pressed open.
const orderOpen = ref(false);
const orderLine = computed(() => (prompt.value?.text ?? "").replace(/\s+/g, " ").trim());

// What the session is doing now: the stage under way by its own words, else its newest call by the description it
// came with, else the newest line it wrote; never a tool's or a stage's key.
const now = computed(() => {
  const stage = stages.value.flatMap((one) => [one, ...one.subs]).findLast((one) => one.state === "running");

  if (stage !== undefined) return stage.title;

  const newest = [...rows.value].reverse().find((row) => (row.line.kind === "tool" && callDescription(row.line.text) !== null) || row.line.kind === "text" || row.line.kind === "thinking");

  if (newest === undefined) return "";
  if (newest.line.kind === "tool") return callDescription(newest.line.text) ?? "";

  return newest.line.text.replace(/\s+/g, " ").trim().slice(0, 300);
});

// The co-work order of the item the job is a run of, read where the job names an item.
const order = ref<WorkOrderView | null>(null);

async function readOrder(): Promise<void> {
  const todo = job.value?.todoId ?? null;

  if (!props.stepper || todo === null) {
    order.value = null;

    return;
  }

  try {
    // An item with no work order is answered with no body, which reads as nothing at all.
    order.value = (await $fetch<WorkOrderView | null>(`/api/todos/${todo}/work-order`)) ?? null;
  } catch {
    return;
  }
}

watch(() => job.value?.todoId ?? null, () => void readOrder(), { immediate: true });
useLiveRefresh(() => void readOrder(), { on: ["work-order"], where: (event) => event.type === "work-order" && event.todoId === (job.value?.todoId ?? null) });

const steps = computed<WorkStep[]>(() => (order.value === null ? [] : workSteps(t, order.value)));

// The newest plan the session laid out with its plan tool, where it laid one.
const plan = computed(() => {
  for (const row of [...rows.value].reverse()) {
    if (row.line.kind !== "tool") continue;

    const steps = planOf(row.line.text);

    if (steps !== null) return { row, steps };
  }

  return null;
});

const stages = computed<Stage[]>(() => {
  if (steps.value.length > 0) return workStages(t, steps.value, order.value?.ended ?? {}, clock.value);

  return planStages(t, plan.value?.steps ?? [], props.agent);
});

const hasHead = computed(() => slots.order !== undefined || slots.result !== undefined || job.value !== null || (props.stepper && stages.value.length > 0));

// A co-work stage opens its dialog at its first task, a sub-stage at its own; a plan's step brings the call that laid
// the plan out into view, since the plan is this session's own work.
const taskOpen = ref(false);
const openedStep = ref<WorkStep | null>(null);
const openedTask = ref<string | null>(null);

function openStage(key: string): void {
  for (const step of steps.value) {
    const task = step.key === key ? step.tasks[0] : step.tasks.find((one) => taskStageKey(step, one) === key);

    if (task !== undefined) {
      openedStep.value = step;
      openedTask.value = task.id;
      taskOpen.value = true;

      return;
    }
  }

  if (plan.value !== null) document.querySelector(`[data-log-row="${plan.value.row.key}"]`)?.scrollIntoView({ block: "center" });
}

defineExpose({ follow: () => logView.value?.follow() });
const logView = useTemplateRef<{ follow: () => Promise<void> }>("log");
</script>
