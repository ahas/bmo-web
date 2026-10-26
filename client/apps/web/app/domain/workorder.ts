import { valueText } from "./value-text";
import { progressText } from "./numbers";
import { stepLook } from "./stepper";
import { runSeconds, taskRun, taskStartSeconds } from "#shared/work-time";
import type { WorkRun } from "#shared/work-time";
import { ranModel, ranModelText } from "#shared/ran-model";
import type { WorkOrder, WorkTask } from "#shared/types";
import type { Stage } from "./stepper";
import type { WorkOrderView } from "#shared/types";
import type { Translate } from "#shared/wording";

// How a work order's parts are named on the screen. The panel lists the tasks and a dialog reads
// one of them whole, and both say the same words about the same task — so the words are here
// rather than in either of them. `taskLabel` holds the key of each state's word.

export const taskLabel: Record<WorkTask["state"], string> = {
  pending: "todo.label.task_pending",
  running: "todo.label.task_running",
  done: "todo.label.task_done",
  failed: "todo.label.task_failed",
  skipped: "todo.label.task_skipped"
};

// The name a plan gave one task. A task no plan named — a build task written as a bare
// instruction, a round read back off its job rows — takes the name of the group it stands in, so
// the line never opens on nothing.
export function taskTitle(task: WorkTask | null, fallback = ""): string {
  return task?.title?.trim() || fallback.trim();
}

// A task's first line: what became of it, what role ran it, and what it is called. The three are
// one line because they are one item — the name standing apart from the state left the reader
// joining them up by eye, and four branches of one stage differ in nothing but the name.
export function taskHeading(t: Translate, task: WorkTask | null, fallback = ""): string {
  if (task === null) {
    return "";
  }

  const title = taskTitle(task, fallback);

  return `${t(taskLabel[task.state])} · ${task.role}${title === "" ? "" : ` · ${title}`}`;
}

// The left of a task's second line: which provider and model ran it, read as every surface reads it
// (`ran-model.ts`), and how many times it has gone out. A task on its first round wears no number —
// every task has one, so writing it says nothing, and "attempt" said of a task nothing went wrong with
// reads as a failure. The model is short, and whole where `whole` asks for the line's tooltip.
export function taskModelLine(t: Translate, task: WorkTask | null, whole = false): string {
  if (task === null) {
    return "";
  }

  const model = taskModel(task, whole);

  return task.attempt > 1 ? t("todo.label.model_round", { model, n: task.attempt }) : model;
}

// The provider and model a task went out on, short, or whole where `whole` asks for its tooltip.
function taskModel(task: WorkTask, whole: boolean): string {
  return ranModelText(ranModel(task.model, task.ranOn), !whole);
}

// The right of it: where the task stands among the tasks of its group. It is kept apart from the
// model rather than joined to it by a space, because a model name ending in digits — a dated Claude
// name — and a place beginning with one read as a single number when nothing but a space divides
// them. A task standing alone in its group has no place: 1 / 1 is not one.
export function taskPlace(index: number, total: number): string {
  return total > 1 ? `${index} / ${total}` : "";
}

// A task wears the mark the progress stepper gives its state, so a task in the step dialog and the step
// on the stepper read alike.
export function taskStateIcon(state: WorkTask["state"] | undefined): string {
  return stepLook(state ?? "pending").icon;
}

// The step verbs a task's dialog offers, by the task's state and the order's status alone. Which of
// them the order's phase allows — a stage not yet reached, a running builder, an earlier round — is
// the bot's to judge, so the screen keeps no second copy of those rules and shows the bot's refusal
// instead (docs/work-orders.md 「The verbs」).
export type TaskVerb = "edit" | "skip" | "restore" | "rerun";

export function taskVerbs(t: Translate, task: WorkTask, status: WorkOrder["status"]): { action: TaskVerb; label: string }[] {
  const underWay = status === "active" || status === "paused";
  const verbs: { action: TaskVerb; label: string }[] = [];

  if (underWay && (task.state === "pending" || task.state === "failed" || task.state === "skipped")) {
    verbs.push({ action: "edit", label: t("todo.action.task_edit") });
  }

  if (task.state === "done" || (underWay && task.state !== "skipped")) {
    verbs.push({ action: "skip", label: t("todo.action.task_skip") });
  }

  if (task.state === "skipped") {
    verbs.push({ action: "restore", label: t("todo.action.task_restore") });
  }

  if (underWay && (task.state === "done" || task.state === "failed" || task.state === "skipped")) {
    verbs.push({ action: "rerun", label: t("todo.action.task_rerun") });
  }

  return verbs;
}

