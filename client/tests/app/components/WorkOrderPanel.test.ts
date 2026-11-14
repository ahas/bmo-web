import { describe, expect, test } from "bun:test";

import { packEntries } from "../../../apps/web/shared/wording";
import KO from "../../fixtures/app/components/WorkOrderPanel.test.ko.json";

// The keys whose words carry a phrase, so a check that a screen never says it reads the keys.
const keysSaying = (phrase: string) => packEntries().filter(([, value]) => value.includes(phrase)).map(([key]) => key);

const source = await Bun.file(new URL("../../../apps/web/app/components/WorkOrderPanel.vue", import.meta.url)).text();
const modelSelect = await Bun.file(new URL("../../../apps/web/app/components/ExecutionModelSelect.vue", import.meta.url)).text();

// The builder model's providers are the agency's providers whose program carries the line a job runs on (docs/web.md,
// the TODO detail's work order), never the fallback's, which answers the Claude accounts alone.
describe("a work order's builder model", () => {
  test("offers the providers carrying the job line, as the agency lists them", () => {
    expect(source).toContain(`<ExecutionModelSelect v-model="model" :label="$t('todo.label.builder_model')" :line="JOB_LINE"`);
    expect(modelSelect).toContain("useProviders()");
    expect(modelSelect).toContain("one.lines.length === 0 || one.lines.includes(props.line)");
    expect(modelSelect).toContain("disabled: !one.enabled");
    expect(modelSelect).not.toContain("/api/fallback");
  });
});

describe("a work order's live refresh", () => {
  test("keeps the initial GET", () => {
    expect(source).toContain("useFetch<WorkOrderView | null>");
    expect(source).toContain("`/api/todos/${props.todoId}/work-order`");
  });

  test("reads only matching work-order events and catches up on reopen", () => {
    expect(source).toContain('on: ["work-order"]');
    expect(source).toContain('event.type === "work-order" && event.todoId === props.todoId');
    expect(source).toContain("void refresh()");
  });

  // A draft rewritten outside this panel — the chat agent shaping it in the item talk — is what the refresh
  // brings, so a field nobody has typed into follows it, and one somebody has keeps their words.
  test("lets an untouched draft field follow the draft as it is read again", () => {
    expect(source).toContain("watch([status, order]");
    expect(source).toContain("intent.value === saved.intent");
    expect(source).toContain("instruction.value === saved.instruction");
  });

  // The draft is seeded out of the item's own words, and those words already stand in the
  // instructions block of the same dialog. So while it still says only what the item says, the two fields are
  // not drawn: one line says so and a press opens them.
  test("draws no field for a draft that is still only what the item says", () => {
    expect(source).toMatch(/import \{ draftRepeatsItem \} from "[^"]*todo-blocks";/);
    expect(source).toContain("draftRepeatsItem(props.instruction, order.value)");
    expect(source).toContain('v-if="repeatsItem"');
    expect(source).toContain('todo.action.write_separately');
    // The model the builder runs on is nothing the item says, so it stands either way.
    expect(source.indexOf("ExecutionModelSelect")).toBeGreaterThan(source.indexOf('v-if="repeatsItem"'));
  });

  test("reads itself again every few seconds only while its steps run", () => {
    expect(source).toContain('usePolling(() => { if (props.part === "steps" && order.value?.status === "active") void refresh(); }, 5000);');
    expect(source).not.toContain("setInterval");
  });
});

// A step folds open in place on the console's one stepper (docs/web.md, 「The progress stepper」), and
// what it unfolds is its tasks, a line each — never an instruction or a result. Those are read in a
// dialog over the list, so a long result never pushes the rest of the order off the screen.

