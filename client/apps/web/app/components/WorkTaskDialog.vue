<template>
  <!-- One step of a work order, whole. The same dialog in the two shapes this console uses
       everywhere: in the middle of a wide screen, up from the bottom edge of a narrow one. What
       a task carries is a result of any length, so the body scrolls inside a shell of a fixed
       height rather than growing the dialog past the screen. -->
  <component :is="narrow ? UDrawer : UModal" v-bind="shell" :open="props.open" @update:open="emit('update:open', $event)">
    <template #content>
      <div class="flex h-full min-h-0 flex-col">
        <!-- The head names the task the dialog stands at, as the stepper's own line does, with its models under it. -->
        <div class="flex items-center gap-2 border-b border-default px-4 py-3">
          <UIcon :name="icon" class="size-5 shrink-0 text-muted" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-highlighted">{{ heading }}</p>
            <UTooltip :text="wholeModelLine" :disabled="wholeModelLine === modelLine">
              <MarqueeLine class="text-sm text-muted">{{ modelLine }}</MarqueeLine>
            </UTooltip>
          </div>

          <UTooltip :text="$t('common.action.close')">
            <UButton
              size="sm"
              color="neutral"
              variant="ghost"
              icon="i-material-symbols-close"
              :aria-label="$t('common.action.close')"
              @click="emit('update:open', false)"
            />
          </UTooltip>
        </div>

        <!-- The work view of the task: its work order, what its session is doing, what it spent and called, its log and
             what it left, one under the other (docs/web.md, 「The work view」). A co-worker writes in English, so the
             work order and the result each stand in the original with its translation a press away. -->
        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <WorkView
            v-if="task && props.agent !== null"
            :key="task.id"
            :agent="props.agent"
            :place="task.unit === null ? null : { run: task.unit }"
            :only="task.unit"
            :run="task.unit"
            :stepper="false"
          >
            <template #order>
              <TranslatedText :text="task.instruction" text-class="text-sm" />
            </template>

            <template v-if="hasDetail" #result>
              <p v-if="task.jobId" class="text-sm text-muted tabular-nums">
                {{ took === null ? $t("todo.label.run_id", { id: task.jobId }) : $t("todo.label.run_id_took", { id: task.jobId, time: spanClock($t, took) }) }}
              </p>
              <template v-if="task.result">
                <BuilderResult v-if="builderRead !== null" :read="builderRead" :text="task.result" />
                <TranslatedText v-else :text="task.result" text-class="text-sm" />
              </template>
              <template v-if="task.error">
                <p class="text-sm font-medium text-muted">{{ $t("todo.label.task_failed") }}</p>
                <p class="text-sm whitespace-pre-wrap break-words text-error">{{ task.error }}</p>
              </template>
              <template v-if="task.skip">
                <p class="text-sm font-medium text-muted">{{ $t("todo.label.skipped_at", { time: formatStamp(Math.floor(task.skip.at / 1000)) }) }}</p>
                <p class="text-sm whitespace-pre-wrap break-words">{{ task.skip.why }}</p>
              </template>
            </template>
          </WorkView>

          <!-- What a verb asks for before it is sent stands at the end of the body. -->
          <div v-if="task && (asking !== null || refusal)" class="flex flex-col gap-2 px-4 py-3">
            <template v-if="asking === 'edit' || asking === 'rerun'">
              <UFormField :label="asking === 'edit' ? $t('todo.label.edited_instruction') : $t('todo.label.rerun_instruction')" name="taskInstruction">
                <GrowingTextarea v-model="instruction" :aria-label="$t('todo.aria.work_instruction')" :rows="4" />
              </UFormField>
            </template>
            <UFormField v-if="asking === 'skip'" :label="$t('todo.label.skip_reason')" name="skipWhy">
              <GrowingTextarea v-model="why" :aria-label="$t('todo.label.skip_reason')" :rows="2" />
            </UFormField>
            <p v-if="refusal" class="text-sm whitespace-pre-wrap break-words text-error">{{ refusal }}</p>
          </div>
        </div>

        <!-- The step verbs this task's state takes, in the dialog's foot at its right end. They act
             on the task rather than on the tab being read. Which of them the order's phase allows is
             the bot's to judge, and a refusal comes back in its own words above. -->
        <div v-if="task && verbs.length > 0" class="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-default px-4 py-3">
          <template v-if="asking === null">
            <UButton
              v-for="verb in verbs"
              :key="verb.action"
              size="sm"
              variant="outline"
              :color="verb.action === 'skip' ? 'warning' : 'neutral'"
              :disabled="busy"
              @click="choose(verb.action)"
            >
              {{ verb.label }}
            </UButton>
          </template>
          <template v-else>
            <UButton size="sm" variant="ghost" color="neutral" :disabled="busy" @click="asking = null">{{ $t("common.action.cancel") }}</UButton>
            <UButton size="sm" :loading="busy" :disabled="asking === 'skip' && why.trim() === ''" @click="send()">{{ confirmLabel[asking] }}</UButton>
          </template>
        </div>
      </div>
    </template>
  </component>
</template>

<script setup lang="ts">
import { UDrawer, UModal } from "#components";
import { useNarrow } from "bmo-ui/app/domain/screen";
import { formatStamp, spanClock } from "bmo-ui/app/domain/time";
import { readBuilderResult, stepHeading, stepModelLine, taskHeading, taskModelLine, taskSeconds, taskStateIcon, taskVerbs } from "~/domain/workorder";