// How far an order has come on the panel's progress line: what was done and what was decided
// against are counted apart, because a skipped task read as a done one makes the record say
// something that did not happen.
export function taskCounts(tasks: WorkTask[]): { done: number; skipped: number; total: number } {
  return {
    done: tasks.filter(task => task.state === "done").length,
    skipped: tasks.filter(task => task.state === "skipped").length,
    total: tasks.length
  };
}

// One step of the procedure as the panel lists it: the plan, a stage of branches, the synthesis, a
// build task, the final turn, or an earlier round. A stage is one step however many tasks it runs.
export interface WorkStep {
  key: string;
  // What kind of step it is, by its name (docs/work-orders.md 「What a step is called」): a build
  // step with which of the build steps it is. An earlier round, standing for a whole run, has none.
  name: string;
  title: string;
  tasks: WorkTask[];
  state: WorkTask["state"];
  // When the step began and ended, in unix seconds; an end only once every started task has one.
  start: number | null;
  end: number | null;
  // Each of the step's tasks that ran, as the stretch it was running for.
  runs: WorkRun[];
}

// A step's state, from its tasks: at work while any runs, failed while any failed, waiting while
// none has begun, skipped when all were skipped, done otherwise.
export function stepState(tasks: readonly WorkTask[]): WorkTask["state"] {
  const states = new Set(tasks.map((task) => task.state));

  if (states.has("running")) return "running";
  if (states.has("failed")) return "failed";
  if (tasks.every((task) => task.state === "skipped")) return "skipped";
  if (states.has("pending")) return tasks.some((task) => task.state === "done") ? "running" : "pending";

  return "done";
}

function stepOf(key: string, name: string, title: string, tasks: WorkTask[], ended: Readonly<Record<string, number>>): WorkStep {
  const starts = tasks.map(taskStartSeconds).filter((at): at is number => at !== null);
  const started = tasks.filter((task) => taskStartSeconds(task) !== null);
  const ends = started.map((task) => ended[task.id]);
  const state = stepState(tasks);
  const settled = state !== "running" && state !== "pending";

  return {
    key,
    name,
    title,
    tasks,
    state,
    start: starts.length === 0 ? null : Math.min(...starts),
    end: settled && ends.length > 0 && ends.every((at) => at !== undefined) ? Math.max(...(ends as number[])) : null,
    runs: tasks.flatMap((task) => {
      const run = taskRun(task, ended);

      return run === null ? [] : [run];
    })
  };
}

// A stage's name by the kind its plan gave it; one given none finds things out.
function stageName(t: Translate, stage: WorkOrder["stages"][number] | undefined): string {
  return t(stage?.kind === "review" ? "todo.label.step_review" : "todo.label.step_investigate");
}

// The name of a control turn the order has moved into its history, read off the id the order gave
// it — the plan, the synthesis, or a final turn retired for the steps it added.
function controlName(t: Translate, id: string): string {
  if (/(^|-)plan$/.test(id)) return t("todo.label.step_plan");
  if (/(^|-)synthesis$/.test(id)) return t("todo.label.step_synthesis");
  if (/(^|-)final(-\d+)?$/.test(id)) return t("todo.label.step_final");

  return "";
}

// The name of the step the order is at, for the panel's line of how far it has come.
export function phaseName(t: Translate, order: WorkOrder): string {
  switch (order.phase) {
    case "planning":
      return t("todo.label.step_plan");
    case "research":
      return stageName(t, order.stages[order.stage]);
    case "synthesis":
      return t("todo.label.step_synthesis");
    case "implementation":
      return t("todo.label.step_build");
    default:
      return t("todo.label.step_final");
  }
}