describe("how a step and a task are opened", () => {
  test("the steps stand on the shared stage stepper, and nothing folds open", () => {
    expect(source).toContain('<StageStepper class="mt-2" :stages="stages" :label="$t(\'todo.title.coworkers\')" @open="openStage" />');
    expect(source).not.toContain("<details");
    expect(source).not.toContain("<summary");
  });

  test("a stage opens the dialog at its first task, and a sub-stage at its own", () => {
    expect(source).toContain("if (step.key === key && step.tasks[0] !== undefined) return open(step, step.tasks[0].id);");
    expect(source).toContain("const task = step.tasks.find(one => taskStageKey(step, one) === key);");
    expect(source).toContain("openedStep.value = step; openedTask.value = task;");
    expect(source).not.toContain("task.result");
    expect(source).not.toContain("task.instruction");
  });

  test("the stages are the order's steps, timed against the panel's clock", () => {
    expect(source).toContain("workStages(t, steps.value, order.value?.ended ?? {}, props.now)");
    expect(source).toContain("workSteps(t, order.value)");
    expect(source).not.toContain("group.title");
  });

  test("and one dialog stands for the whole list rather than one per row, on the item's own worker where the order names none", () => {
    expect(source).toContain(":order-status=\"order?.status ?? null\" :agent=\"order?.worker ?? props.worker ?? WORKER_AGENT\" @changed=\"order = $event\" />");
    expect(source.match(/WorkTaskDialog/g)?.length).toBe(1);
  });
});

// How long the work took is worked out of what is already recorded, and stands on the panel.
describe("the time of the work", () => {
  test("stands as the start, the end and the whole, from the order's steps", () => {
    expect(source).toContain("orderSpan(steps.value, order.value.status, props.now)");
    expect(source).toContain('$t("todo.label.span_total", { time: spanClock($t, span.seconds) })');
  });

  test("moves with the clock of the panel it stands in, with no clock of its own", () => {
    expect(source).toContain("now: number");
  });
});

// Resuming one stopped order while the machine's own auto-progression is off writes the order
// back to active and then nothing starts, which reads as a button that did nothing. So the
// resume says what the queue's switch is doing — but only when it is actually off.
describe("resuming while the queue is paused", () => {
  test("the panel is told whether the whole queue is paused", () => {
    expect(source).toContain("queuePaused: boolean");
  });

  test("the line stands under a stopped order's resume, and only while the queue is off", () => {
    expect(source).toContain('v-if="stoppedOrder && queuePaused"');
    expect(source).toContain('todo.status.auto_paused_hint');
  });

  test("and the resume itself still stands, since he may want the order ready for the resume", () => {
    expect(source).toContain("v-if=\"stoppedOrder && !props.held\" size=\"sm\" :loading=\"busy\" @click=\"submit('resume')\"");
    expect(source).not.toContain("queuePaused\" size=\"sm\" :loading=\"busy\" @click=\"submit('resume')");
  });
});

// An order over a finished or merged item stands only to be closed: it reads as closing and offers no
// resume, no stop and no end (docs/work-orders.md 「An order closes with its item」).
describe("an order over a closed item", () => {
  test("is judged closing from the item the panel is handed, by the one judgement running.ts reads", () => {
    expect(source).toContain("item?: { done: boolean; mergedInto: number | null }");
    expect(source).toContain("workOrderClosing(order.value, props.item ?? null)");
    expect(source).toContain("const stoppedOrder = computed(() => order.value?.status === \"paused\" && !closingOrder.value);");
  });

  test("names itself closing and draws none of a stopped order's lines or verbs", () => {
    expect(source).toContain("closingOrder ? $t('todo.label.order_closing')");
    expect(source).toContain("v-if=\"stoppedOrder && order?.ownerStop\"");
    expect(source).toContain("(order.status === 'active' || order.status === 'paused') && !closingOrder");
    expect(source).toContain("closingOrder.value ? null : workOrderStop(t, order.value)");
  });
});

// A finished order is run again by reopening it, never by writing a fresh draft over it, and the
// edits travel with the reopening: the item waits in the queue the moment it is reopened.
describe("reopening a finished order", () => {
  test("a finished order offers the reopening, and the form it opens sends its edits with it", () => {
    expect(source).toContain("v-if=\"order?.status === 'done' && !reopening\"");
    expect(source).toContain("v-if=\"!order || order.status === 'draft' || reopening\"");
    expect(source).toContain("@click=\"submit('reopen')\"");
    expect(source).toContain("body: { action, intent: intent.value, instruction: instruction.value, model: model.value }");
  });

  test("the earlier rounds stand as steps of their own, on the draft as well", () => {
    // The co-worker list reads whatever order stands, a draft reopened included.
    expect(source).toContain("<template v-if=\"fetched && props.part === 'steps'\">");
    expect(source).toContain('<p v-else-if="order === null || steps.length === 0"');
    // An order of no stages stands the plan the item's latest job laid out of its own, on the same stepper.
    expect(source).toContain(`<StageStepper v-if="(order === null || steps.length === 0) && planned.length > 0"`);
  });
});

