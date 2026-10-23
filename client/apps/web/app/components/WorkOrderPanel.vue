<template>
  <!-- One of the two halves of an item's work order: the order itself — what the work is told, as
       a draft or as it runs — or the co-workers it sent out, step by step. -->
  <section class="min-w-0 rounded-md border border-default p-3" :aria-label="props.part === 'order' ? $t('todo.title.work_order') : $t('todo.title.coworkers')" :aria-busy="status === 'pending'">
    <ContentSkeleton
      v-if="!fetched && !fetchError && props.part === 'order'"
      listClass="flex flex-col gap-2"
      :label="$t('todo.status.work_order_loading')"
    >
      <div class="flex flex-col gap-2">
        <SkeletonLine width="w-1/2" />
        <SkeletonText :lines="2" size="sm" lastWidth="w-2/3" />
      </div>
    </ContentSkeleton>
    <!-- The co-workers' place is the stepper's own: its title, which needs no answer, over one step head. -->
    <template v-if="!fetched && !fetchError && props.part === 'steps'">
      <p class="text-sm font-medium">{{ $t("todo.title.coworkers") }}</p>
      <ContentSkeleton class="mt-2" listClass="flex flex-col gap-3" :label="$t('todo.status.coworkers_loading')">
        <ProgressStepSkeleton detail />
      </ContentSkeleton>
    </template>
    <ReadFailure :class="fetched ? 'mb-3' : ''" :failure="readFailure" :message="$t('todo.error.work_order_load_failed')" :reading="status === 'pending'" @retry="refresh()" />
    <template v-if="fetched && props.part === 'order'">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm font-medium">{{ $t("todo.label.work_order_state", { state: closingOrder ? $t('todo.label.order_closing') : order?.status === 'paused' && order.ownerStop ? $t('todo.action.stop') : $t(stateLabel[order?.status ?? 'draft']) }) }}</p>
      <!-- A held item's order is taken up again by releasing the hold, which the bot refuses a resume before. -->
      <UButton v-if="stoppedOrder && !props.held" size="sm" :loading="busy" @click="submit('resume')">{{ $t("todo.action.resume_from_done") }}</UButton>
      <UButton v-if="order?.status === 'done' && !reopening" size="sm" variant="outline" @click="startReopen()">{{ $t("todo.action.edit_reopen") }}</UButton>
    </div>
    <!-- Resuming this one order while the machine itself is stopped writes the order back to
         active and then nothing starts, which reads as a broken button. So the button says what
         the queue's own switch is doing. -->
    <p v-if="stoppedOrder && queuePaused" class="mt-1 text-sm text-warning">
      {{ $t("todo.status.auto_paused_hint") }}
    </p>
    <!-- Where a stopped order stands in its worker's queue and why the bot has not resumed it yet,
         in the words the TODO row uses for it. -->
    <p v-if="placeLine !== null" class="mt-1 text-sm break-words text-warning">{{ $t("todo.label.queue_place", { place: placeLine }) }}</p>
    <!-- An order the owner stopped carries his reason until it is resumed. -->
    <p v-if="stoppedOrder && order?.ownerStop" class="mt-1 text-sm break-words text-muted">{{ $t("todo.label.stop_reason_line", { reason: order.ownerStop.why }) }}</p>
    <!-- A finished order is reopened with its edits in the same request: the item waits in the queue
         again the moment it is reopened, so a second step to edit it could come after the plan. -->
    <template v-if="!order || order.status === 'draft' || reopening">
      <!-- A draft is seeded out of the item's own words, and those words are already standing in
           the instructions block above this one. So while it still says only what the item says, the two
           fields are not drawn at all: one line says so and the press opens them holding it. -->
      <template v-if="repeatsItem">
        <div class="mt-2 flex items-center gap-2">
          <p class="min-w-0 flex-1 text-sm text-muted">{{ $t("todo.label.purpose_same") }}</p>
          <UButton size="sm" variant="outline" @click="apart = true">{{ $t("todo.action.write_separately") }}</UButton>
        </div>
      </template>
      <template v-else>
        <label class="mt-2 block text-sm text-muted">{{ $t("todo.label.purpose_conclusion") }}</label>
        <GrowingTextarea v-model="intent" :aria-label="$t('todo.aria.work_purpose')" :rows="2" class="mt-1" />
        <label class="mt-2 block text-sm text-muted">{{ $t("todo.label.work_todo") }}</label>
        <GrowingTextarea v-model="instruction" :aria-label="$t('todo.aria.work_instruction')" :rows="4" class="mt-1" />
      </template>
      <ExecutionModelSelect v-model="model" :label="$t('todo.label.builder_model')" class="mt-2" />
      <template v-if="reopening">
        <div class="mt-2 flex flex-wrap justify-end gap-2">
          <UButton size="sm" :loading="busy" @click="submit('reopen')">{{ $t("todo.action.reopen_keep") }}</UButton>
          <UButton size="sm" variant="ghost" :disabled="busy" @click="reopening = false">{{ $t("common.action.cancel") }}</UButton>
        </div>
      </template>
      <template v-else>
        <div class="mt-2 flex justify-end">
          <UButton size="sm" :loading="busy" @click="submit('save')">{{ $t("common.action.save") }}</UButton>
        </div>
      </template>
    </template>
    <template v-else>
      <MarkdownText :text="order.intent" class="mt-2 text-sm text-muted" />
      <MarkdownText :text="order.instruction" class="mt-1 text-sm" />
      <!-- The step the order is at by its name, and how far the build has come counted among the build
           steps alone: a design step is never a count. -->
      <p class="mt-2 text-sm font-medium">{{ phaseName($t, order) }} <RollingNumber v-if="counts.total > 0" :value="counts.done" :text="progressText(counts.done, counts.total)" /><span v-if="counts.skipped > 0" class="text-muted"> · <RollingSentence :keypath="'todo.label.skipped_count'" :figures="{ n: counts.skipped }" /></span></p>
      <!-- Two ways to end an order midway, each taking the reason the item is held with: stopping
           keeps everything to take up again, ending skips what is left for good. -->
      <template v-if="(order.status === 'active' || order.status === 'paused') && !closingOrder">
        <div v-if="!closing && !stopping" class="mt-2 flex flex-wrap justify-end gap-2">
          <UButton v-if="order.status === 'active'" size="sm" variant="outline" color="warning" @click="stopping = true">{{ $t("todo.action.stop") }}</UButton>
          <UButton size="sm" variant="outline" color="error" @click="closing = true">{{ $t("todo.action.end_work_order") }}</UButton>
        </div>
        <template v-else-if="stopping">
          <label class="mt-2 block text-sm text-muted">{{ $t("todo.label.stop_reason") }}</label>
          <GrowingTextarea v-model="stopWhy" :aria-label="$t('todo.label.stop_reason')" :rows="2" class="mt-1" />
          <div class="mt-2 flex flex-wrap justify-end gap-2">
            <UButton size="sm" color="warning" :loading="busy" :disabled="stopWhy.trim() === ''" @click="stop()">{{ $t("todo.action.stop_and_hold") }}</UButton>
            <UButton size="sm" variant="ghost" :disabled="busy" @click="stopping = false">{{ $t("common.action.cancel") }}</UButton>
          </div>
        </template>
        <template v-else>
          <label class="mt-2 block text-sm text-muted">{{ $t("todo.label.end_reason") }}</label>
          <GrowingTextarea v-model="closeWhy" :aria-label="$t('todo.label.end_reason')" :rows="2" class="mt-1" />
          <div class="mt-2 flex flex-wrap justify-end gap-2">
            <UButton size="sm" color="error" :loading="busy" :disabled="closeWhy.trim() === ''" @click="close()">{{ $t("todo.action.skip_and_end") }}</UButton>
            <UButton size="sm" variant="ghost" :disabled="busy" @click="closing = false">{{ $t("common.action.cancel") }}</UButton>
          </div>
        </template>
      </template>
    </template>
    </template>
    <template v-if="fetched && props.part === 'steps'">
      <p class="text-sm font-medium">{{ $t("todo.title.coworkers") }}</p>
      <p v-if="order === null || steps.length === 0" class="mt-1 text-sm text-muted">{{ $t("todo.status.no_coworkers") }}</p>
      <template v-else>
      <!-- When the work began and ended, and how long of that it spent running: an order paused
           between the two stamps stood for that time rather than worked it, so what stands as the
           total is the running merged, not the stretch between the stamps. -->
      <p v-if="span !== null" class="mt-1 text-sm text-muted tabular-nums">
        {{ $t("todo.label.span_start", { time: formatStamp(span.start) }) }}<template v-if="span.end !== null"> · {{ $t("todo.label.span_end", { time: formatStamp(span.end) }) }}</template><template v-if="span.seconds !== null"> · {{ $t("todo.label.span_total", { time: spanClock($t, span.seconds) }) }}</template>
      </p>
      <!-- The procedure on the console's one stepper, a step each in the order the steps ran: a stage of
           several branches is one step. The head names the step — its name and roles keep their
           width, its title takes what is left and is cut there, the console's cut-line tooltip showing
           it whole — and stands its time at the right end; under it the models slide where they do not
           fit, with how far a stage has come at the end. The body is the step's tasks, a line each, and
           pressing one opens the step in the dialog at that task. -->
      <ProgressStepper class="mt-2" :steps="stepperSteps" :label="$t('todo.title.coworkers')">
        <template #title="{ step }">
          <span v-if="step.work.name !== ''" class="shrink-0 font-medium tabular-nums" :class="{ 'text-muted': step.state === 'skipped' }">{{ step.work.name }}</span>
          <span class="shrink-0 font-medium" :class="{ 'text-muted': step.state === 'skipped' }">{{ stepRoles(step.work) }}</span>
          <p v-if="step.work.title.trim() !== ''" class="min-w-0 flex-1 truncate" :class="{ 'text-muted': step.state === 'skipped' }">{{ step.work.title.trim() }}</p>
        </template>
        <template #time="{ step }">
          <RollingNumber v-if="stepSeconds(step.work, props.now) !== null" :value="stepSeconds(step.work, props.now)!" :text="spanClock($t, stepSeconds(step.work, props.now)!)" />
        </template>
        <template #detail="{ step }">
          <MarqueeLine class="flex-1">{{ stepModelLine($t, step.work) }}</MarqueeLine>
          <span v-if="stepPlace(step.work)" class="shrink-0 tabular-nums">{{ stepPlace(step.work) }}</span>
        </template>
        <template #body="{ step }">
          <ul class="flex flex-col gap-1" :aria-label="stepHeading($t, step.work)">
            <li v-for="(task, index) in step.work.tasks" :key="task.id">
              <button
                type="button"
                class="flex w-full min-w-0 cursor-pointer flex-col gap-1 rounded bg-elevated/60 p-2 text-left text-sm transition-colors hover:bg-elevated active:bg-accented"
                :aria-label="taskHeading($t, task, step.work.title || step.work.name)"
                @click="open(step.work, task.id)"
              >
                <span class="flex w-full min-w-0 items-center gap-2">
                  <UIcon
                    :name="stepLook(task.state).icon"
                    class="size-4 shrink-0"
                    :class="[stepLook(task.state).tone, stepLook(task.state).spins ? 'animate-spin motion-reduce:animate-none' : '']"
                    :aria-label="$t(taskLabel[task.state])"
                  />
                  <span class="shrink-0 font-medium" :class="{ 'text-muted': task.state === 'skipped' }">{{ task.role }}</span>
                  <p class="min-w-0 flex-1 truncate" :class="{ 'text-muted': task.state === 'skipped' }">{{ taskTitle(task, step.work.tasks.length > 1 ? `${index + 1}` : step.work.title || step.work.name) }}</p>
                  <span v-if="taskSeconds(task, order?.ended ?? {}) !== null" class="shrink-0 tabular-nums text-muted">{{ spanClock($t, taskSeconds(task, order?.ended ?? {})!) }}</span>
                </span>
                <MarqueeLine class="ps-6 text-muted">{{ taskModelLine($t, task) }}</MarqueeLine>
              </button>
            </li>
          </ul>
        </template>
      </ProgressStepper>
      </template>
    </template>
    <p v-if="fetched && props.part === 'order' && (error || order?.error)" class="mt-2 text-sm whitespace-pre-wrap break-words text-error">{{ error || order?.error }}</p>

    <!-- One dialog for the whole list: which step it is reading is what the list hands it. -->
    <WorkTaskDialog v-model:open="taskOpen" :step="openedStep" :task-id="openedTask" :ended="order?.ended ?? {}" :todo-id="props.todoId" :order-status="order?.status ?? null" @changed="order = $event" />
  </section>