// The order's steps in the order they ran; a step not yet begun keeps the place the plan gave it,
// after every step that has. A build step is numbered among the build steps alone.
export function workSteps(t: Translate, order: WorkOrderView): WorkStep[] {
  const ended = order.ended ?? {};
  const rounds = [...new Set(order.history.flatMap((task) => (task.round === undefined ? [] : [task.round])))];
  const builds = order.tasks.length;
  const steps = [
    ...rounds.map((round) => stepOf(`round-${round}`, "", t("todo.label.round_result", { round }), order.history.filter((task) => task.round === round), ended)),
    ...order.history.filter((task) => task.round === undefined).map((task) => stepOf(task.id, controlName(t, task.id), taskTitle(task), [task], ended)),
    ...order.stages.map((stage, index) => stepOf(`stage-${index}`, stageName(t, stage), stage.title, stage.tasks, ended)),
    ...order.tasks.map((task, index) => stepOf(task.id, t("todo.label.step_build_place", { n: index + 1, of: builds }), taskTitle(task), [task], ended)),
    ...(order.control ? [stepOf(order.control.id, t("todo.label.step_final"), taskTitle(order.control), [order.control], ended)] : [])
  ].filter((step) => step.tasks.length > 0);

  return steps
    .map((step, place) => ({ step, place }))
    .sort((one, other) => (one.step.start ?? Infinity) - (other.step.start ?? Infinity) || one.place - other.place)
    .map(({ step }) => step);
}

function distinct(values: readonly string[]): string[] {
  return [...new Set(values)];
}

// A step's first line: what became of it, what kind of step it is, every role it ran, and its title.
export function stepHeading(t: Translate, step: WorkStep): string {
  const title = step.title.trim();

  return [t(taskLabel[step.state]), step.name, ...distinct(step.tasks.map((task) => task.role)), title].filter((part) => part !== "").join(" · ");
}

// The left of a step's second line: every model it ran on, and the round where a lone task went
// out more than once; short, and whole where `whole` asks for the line's tooltip.
export function stepModelLine(t: Translate, step: WorkStep, whole = false): string {
  const only = step.tasks.length === 1 ? step.tasks[0] : undefined;

  return only === undefined ? distinct(step.tasks.map((task) => taskModel(task, whole))).join(" · ") : taskModelLine(t, only, whole);
}

// Which kinds of co-worker a step sent out, each named once.
export function stepRoles(step: WorkStep): string {
  return distinct(step.tasks.map((task) => task.role)).join(" · ");
}

// How far a step of more than one task has come.
export function stepPlace(step: WorkStep): string {
  const settled = step.tasks.filter((task) => task.state === "done" || task.state === "skipped" || task.state === "failed").length;

  return step.tasks.length > 1 ? progressText(settled, step.tasks.length) : "";
}

// How long a step ran, counting a task still going to now. Only the running counts: a stage whose
// one branch was rerun a week later took the two runs, not the week. Nothing for a step not begun,
// or one whose ends the archive no longer holds.
export function stepSeconds(step: WorkStep, now: number): number | null {
  return runSeconds(step.runs, now);
}

// How long one task took, where both ends are known.
export function taskSeconds(task: WorkTask, ended: Readonly<Record<string, number>>): number | null {
  const start = taskStartSeconds(task);
  const end = ended[task.id];

  return start === null || end === undefined ? null : end - start;
}

// The order's whole span: when it began, when it ended — null until the order is done — and how
// long it was actually running, which is every task's run merged across every step and never the
// wall clock between the two stamps. An order is paused, resumed days later, and stands waiting for
// a checkout the whole time between; that standing is not work and is counted for none.
export function orderSpan(
  steps: readonly WorkStep[],
  status: WorkOrder["status"],
  now: number
): { start: number; end: number | null; seconds: number | null } | null {
  const starts = steps.map((step) => step.start).filter((at): at is number => at !== null);

  if (starts.length === 0) {
    return null;
  }

  const start = Math.min(...starts);
  const ends = steps.map((step) => step.end).filter((at): at is number => at !== null);
  const last = ends.length === 0 ? start : Math.max(...ends);

  return { start, end: status === "done" ? last : null, seconds: runSeconds(steps.flatMap((step) => step.runs), now) };
}