// A task decided against is not a task done: the list marks it with its own icon and a dimmed line,
// and the progress line counts it apart.
describe("skipped tasks on the panel", () => {
  test("each task wears its state's own mark from the stepper as a sub-stage, and a skipped one is dimmed", async () => {
    const stepper = await Bun.file(new URL("../../../apps/web/app/components/StageStepper.vue", import.meta.url)).text();

    expect(stepper).toContain(':name="stepLook(sub.state).icon"');
    expect(stepper).toContain(":class=\"{ 'text-muted': stageOf(item).state === 'skipped' }\"");
    expect(stepper).toContain(":class=\"{ 'text-muted': sub.state === 'skipped' }\"");
  });

  test("the progress line names the step the order is at and counts the order's steps, done and skipped apart", () => {
    expect(source).toContain("{{ phaseName($t, order) }}");
    expect(source).toContain("const counts = computed(() => taskCounts(order.value?.tasks ?? []));");
    expect(source).toContain('{{ phaseName($t, order) }} <RollingNumber v-if="counts.total > 0" :value="counts.done" :text="progressText(counts.done, counts.total)" />');
    expect(source).toContain(`<RollingSentence :keypath="'todo.label.skipped_count'" :figures="{ n: counts.skipped }" />`);
    expect(source).not.toContain('filter(task => task.state === "done").length');
  });

  test("a verb pressed in the dialog brings the order back, and the dialog keeps reading the same task in it", () => {
    expect(source).toContain('@changed="order = $event"');
    expect(source).toContain("current.find(step => step.key === openedStep.value!.key)");
  });
});

describe("closing an order midway", () => {
  test("is offered only while the order is under way, and only with a reason", () => {
    expect(source).toContain("order.status === 'active' || order.status === 'paused'");
    expect(source).toContain(":disabled=\"closeWhy.trim() === ''\"");
    expect(source).toContain('body: { action: "close", why: closeWhy.value }');
  });
});

// Stopping keeps everything to take up again; ending closes the order for good. The two stand
// apart in words and in colour, and each asks for its own reason.
describe("stopping and ending an order", () => {
  test("offers the stop only while the order runs, beside the ending", () => {
    expect(source).toContain(`<UButton v-if="order.status === 'active'" size="sm" variant="outline" color="warning" @click="stopping = true">{{ $t("todo.action.stop") }}</UButton>`);
    expect(source).toContain('color="error" @click="closing = true">{{ $t("todo.action.end_work_order") }}</UButton>');
  });

  test("the stop waits for a reason and posts the item's stop verb", () => {
    expect(source).toContain(`:disabled="stopWhy.trim() === ''" @click="stop()">{{ $t("todo.action.stop_and_hold") }}</UButton>`);
    expect(source).toContain('body: { action: "stop", id: props.todoId, why: stopWhy.value.trim() }');
    for (const key of keysSaying(KO.line_190)) {
      expect(source).not.toContain(key);
    }
    expect(source).toContain('>{{ $t("todo.action.skip_and_end") }}</UButton>');
  });

  test("an order the owner stopped shows his reason", () => {
    expect(source).toContain(`v-if="stoppedOrder && order?.ownerStop"`);
    expect(source).toContain('$t("todo.label.stop_reason_line", { reason: order.ownerStop.why })');
  });
});

describe("an order whose item is held", () => {
  test("reads as stopped when the owner stopped it, and offers no resume while the hold stands", () => {
    expect(source).toContain("order?.status === 'paused' && order.ownerStop ? $t('todo.action.stop')");
    expect(source).toContain(`v-if="stoppedOrder && !props.held"`);
  });
});
