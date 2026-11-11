import { describe, expect, test } from "bun:test";

const source = await Bun.file(new URL("../../../apps/web/app/components/WorkTaskDialog.vue", import.meta.url)).text();

// The dialog one task of a work order is read in, the work view of that task (docs/web.md, 「The work view」): its work
// order, its run, its log and what it left, one under the other with no tab row, and a result of any length scrolling
// inside it instead of growing the dialog past the screen.

describe("the shell a task opens in", () => {
  test("is this console's own: a modal on a wide screen, a sheet from the bottom on a narrow one", () => {
    expect(source).toContain('<component :is="narrow ? UDrawer : UModal"');
    expect(source).toContain('import { UDrawer, UModal } from "#components"');
    expect(source).toContain('import { useNarrow } from "bmo-ui/app/domain/screen"');
    expect(source).toContain('direction: "bottom" as const');
  });

  test("stands at a height of its own rather than at the height of what is in it", () => {
    expect(source).toContain("h-[92dvh]");
    expect(source).toContain("max-w-3xl h-[80dvh]");
  });

  test("scrolls its body, so a long result cannot push the dialog past the window", () => {
    expect(source).toContain('<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">');
    expect(source).toContain("whitespace-pre-wrap break-words");
  });

  test("closes by the button, the backdrop and the escape key", () => {
    expect(source).toContain(`:aria-label="$t('common.action.close')"`);
    expect(source).toContain("emit('update:open', false)");
    expect(source).toContain('@update:open="emit(\'update:open\', $event)"');
  });
});

describe("what the dialog shows of a task", () => {
  test("everything an unfolded row showed, and how long it took", () => {
    expect(source).toContain("task.instruction");
    expect(source).toContain('$t("todo.label.run_id", { id: task.jobId })');
    expect(source).toContain('$t("todo.label.run_id_took", { id: task.jobId, time: spanClock($t, took) })');
    expect(source).toContain("task.result");
    expect(source).toContain("task.error");
    expect(source).toContain("taskSeconds(task.value, props.ended)");
  });

  test("heads it with the task's own line and its models", () => {
    expect(source).toContain('taskHeading(t, task.value, props.step?.title || props.step?.name || "")');
    expect(source).toContain("taskModelLine(t, task.value)");
    expect(source).toContain("taskModelLine(t, task.value, true)");
    expect(source).toContain("<MarqueeLine class=\"text-sm text-muted\">{{ modelLine }}</MarqueeLine>");
    expect(source).toContain('<UTooltip :text="wholeModelLine" :disabled="wholeModelLine === modelLine">');
  });

  test("stands the task in the work view, narrowed to its run, and draws nothing where none is open", () => {
    expect(source).toContain(':place="task.unit === null ? null : { run: task.unit }"');
    expect(source).toContain(':only="task.unit"');
    expect(source).toContain("<template #order>");
    expect(source).toContain('<template v-if="hasDetail" #result>');
    expect(source).toContain("step: WorkStep | null");
  });
});

// A stage of several branches is one step on the stepper, each branch a sub-stage of it: the dialog has no tab row of
// the step's tasks, and none of the instruction and its result either.
describe("the tabs the dialog has", () => {
  test("are none: the work order and what came of it stand one under the other", () => {
    expect(source).not.toContain("<UTabs");
    expect(source).not.toContain("taskTabs");
    expect(source).not.toContain("TAB_ROW_LINE");
  });

  test("open on the task pressed, or the first, and keep the open one when the order is read again", () => {
    expect(source).toContain('taskKey.value = props.taskId ?? props.step?.tasks[0]?.id ?? "";');
  });
  test("do not hold the step verbs, which stand in the dialog's foot at its right end, outside the scroll", () => {
    const foot = source.indexOf('<div v-if="task && verbs.length > 0" class="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-default px-4 py-3">');

    expect(foot).toBeGreaterThan(source.indexOf('<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">'));
    expect(source.indexOf('v-for="verb in verbs"')).toBeGreaterThan(foot);
  });

  test("lay a builder turn's JSON answer out rather than show the text", () => {
    expect(source).toContain('<BuilderResult v-if="builderRead !== null" :read="builderRead" :text="task.result"');
    expect(source).toContain('task.value?.role === "builder" ? readBuilderResult(task.value.result ?? "") : null');
  });
});

describe("a skipped task in the dialog", () => {
  test("shows why it was skipped and when, on the owner's clock", () => {
    expect(source).toContain('<template v-if="task.skip">');
    expect(source).toContain("task.skip.why");
    expect(source).toContain("formatStamp(Math.floor(task.skip.at / 1000))");
  });
});

describe("the step verbs in the dialog", () => {
  test("are the ones the task's state takes, and the bot judges the rest", () => {
    expect(source).toContain("taskVerbs(t, task.value, props.orderStatus)");
    expect(source).toContain('v-for="verb in verbs"');
  });

  test("go to the one door as the script's verbs do, and hand the order back", () => {
    expect(source).toContain("`/api/todos/${props.todoId}/work-order`");
    expect(source).toContain("{ action: verb, task: open.id, why: why.value }");
    expect(source).toContain('emit("changed", order)');
  });

  test("a skip is not sent without its reason, and a refusal is shown in the bot's own words", () => {
    expect(source).toContain(":disabled=\"asking === 'skip' && why.trim() === ''\"");
    expect(source).toContain("refusal.value = (cause as { data?: { message?: string } }).data?.message");
    expect(source).toContain("{{ refusal }}");
  });
});

// A co-worker writes its plan, its task instructions and its results in English, so what stands in
// this dialog is read in either language. It is the document viewer's own translator behind it, and
// the switch stands in the tab row's action area rather than on a row of its own.
describe("reading a co-worker's text in the other language", () => {
  test("stands the work order and the result each in the original with its translation a press away, with no switch", () => {
    expect(source).toContain('<TranslatedText :text="task.instruction" text-class="text-sm" />');
    expect(source).toContain('<TranslatedText v-else :text="task.result" text-class="text-sm" />');
    expect(source).not.toContain("<USwitch");
    expect(source).not.toContain("localStorage");
  });

  test("leaves the original as the text the worker read, however the screen is drawn", () => {
    expect(source).toContain(':read="builderRead" :text="task.result"');
  });
});