// A builder turn's answer, as the task's result tab reads it. The plan and the list of things to
// build are JSON the bot parses; the tab lays them out as steps and tasks, and any other JSON as its
// fields, while the text stays exactly what the bot read.
export interface ReadPlanTask {
  title: string;
  role: string;
  model: string;
  instruction: string;
}

export interface ReadField {
  label: string;
  value: string;
  depth: number;
}

export type ReadBuilderResult =
  | { kind: "plan"; stages: { title: string; tasks: ReadPlanTask[] }[] }
  | { kind: "tasks"; tasks: ReadPlanTask[] }
  | { kind: "fields"; fields: ReadField[] };

// How deep a JSON answer is laid out before the rest is shown as it is written.
const FIELD_DEPTH_MAX = 4;

function text(value: unknown): string {
  return valueText(value);
}

function planTask(raw: unknown): ReadPlanTask {
  if (typeof raw === "string") return { title: "", role: "", model: "", instruction: raw };

  const { title, role, model, instruction } = (raw ?? {}) as Record<string, unknown>;

  return { title: text(title), role: text(role), model: text(model), instruction: text(instruction) };
}

function fieldsOf(value: unknown, label: string, depth: number, into: ReadField[]): void {
  if (value !== null && typeof value === "object" && depth < FIELD_DEPTH_MAX) {
    if (label !== "") into.push({ label, value: "", depth });

    const entries = Array.isArray(value) ? value.map((one, at) => [String(at + 1), one] as const) : Object.entries(value);

    for (const [key, one] of entries) fieldsOf(one, key, label === "" ? depth : depth + 1, into);

    return;
  }

  into.push({ label, value: valueText(value), depth });
}

// The answer read as JSON, a fenced block around it allowed; null where it is prose.
export function readBuilderResult(result: string | null): ReadBuilderResult | null {
  const trimmed = (result ?? "").trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");

  if (!trimmed.startsWith("{")) return null;

  let data: unknown;

  try {
    data = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;

  const { stages, tasks } = data as { stages?: unknown; tasks?: unknown };

  if (Array.isArray(stages)) {
    return {
      kind: "plan",
      stages: stages.map((stage) => {
        const { title, tasks: inner } = (stage ?? {}) as { title?: unknown; tasks?: unknown };

        return { title: text(title), tasks: Array.isArray(inner) ? inner.map(planTask) : [] };
      })
    };
  }

  if (Array.isArray(tasks) && Object.keys(data).length === 1) return { kind: "tasks", tasks: tasks.map(planTask) };

  const fields: ReadField[] = [];

  fieldsOf(data, "", 0, fields);

  return { kind: "fields", fields };
}

// How long one task has run, counting a running one to now.
function taskRunSeconds(task: WorkTask, ended: Readonly<Record<string, number>>, now: number): number | null {
  const run = taskRun(task, ended);

  return run === null ? null : runSeconds([run], now);
}

/** The key a task stands under as a sub-stage of its step. */
export function taskStageKey(step: WorkStep, task: WorkTask): string {
  return `${step.key}::${task.id}`;
}

/** A work order's steps as the stepper stands them (docs/web.md, 「The progress stepper」): a stage a step, its dot,
 * its name and title, its co-worker roles, the models it ran on and how long it ran, counting a running one to now;
 * a step of several tasks holds them as its sub-stages. */
export function workStages(t: Translate, steps: readonly WorkStep[], ended: Readonly<Record<string, number>>, now: number): Stage[] {
  return steps.map((step) => ({
    key: step.key,
    state: step.state,
    stateLabel: t(taskLabel[step.state]),
    title: [step.name, step.title.trim()].filter((part) => part !== "").join(" · ") || stepRoles(step),
    owner: stepRoles(step),
    model: stepModelLine(t, step),
    seconds: stepSeconds(step, now),
    subs:
      step.tasks.length > 1
        ? step.tasks.map((task, index) => ({
            key: taskStageKey(step, task),
            state: task.state,
            stateLabel: t(taskLabel[task.state]),
            title: taskTitle(task, `${index + 1}`),
            owner: task.role,
            model: taskModelLine(t, task),
            seconds: taskRunSeconds(task, ended, now),
            subs: []
          }))
        : []
  }));
}
