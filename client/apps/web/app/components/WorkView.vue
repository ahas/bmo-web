<template>
  <!-- The work view (docs/web.md, 「The work view」 under 「Agent screen」): a worker's screen, the agent log dialog and
       the co-work stage dialog are this one view, opened from different places. The work order, what the session is
       doing now, what it has spent and called, its log and what it left, one under the other and none of it folded. -->
  <div class="flex min-h-full flex-col">
    <div v-if="hasHead" class="flex flex-col gap-4 px-4 pt-4 sm:px-6 sm:pt-6" data-work-head>
      <!-- The work order the session works to: a stage's instruction, or the job's prompt. -->
      <section v-if="$slots.order || job !== null" class="flex min-w-0 flex-col gap-1" data-work-order>
        <h3 class="text-sm font-medium text-muted">{{ $t("agents.title.work_order") }}</h3>
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
      </section>

      <!-- What the session is doing now, while it runs. -->
      <section v-if="running && now !== ''" class="flex min-w-0 flex-col gap-1" data-work-now>
        <h3 class="text-sm font-medium text-muted">{{ $t("agents.title.work_now") }}</h3>
        <p class="flex min-w-0 items-center gap-2 text-sm">
          <UIcon name="i-material-symbols-progress-activity" class="size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" />
          <span class="min-w-0 break-words text-highlighted">{{ now }}</span>
        </p>
      </section>

      <!-- What it has spent and how many calls it made, as the job line counts them, with every model's share. -->
      <section v-if="view !== null" class="flex min-w-0 flex-col gap-2" data-work-figures>
        <h3 class="text-sm font-medium text-muted">{{ $t("agents.title.work_figures") }}</h3>
        <p class="flex flex-wrap items-center gap-2 text-sm text-muted tabular-nums">
          <ItemTip v-if="view.todoId !== null" :id="view.todoId" press class="flex min-w-0 items-center gap-2">
            <span class="shrink-0 tabular-nums text-highlighted">#{{ view.todoId }}</span>
            <span class="min-w-0 truncate text-default">{{ view.title }}</span>
          </ItemTip>
          <span>{{ view.time }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ view.tools }}</span>
          <span aria-hidden="true">·</span>
          <UTooltip :text="$t(CHIP_LABELS.tokens)">
            <span class="flex items-center gap-1">
              <UIcon :name="CHIP_ICONS.tokens" class="size-4 shrink-0" />
              {{ view.written }}
            </span>
          </UTooltip>
        </p>
        <ul v-if="view.models.length > 0" class="flex flex-col gap-2 text-sm">
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
      </section>

      <!-- The stages, where the job is a co-work item or the worker laid out a plan of them. -->
      <section v-if="props.stepper && stages.length > 0" class="flex min-w-0 flex-col gap-1" data-work-stages>
        <h3 class="text-sm font-medium text-muted">{{ $t("agents.title.work_stages") }}</h3>
        <StageStepper :stages="stages" :label="$t('agents.title.work_stages')" @open="openStage" />
      </section>

      <!-- What the stage or the job left. -->
      <section v-if="$slots.result" class="flex min-w-0 flex-col gap-1" data-work-result>
        <h3 class="text-sm font-medium text-muted">{{ $t("agents.title.work_result") }}</h3>
        <slot name="result" />
      </section>

      <h3 class="text-sm font-medium text-muted">{{ $t("agents.title.work_log") }}</h3>
    </div>

    <AgentLogView ref="log" :name="props.agent" :place="props.place" :live="props.live" :only="props.only" @rows="rows = $event" />

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
import { callTopLine, planOf } from "~/domain/tool-view";
import { taskStageKey, workStages, workSteps } from "~/domain/workorder";

import type { RunProgress, WorkOrderView } from "#shared/types";
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
}

const props = withDefaults(defineProps<Props>(), { place: null, live: () => [], only: null, run: null, stepper: false, job: true });
const { t } = useI18n();
const slots = useSlots();

// The screen's own clock, in seconds, which a running job's time and a running stage's counter move with.
const clock = ref(Math.floor(Date.now() / 1000));

usePolling(() => {
  clock.value = Math.floor(Date.now() / 1000);
}, 1000);

const jobRun = computed(() => props.run ?? props.only);
// Read again every few seconds, so a running job's tool calls and tokens move as they happen.
const { job: jobRead } = useJobLine(props.agent, jobRun, 3000);
// A stage's view speaks of that stage's own run alone, never of whatever its worker runs now.
const job = computed(() => (props.job && (props.only === null || jobRead.value?.run === props.only) ? jobRead.value : null));
const view = computed(() => (job.value === null ? null : jobLineView(t, job.value, clock.value)));
const running = computed(() => job.value !== null && job.value.finishedAt === null);

// The job's prompt, read once the job is known; a stage's view hands its own work order instead.
const promptRun = computed(() => (slots.order === undefined && job.value !== null ? job.value.run : null));
const { prompt, loaded: promptLoaded, failed: promptFailed } = useJobPrompt(props.agent, promptRun, ref(true));

const rows = ref<LogRow[]>([]);

// What the session is doing now: its newest call's top line, or the newest line it wrote, on one line.
const now = computed(() => {
  const newest = [...rows.value].reverse().find((row) => row.line.kind === "tool" || row.line.kind === "text" || row.line.kind === "thinking");

  if (newest === undefined) return "";
  if (newest.line.kind === "tool") return callTopLine(newest.line.name, newest.line.text);

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
    order.value = await $fetch<WorkOrderView | null>(`/api/todos/${todo}/work-order`);
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
