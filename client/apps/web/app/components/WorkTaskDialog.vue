<template>
  <!-- One step of a work order, whole. The same dialog in the two shapes this console uses
       everywhere: in the middle of a wide screen, up from the bottom edge of a narrow one. What
       a task carries is a result of any length, so the body scrolls inside a shell of a fixed
       height rather than growing the dialog past the screen. -->
  <component :is="narrow ? UDrawer : UModal" v-bind="shell" :open="props.open" @update:open="emit('update:open', $event)">
    <template #content>
      <div class="flex h-full min-h-0 flex-col">
        <!-- The head is the two lines the list writes for this same step, so the item pressed and
             the dialog it opened read as the one thing. The model line is names with their marks at
             the end, so it slides as the row's does. -->
        <div class="flex items-center gap-2 border-b border-default px-4 py-3">
          <UIcon :name="icon" class="size-5 shrink-0 text-muted" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-highlighted">{{ heading }}</p>
            <MarqueeLine class="text-sm text-muted">{{ modelLine }}</MarqueeLine>
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

        <!-- A step of several tasks has a tab to each, named by the task's short title with its
             state on the left; the task in the open tab is the one everything below is about. -->
        <UTabs
          v-if="props.step !== null && props.step.tasks.length > 1"
          v-model="taskKey"
          :items="taskTabs"
          :content="false"
          color="neutral"
          variant="link"
          size="sm"
          :class="['h-10 shrink-0 px-4', TAB_ROW_LINE]"
          :ui="TAB_ROW_UI"
          :aria-label="$t('todo.aria.task_choose')"
        />

        <!-- The instruction and what came of it are read one at a time. Standing them in one
             flow put a result of any length below an instruction of any length, so reading what
             a branch found meant scrolling past everything it had been told. The tabs stand
             outside the scroll, so the other one is always a press away. -->
        <div v-if="task" :class="['flex h-10 shrink-0 items-center gap-2 px-4', TAB_ROW_LINE]">
          <UTabs
            v-model="tab"
            :items="TABS"
            :content="false"
            color="neutral"
            variant="link"
            size="sm"
            class="h-full min-w-0"
            :ui="TAB_ROW_UI"
            :aria-label="$t('todo.aria.task_view_choose')"
          />

          <!-- A co-worker writes in English, so what stands here is read in either language. Each
               part lands in the text as the translator writes it, so the text itself is how far the
               translation has come and the mark beside the switch carries no count. The switch is
               never the thing that spins: a switch drawn as loading cannot be pressed, and a reader
               who turned the translation on must be able to turn it off again while it runs. -->
          <div v-if="translatable" class="ms-auto flex shrink-0 items-center gap-2">
            <UTooltip v-if="translation.translating.value" :text="$t('todo.status.translating')">
              <span role="status" :aria-label="$t('todo.status.translating')" class="flex size-5 items-center justify-center">
                <UIcon name="i-material-symbols-progress-activity" class="size-4 animate-spin text-muted motion-reduce:animate-none" />
              </span>
            </UTooltip>
            <USwitch size="sm" :model-value="translated" :label="translationLabel" @update:model-value="setTranslated" />
          </div>
        </div>

        <!-- What went wrong with the translation, where something did; that it is still going stands
             on the mark beside the switch. A translator that could not render some parts is a
             warning the reader may act on, and a bot that cannot be reached at all is an error. -->
        <div
          v-if="translated && troubleLine !== ''"
          :role="translation.failure.value === '' ? 'status' : 'alert'"
          class="flex shrink-0 flex-wrap items-center gap-2 border-b border-default px-4 py-2 text-sm"
        >
          <span :class="translation.failure.value === '' ? 'text-warning' : 'text-error'">{{ troubleLine }}</span>
          <UButton class="ms-auto" size="sm" color="neutral" variant="subtle" :label="$t('todo.action.retry_translation')" :loading="translation.asking.value" @click="translation.retry()" />
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          <template v-if="task">
            <div v-show="tab === 'instruction'">
              <p class="text-sm text-muted">{{ taskHeading($t, task, props.step?.title || props.step?.name || "") }}</p>
              <MarkdownText :text="shownInstruction" class="mt-2 text-sm" />
            </div>

            <div v-show="tab === 'result'">
              <p v-if="!hasDetail" class="text-sm text-muted">{{ $t("todo.status.nothing_left") }}</p>

              <p v-if="task.jobId" class="text-sm text-muted tabular-nums">
                {{ took === null ? $t("todo.label.run_id", { id: task.jobId }) : $t("todo.label.run_id_took", { id: task.jobId, time: spanClock($t, took) }) }}
              </p>

              <template v-if="task.result">
                <p class="mt-3 text-sm font-medium text-muted">{{ $t("todo.label.result") }}</p>
                <BuilderResult v-if="builderRead !== null" :read="builderRead" :text="task.result" class="mt-1" />
                <MarkdownText v-else :text="shownResult" class="mt-1 text-sm" />
              </template>

              <template v-if="task.error">
                <p class="mt-3 text-sm font-medium text-muted">{{ $t("todo.label.task_failed") }}</p>
                <p class="mt-1 text-sm whitespace-pre-wrap break-words text-error">{{ task.error }}</p>
              </template>

              <template v-if="task.skip">
                <p class="mt-3 text-sm font-medium text-muted">{{ $t("todo.label.skipped_at", { time: formatStamp(Math.floor(task.skip.at / 1000)) }) }}</p>
                <p class="mt-1 text-sm whitespace-pre-wrap break-words">{{ task.skip.why }}</p>
              </template>
            </div>

            <!-- What a verb asks for before it is sent stands at the end of the body. -->
            <div v-if="asking !== null || refusal" class="mt-4 flex flex-col gap-2">
              <template v-if="asking === 'edit' || asking === 'rerun'">
                <UFormField :label="asking === 'edit' ? $t('todo.label.edited_instruction') : $t('todo.label.rerun_instruction')" name="taskInstruction">
                  <GrowingTextarea v-model="instruction" :aria-label="$t('todo.aria.work_instruction')" :rows="4" />
                </UFormField>
                <UFormField :label="$t('todo.label.task_tier')" name="taskTier"><USelect :content="{ align: 'start' }" v-model="tierChoice" :items="tierItems" class="min-h-11 w-full" :aria-label="$t('todo.label.task_tier')" /></UFormField>
              </template>
              <UFormField v-if="asking === 'skip'" :label="$t('todo.label.skip_reason')" name="skipWhy">
                <GrowingTextarea v-model="why" :aria-label="$t('todo.label.skip_reason')" :rows="2" />
              </UFormField>
              <p v-if="refusal" class="text-sm whitespace-pre-wrap break-words text-error">{{ refusal }}</p>
            </div>
          </template>
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
import { languageName } from "~/domain/work-translation";
import { countText } from "~/domain/numbers";
import { useNarrow } from "bmo-ui/app/domain/screen";
import { TAB_ROW_LINE, TAB_ROW_UI } from "bmo-ui/app/domain/tabs";
import { formatStamp, spanClock } from "bmo-ui/app/domain/time";
import { useWorkTextTranslation } from "~/domain/work-translation";
import { readBuilderResult, stepHeading, stepModelLine, taskHeading, taskSeconds, taskStateIcon, taskTitle, taskVerbs } from "~/domain/workorder";

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
}

