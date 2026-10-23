import { describe, expect, test } from "bun:test";

const source = await Bun.file(new URL("../../../apps/web/app/components/WorkTaskDialog.vue", import.meta.url)).text();

// The dialog one step of a work order is read in, a tab to each of its tasks. What it is held to is what an unfolded row
// used to show — the instruction, the run it went out as, the result and the failure — and that
// a result of any length scrolls inside it instead of growing the dialog past the screen.

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
    expect(source).toContain("min-h-0 flex-1 overflow-y-auto overscroll-contain");
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
    expect(source).toContain("shownInstruction");
    expect(source).toContain('$t("todo.label.run_id", { id: task.jobId })');
    expect(source).toContain('$t("todo.label.run_id_took", { id: task.jobId, time: spanClock($t, took) })');
    expect(source).toContain("task.result");
    expect(source).toContain("task.error");
    expect(source).toContain("taskSeconds(task.value, props.ended)");
  });

  test("heads it with the two lines the list writes for that same step", () => {
    expect(source).toContain("stepHeading(t, props.step)");
    expect(source).toContain("stepModelLine(t, props.step, true)");
    expect(source).toContain("<MarqueeLine class=\"text-sm text-muted\">{{ modelLine }}</MarqueeLine>");
  });

  test("draws nothing of a task where none is open", () => {
    expect(source).toContain('<template v-if="task">');
    expect(source).toContain("step: WorkStep | null");
  });
});

// A stage of several branches is one step, and each branch is a tab named by its short title with
// its state on the left.
describe("the tabs a step's tasks stand on", () => {
  test("stand only for a step of more than one task", () => {
    expect(source).toContain('v-if="props.step !== null && props.step.tasks.length > 1"');
  });

  test("are named by the task's title and marked with its state", () => {
    expect(source).toContain("label: taskTitle(one, `${index + 1}`)");
    expect(source).toContain("icon: taskStateIcon(one.state)");
  });

  test("open on the task pressed, or the first, and keep the open one when the order is read again", () => {
    expect(source).toContain('taskKey.value = props.taskId ?? props.step?.tasks[0]?.id ?? "";');
    expect(source).toContain("watch(() => [props.step?.key, props.taskId], startTask);");
    expect(source).toContain("watch(() => props.open, (open) => { if (open) startTask(); });");
    expect(source).toContain("props.step?.tasks.find((one) => one.id === taskKey.value)");
  });
});

// The instruction and what came of it are read one at a time. In one flow a result of any length
// stood under an instruction of any length, so reading what a branch found meant scrolling past
// everything it had been told first.
describe("the tabs the body is split into", () => {
  test("are the instruction and what came of it, and nothing else", () => {
    expect(source).toContain('const TABS = [{ label: t("todo.label.instruction_text"), value: "instruction" }, { label: t("todo.label.result"), value: "result" }];');
    expect(source).toContain("v-show=\"tab === 'instruction'\"");
    expect(source).toContain("v-show=\"tab === 'result'\"");
  });

  test("stand outside the scroll, so the other one is always a press away", () => {
    expect(source).toContain("<UTabs");
    expect(source).toContain('<div v-if="task" :class="[\'flex h-10 shrink-0 items-center gap-2 px-4\', TAB_ROW_LINE]">');
    expect(source).toContain(`:aria-label="$t('todo.aria.task_view_choose')"`);
  });

  test("open on the instruction, and another task opened in the same dialog opens there too", () => {
    expect(source).toContain('const tab = ref("instruction");');
    expect(source).toContain('tab.value = "instruction";');
  });

  test("say so where the task has left nothing yet", () => {
    expect(source).toContain('v-if="!hasDetail"');
    expect(source).toContain('todo.status.nothing_left');
  });

  // What a verb does is done to the task, not to the part of it being read, so it stands under
  // both rather than inside either.
  test("do not hold the step verbs, which stand in the dialog's foot at its right end, outside the scroll", () => {
    const foot = source.indexOf('<div v-if="task && verbs.length > 0" class="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-default px-4 py-3">');

    expect(foot).toBeGreaterThan(source.indexOf('class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3"'));
    expect(source.indexOf('v-for="verb in verbs"')).toBeGreaterThan(foot);
  });

  test("lay a builder turn's JSON answer out rather than show the text", () => {
    expect(source).toContain('<BuilderResult v-if="builderRead !== null" :read="builderRead" :text="task.result"');
    expect(source).toContain('task.value?.role === "builder" ? readBuilderResult(shownResult.value) : null');
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
  test("is a state toggle at the right end of the row the body's tabs stand on", () => {
    const row = source.indexOf('<div v-if="task" :class="[\'flex h-10 shrink-0 items-center gap-2 px-4\', TAB_ROW_LINE]">');

    expect(row).toBeGreaterThan(-1);
    expect(source.indexOf("<USwitch")).toBeGreaterThan(row);
    expect(source).toContain(':model-value="translated"');
    expect(source).toContain('class="ms-auto flex shrink-0 items-center gap-2"');
  });

  test("names the language it would put the text into, and only the translation word where the screen is narrow", () => {
    expect(source).toContain('narrow.value || translation.target.value === null ? t("todo.label.translation") : t("documents.label.translation_of", { language: languageName(t, translation.target.value) })');
  });

  test("goes through the translator the document viewer uses, per text of the open tab", () => {
    expect(source).toContain('import { useWorkTextTranslation } from "~/domain/work-translation"');
    expect(source).toContain('field: tab.value === "result" ? "result" : "instruction"');
  });

  test("is one spinning mark beside it and no count, since each part lands in the text as it is written", () => {
    expect(source).toContain(`<UTooltip v-if="translation.translating.value" :text="$t('todo.status.translating')">`);
    expect(source).toContain(`role="status" :aria-label="$t('todo.status.translating')"`);
    expect(source).toContain("animate-spin text-muted motion-reduce:animate-none");
    expect(source).not.toMatch(/todo\.status\.translating['"], \{/);
  });

  // A switch drawn as loading is a switch that cannot be pressed, and a translation runs for as long
  // as the translator takes: turning it on would lock the reader out of turning it off.
  test("never draws the switch itself as loading, so it can always be turned off again", () => {
    const at = source.indexOf("<USwitch");

    expect(at).toBeGreaterThan(-1);
    expect(source.slice(at, source.indexOf("/>", at))).not.toContain(":loading");
  });

  test("stands as the reader left it, in this dialog and on the next visit", () => {
    expect(source).toContain('const TRANSLATED_KEY = "bmo-work-translated";');
    expect(source).toContain("window.localStorage.setItem(TRANSLATED_KEY, on ? \"1\" : \"0\")");
    expect(source).toContain('translated.value = window.localStorage.getItem(TRANSLATED_KEY) === "1";');
  });

  test("is not drawn for a tab with no text to put into another language", () => {
    expect(source).toContain('v-if="translatable"');
    expect(source).toContain('const translatable = computed(() => textOfTab.value.trim() !== "");');
  });

  test("says what went wrong in one line, with the press that asks again", () => {
    expect(source).toContain("troubleLine");
    expect(source).toContain(`:label="$t('todo.action.retry_translation')"`);
    expect(source).toContain('@click="translation.retry()"');
  });

  test("leaves the original as the text the worker read, however the screen is drawn", () => {
    expect(source).toContain(':read="builderRead" :text="task.result"');
  });
});