</template>
<script setup lang="ts">
import type { WorkOrderView } from "#shared/types";
import type { WorkStep } from "~/domain/workorder";
import { queuePlaceText, workOrderClosing, workOrderStop } from "~/domain/queue-place";
import { draftRepeatsItem } from "#shared/todo-blocks";
import { useLiveRefresh, useReadFailure } from "~/domain/events";
import { useLastRead } from "bmo-ui/app/domain/loading";
import { spanClock, formatStamp } from "bmo-ui/app/domain/time";
import { progressText } from "~/domain/numbers";
import { orderSpan, phaseName, stepHeading, stepModelLine, stepPlace, stepRoles, stepSeconds, taskCounts, taskHeading, taskLabel, taskModelLine, taskSeconds, taskTitle, workSteps } from "~/domain/workorder";
import { stepLook } from "~/domain/stepper";
import type { StepperStep } from "~/domain/stepper";
// `now` is the clock of the panel this stands in, so a running step's time moves with it.
// `part` is which half of the order this stands: the order, or its co-workers.
// `held` is whether the item is set aside, which is what a resume waits for to be taken back.
// `item` is whether the item is finished and what it is merged into: an order over an item that is
// either stands only to be closed, and is never shown as stopped.
const props = defineProps<{ part: "order" | "steps"; todoId: number; title: string; instruction: string; queuePaused: boolean; now: number; held?: boolean; item?: { done: boolean; mergedInto: number | null } }>();
const { t } = useI18n();
const { data: orderRead, refresh, status, error: fetchError } = useFetch<WorkOrderView | null>(() => `/api/todos/${props.todoId}/work-order`, { default: () => null });
// A failed read puts the order back to none; the order last read stays through it instead.
const order = useLastRead(orderRead, status);
const readFailure = useReadFailure({ failed: () => !!fetchError.value, reading: () => status.value === "pending", reread: () => void refresh() });
const fetched = ref(status.value === "success");
watch(status, value => { if (value === "success") fetched.value = true; });
const intent = ref(props.title), instruction = ref(props.instruction), model = ref("");
const busy = ref(false), error = ref(""), reopening = ref(false), closing = ref(false), closeWhy = ref("");
const stopping = ref(false), stopWhy = ref("");
// Whether the draft is still the item's own words, and whether somebody has asked to write it
// apart. The press is what opens the fields; saving words the item does not carry is what keeps
// them open afterwards, because the draft has then become part of what the work is.
const apart = ref(false);
const repeatsItem = computed(() =>
  !apart.value && !reopening.value && order.value !== null && order.value.status === "draft"
  && draftRepeatsItem(props.instruction, order.value)
);
// The draft as it was last read. A field still holding exactly that is one nobody has typed into,
// so a draft rewritten elsewhere — the chat agent shaping it in the item talk — shows here as it arrives;
// a field somebody has typed into keeps what they typed until they save it or leave.
const saved = { intent: "", instruction: "", model: "" };
let initialized = false;
watch([status, order], ([value, current]) => {
  if (value !== "success" || current?.status !== "draft") return;
  if (!initialized || intent.value === saved.intent) intent.value = current.intent;
  if (!initialized || instruction.value === saved.instruction) instruction.value = current.instruction;
  if (!initialized || model.value === saved.model) model.value = current.model;
  initialized = true;
  Object.assign(saved, { intent: current.intent, instruction: current.instruction, model: current.model });
}, { immediate: true });
useLiveRefresh(
  () => { void refresh(); },
  {
    on: ["work-order"],
    where: event => event.type === "work-order" && event.todoId === props.todoId
  }
);
const stateLabel = { draft: "todo.label.order_draft", active: "todo.label.order_active", paused: "todo.label.order_paused", done: "todo.label.order_done" };
const taskOpen = ref(false), openedStep = ref<WorkStep | null>(null), openedTask = ref<string | null>(null);
const closingOrder = computed(() => workOrderClosing(order.value, props.item ?? null));
const stoppedOrder = computed(() => order.value?.status === "paused" && !closingOrder.value);
const placeLine = computed(() => {
  const stop = closingOrder.value ? null : workOrderStop(t, order.value);
  return stop?.place ? queuePlaceText(t, stop.place, stop.failures) : null;
});
function startReopen() {
  if (!order.value) return;
  intent.value = order.value.intent; instruction.value = order.value.instruction; model.value = order.value.model;
  reopening.value = true;
}
function open(step: WorkStep, task: string) {
  openedStep.value = step; openedTask.value = task; taskOpen.value = true;
}
const steps = computed<WorkStep[]>(() => order.value ? workSteps(t, order.value) : []);
// Each step as the stepper stands it, carrying the step it is. A step at work stands open when it first appears.
const stepperSteps = computed<(StepperStep & { work: WorkStep })[]>(() => steps.value.map(step => ({
  key: step.key, state: step.state, stateLabel: t(taskLabel[step.state]), title: [step.name, stepRoles(step), step.title.trim()].filter(part => part !== "").join(" · "), time: "", open: step.state === "running", work: step
})));
const counts = computed(() => taskCounts(order.value?.tasks ?? []));
const span = computed(() => order.value ? orderSpan(steps.value, order.value.status, props.now) : null);
// The dialog reads the step as the order now stands: a verb pressed in it or an event read after it
// brings a new body, and the step it had open is looked for again by its name there.
watch(steps, current => {
  if (openedStep.value !== null) openedStep.value = current.find(step => step.key === openedStep.value!.key) ?? openedStep.value;
});
async function close() {
  busy.value = true; error.value = "";
  try {
    orderRead.value = await $fetch<WorkOrderView>(`/api/todos/${props.todoId}/work-order`, { method: "POST", body: { action: "close", why: closeWhy.value } });
    closing.value = false; closeWhy.value = "";
  }
  catch (cause) { error.value = (cause as { data?: { message?: string } }).data?.message ?? t("todo.error.work_order_fold_failed"); }
  finally { busy.value = false; }
}
// The owner's stop of the whole item, through the same verb as the TODO panel's: the order stops at once
// and keeps what it finished, and the item is held with the reason.
async function stop() {
  busy.value = true; error.value = "";
  try {
    await $fetch("/api/todos", { method: "POST", body: { action: "stop", id: props.todoId, why: stopWhy.value.trim() } });
    stopping.value = false; stopWhy.value = "";
    await refresh();
  }
  catch (cause) { error.value = (cause as { data?: { message?: string } }).data?.message ?? t("todo.error.work_order_stop_failed"); }
  finally { busy.value = false; }
}
async function submit(action: "save" | "resume" | "reopen") {
  busy.value = true; error.value = "";
  try {
    orderRead.value = await $fetch<WorkOrderView>(`/api/todos/${props.todoId}/work-order`, { method: "POST", body: { action, intent: intent.value, instruction: instruction.value, model: model.value } });
    reopening.value = false;
  }
  catch (cause) { error.value = (cause as { data?: { message?: string } }).data?.message ?? t("todo.error.work_order_save_failed"); }
  finally { busy.value = false; }
}
</script>