const { t } = useI18n();
const props = withDefaults(defineProps<Props>(), { step: null, taskId: null, ended: () => ({}), orderStatus: null });

const emit = defineEmits<{ "update:open": [open: boolean]; changed: [order: WorkOrderView] }>();

// Which of the step's tasks is open: the first to begin with, and the same one after the order is
// read again, looked for by its id.
const taskKey = ref("");
const task = computed(() => props.step?.tasks.find((one) => one.id === taskKey.value) ?? props.step?.tasks[0] ?? null);
const taskTabs = computed(() =>
  (props.step?.tasks ?? []).map((one, index) => ({
    label: taskTitle(one, `${index + 1}`),
    value: one.id,
    icon: taskStateIcon(one.state)
  }))
);
const took = computed(() => (task.value === null ? null : taskSeconds(task.value, props.ended)));

const narrow = useNarrow();

const TABS = [{ label: t("todo.label.instruction_text"), value: "instruction" }, { label: t("todo.label.result"), value: "result" }];
const tab = ref("instruction");

// Whether a co-worker's text is read translated. It belongs to the screen rather than to one task,
// so the next step opened stands as this one was left, and the browser remembers it for the next
// visit.
const TRANSLATED_KEY = "bmo-work-translated";
const translated = ref(false);

function setTranslated(on: boolean): void {
  translated.value = on;

  try {
    window.localStorage.setItem(TRANSLATED_KEY, on ? "1" : "0");
  } catch {
    // A browser that refuses storage keeps the choice for this visit.
  }
}