import type { TaskVerb, WorkStep } from "~/domain/workorder";
import type { WorkOrder } from "#shared/types";
import type { WorkOrderView } from "#shared/types";

interface Props {
  // The step being read, and null while nothing is open — the dialog outlives one item, so the
  // panel hands it whichever item was pressed.
  step: WorkStep | null;
  // The task of that step the dialog opens at; the step's first where none is named.
  taskId?: string | null;
  // When each task ended, by task id, as the order view carries it.
  ended: Record<string, number>;
  open: boolean;
  // The item the order belongs to and where the order stands, which is what decides the verbs.
  todoId: number;
  orderStatus: WorkOrder["status"] | null;
  // The worker whose order this is, whose log the task's run is read from.
  agent?: string | null;
}

const { t } = useI18n();
const props = withDefaults(defineProps<Props>(), { step: null, taskId: null, ended: () => ({}), orderStatus: null, agent: null });

const emit = defineEmits<{ "update:open": [open: boolean]; changed: [order: WorkOrderView] }>();

// Which of the step's tasks is open: the first to begin with, and the same one after the order is
// read again, looked for by its id.
const taskKey = ref("");
const task = computed(() => props.step?.tasks.find((one) => one.id === taskKey.value) ?? props.step?.tasks[0] ?? null);
const took = computed(() => (task.value === null ? null : taskSeconds(task.value, props.ended)));

const narrow = useNarrow();


const hasDetail = computed(() => task.value !== null && (task.value.jobId !== null || task.value.result !== null || task.value.error !== null || task.value.skip !== undefined));

const verbs = computed(() => (task.value === null || props.orderStatus === null ? [] : taskVerbs(t, task.value, props.orderStatus)));

// A builder turn answers in JSON; the result tab lays that out rather than showing the text.
const builderRead = computed(() => (task.value?.role === "builder" ? readBuilderResult(task.value.result ?? "") : null));
const confirmLabel: Record<TaskVerb, string> = { edit: t("todo.action.save_instruction"), skip: t("todo.action.task_skip"), restore: t("todo.action.task_restore_confirm"), rerun: t("todo.action.task_rerun") };
const asking = ref<TaskVerb | null>(null);
const instruction = ref("");
const why = ref("");
const busy = ref(false);
const refusal = ref("");

// The dialog opens at the task it was pressed for, or the step's first; another step or task opened in
// it starts there too.
function startTask(): void {
  taskKey.value = props.taskId ?? props.step?.tasks[0]?.id ?? "";
}

watch(() => [props.step?.key, props.taskId], startTask);
watch(() => props.open, (open) => { if (open) startTask(); });

// Another task opened in the same dialog starts with nothing half-asked and on its instruction,
// which is what the reader pressed the item to see.
watch(() => task.value?.id, () => {
  asking.value = null; refusal.value = ""; why.value = "";
});

function choose(verb: TaskVerb) {
  asking.value = verb; refusal.value = "";
  instruction.value = task.value?.instruction ?? "";
}

async function send() {
  const open = task.value;
  const verb = asking.value;

  if (open === null || verb === null) return;

  busy.value = true; refusal.value = "";

  try {
    // An instruction left as it stood is no change, so a rerun sends one only when it was edited.
    const changed = instruction.value.trim() !== open.instruction.trim() ? instruction.value : undefined;
    const body = verb === "skip"
      ? { action: verb, task: open.id, why: why.value }
      : verb === "edit" || verb === "rerun"
        ? { action: verb, task: open.id, instruction: verb === "edit" ? instruction.value : changed }
        : { action: verb, task: open.id };
    const order = await $fetch<WorkOrderView>(`/api/todos/${props.todoId}/work-order`, { method: "POST", body });

    asking.value = null; why.value = "";
    emit("changed", order);
  } catch (cause) {
    refusal.value = (cause as { data?: { message?: string } }).data?.message ?? t("todo.error.bot_refused");
  } finally {
    busy.value = false;
  }
}

const heading = computed(() => (task.value === null ? (props.step === null ? "" : stepHeading(t, props.step)) : taskHeading(t, task.value, props.step?.title || props.step?.name || "")));
// The head names its models short, as the stepper does, and whole in the tooltip (docs/web.md, 「Model names where room is
// short」).
const modelLine = computed(() => (task.value === null ? (props.step === null ? "" : stepModelLine(t, props.step)) : taskModelLine(t, task.value)));
const wholeModelLine = computed(() => (task.value === null ? (props.step === null ? "" : stepModelLine(t, props.step, true)) : taskModelLine(t, task.value, true)));
const icon = computed(() => taskStateIcon(task.value?.state ?? props.step?.state));

// A sheet fills the screen and is dragged down to dismiss; a modal stands in the middle, wide
// enough for an instruction to read as paragraphs and tall enough that a long result scrolls
// inside it rather than pushing the dialog past the window. The backdrop and the escape key are
// the shell's own.
const shell = computed(() => {
  const shared = { title: heading.value, description: t("todo.label.task_step") };

  return narrow.value
    ? { ...shared, direction: "bottom" as const, handleOnly: true, ui: { content: "h-[92dvh]" } }
    : { ...shared, ui: { content: "max-w-3xl h-[80dvh]" } };
});
</script>