onMounted(() => {
  try {
    translated.value = window.localStorage.getItem(TRANSLATED_KEY) === "1";
  } catch {
    // Nothing remembered; the original is what stands.
  }
});

// The text the open tab shows, which is the one being translated. An empty one has nothing to put
// into another language, and the switch is not drawn for it.
const textOfTab = computed(() => (tab.value === "result" ? (task.value?.result ?? "") : (task.value?.instruction ?? "")));
const translation = useWorkTextTranslation(
  t,
  () =>
    task.value === null || textOfTab.value.trim() === ""
      ? null
      : { todoId: props.todoId, task: task.value.id, field: tab.value === "result" ? "result" : "instruction", text: textOfTab.value },
  () => translated.value
);
const translatable = computed(() => textOfTab.value.trim() !== "");
const translationLabel = computed(() =>
  narrow.value || translation.target.value === null ? t("todo.label.translation") : t("documents.label.translation_of", { language: languageName(t, translation.target.value) })
);
const shownInstruction = computed(() => (tab.value === "instruction" ? translation.shown.value : (task.value?.instruction ?? "")));
const shownResult = computed(() => (tab.value === "result" ? translation.shown.value : (task.value?.result ?? "")));
// What went wrong with the translation, in one line: what the bot said of it, or how many parts the
// translator could not render. Either is asked for again by the same press.
const troubleLine = computed(() => {
  if (translation.failure.value !== "") {
    return translation.failure.value;
  }

  return translation.failed.value > 0 ? t("documents.status.translation_failed_parts", { n: countText(translation.failed.value) }) : "";
});
const hasDetail = computed(() => task.value !== null && (task.value.jobId !== null || task.value.result !== null || task.value.error !== null || task.value.skip !== undefined));

const verbs = computed(() => (task.value === null || props.orderStatus === null ? [] : taskVerbs(t, task.value, props.orderStatus)));

// A builder turn answers in JSON; the result tab lays that out rather than showing the text.
const builderRead = computed(() => (task.value?.role === "builder" ? readBuilderResult(shownResult.value) : null));
const confirmLabel: Record<TaskVerb, string> = { edit: t("todo.action.save_instruction"), skip: t("todo.action.task_skip"), restore: t("todo.action.task_restore_confirm"), rerun: t("todo.action.task_rerun") };
const asking = ref<TaskVerb | null>(null);
const instruction = ref("");
const why = ref("");
const tierChoice = ref("keep");
const { data: tiers } = useFetch<import('#shared/agency').TierSettingsView>('/api/model-tiers', { key: 'model-tiers', server: false, lazy: true });
const tierItems = computed(() => [{ value: 'keep', label: t("todo.label.keep_tier") }, ...(tiers.value?.tiers ?? []).map(value => ({ value, label: value }))]);
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
  asking.value = null; refusal.value = ""; why.value = ""; tab.value = "instruction";
});

function choose(verb: TaskVerb) {
  asking.value = verb; refusal.value = ""; tierChoice.value = "keep";
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
        ? { action: verb, task: open.id, instruction: verb === "edit" ? instruction.value : changed, model: tierChoice.value === "keep" ? undefined : tierChoice.value }
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

const heading = computed(() => (props.step === null ? "" : stepHeading(t, props.step)));
const modelLine = computed(() => (props.step === null ? "" : stepModelLine(t, props.step, true)));
const icon = computed(() => taskStateIcon(props.step?.state));

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
