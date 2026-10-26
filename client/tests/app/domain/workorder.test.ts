import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import {
  orderSpan,
  phaseName,
  readBuilderResult,
  stepHeading,
  stepModelLine,
  stepPlace,
  stepRoles,
  stepSeconds,
  stepState,
  taskCounts,
  taskHeading,
  taskLabel,
  taskModelLine,
  taskPlace,
  taskSeconds,
  taskStateIcon,
  taskTitle,
  taskVerbs,
  workSteps
} from "../../../apps/web/app/domain/workorder";

import type { WorkTask } from "../../../apps/web/shared/types";
import type { WorkOrderView } from "../../../apps/web/shared/types";
import KO from "../../fixtures/app/domain/workorder.test.ko.json";

const task = (over: Partial<WorkTask> = {}): WorkTask =>
  ({
    id: "stage-0-0",
    role: "scout",
    model: "claude-haiku-4-5-20251001",
    instruction: KO.line_35,
    state: "done",
    attempt: 1,
    ...over
  }) as WorkTask;

// One task is one item of two lines. The first says what became of it, who ran it and what it is
// called; the second says what it ran on and where it stands among the tasks beside it. The name
// and the state used to stand apart — a group heading above, a state line below — and four branches
// of one stage were then four lines saying the same three words.
describe("a task's first line", () => {
  test("says what became of it, which role ran it and what the plan called it", () => {
    expect(taskHeading(wording, task({ title: "Adversarially verify acceptance" }))).toBe(KO.line_47);
  });

  test("takes the name of the group it stands in where the plan named nothing", () => {
    expect(taskHeading(wording, task(), KO.line_51)).toBe(KO.line_51_2);
    expect(taskTitle(task({ title: "  " }), KO.line_52)).toBe(KO.line_52);
    expect(taskTitle(task({ title: "Trace the road" }), KO.line_53)).toBe("Trace the road");
  });

  test("stops at the role where there is neither", () => {
    expect(taskHeading(wording, task())).toBe(KO.line_57);
  });

  test("is nothing at all where no task is open", () => {
    expect(taskHeading(wording, null)).toBe("");
    expect(taskModelLine(wording, null)).toBe("");
  });

  test("names every state a task can be in", () => {
    expect(wording(taskLabel.pending)).toBe(KO.line_66);
    expect(wording(taskLabel.running)).toBe(KO.line_67);
    expect(wording(taskLabel.done)).toBe(KO.line_68);
    expect(wording(taskLabel.failed)).toBe(KO.line_69);
    expect(wording(taskLabel.skipped)).toBe(wording("todo.label.task_skipped"));
    expect(taskHeading(wording, task({ state: "skipped" }))).toStartWith(KO.line_71);
    expect(taskHeading(wording, task({ state: "failed" }))).toStartWith(KO.line_72);
  });
});

describe("a task's second line", () => {
  test("says the provider and model it ran on", () => {
    expect(taskModelLine(wording, task())).toBe("H45");
    // A place with room names it whole.
    expect(taskModelLine(wording, task(), true)).toBe("claude-haiku-4-5-20251001");
  });

  test("a task that fell to another road says that road, the fallback and whether its runs switched, and only the detail the one asked for", () => {
    const fallen = task({ model: "claude-code::claude-opus-5-5", ranOn: { provider: "registered", model: "flash-next-coder", changed: true } });
    const settled = task({ model: "auto", ranOn: { provider: "claude-code", model: "claude-opus-5-5", changed: false } });

    const marks = `${wording("todo.label.model_fallback")} ${wording("todo.label.model_changed")}`;

    expect(taskModelLine(wording, fallen)).toBe(`registered/flash-next-coder ${marks}`);
    expect(taskModelLine(wording, fallen, true)).toBe(`registered/flash-next-coder ${marks} ${wording("todo.label.model_requested", { model: "claude-code::claude-opus-5-5" })}`);
    expect(taskModelLine(wording, settled)).toBe("CC::O55");
    expect(taskModelLine(wording, settled, true)).toBe(`claude-code/claude-opus-5-5 ${wording("todo.label.model_requested", { model: "auto" })}`);
  });

  test("wears no number on its first round, and wears one after that", () => {
    expect(taskModelLine(wording, task({ attempt: 1 }))).not.toContain(KO.line_94);
    expect(taskModelLine(wording, task({ attempt: 2 }))).toBe(KO.line_95);
  });

  // A model name ending in digits and a place beginning with one read as a single number where
  // nothing but a space divides them, so the place is its own piece and the screen sets it apart.
  test("says where the task stands among the tasks of its group, apart from the model", () => {
    expect(taskPlace(1, 4)).toBe("1 / 4");
    expect(taskModelLine(wording, task({ attempt: 3 }))).toBe(KO.line_102);
    expect(taskModelLine(wording, task())).not.toContain("/");
  });

  test("says no place for a task standing alone, since 1 / 1 is not a place", () => {
    expect(taskPlace(1, 1)).toBe("");
    expect(taskPlace(1, 0)).toBe("");
  });
});

describe("the mark a state wears", () => {
  test("is its own for each state", () => {
    const marks = (["pending", "running", "done", "failed", "skipped"] as const).map(state => taskStateIcon(state));

    expect(new Set(marks).size).toBe(5);
    expect(taskStateIcon("skipped")).not.toBe(taskStateIcon("done"));
    expect(marks.every(mark => mark.startsWith("i-material-symbols-"))).toBe(true);
  });

  test("falls back to the waiting one where there is no task", () => {
    expect(taskStateIcon(undefined)).toBe(taskStateIcon("pending"));
  });
});

describe("the verbs a task's dialog offers", () => {
  const actions = (over: Partial<WorkTask>, status: "draft" | "active" | "paused" | "done") => taskVerbs(wording, task(over), status).map(verb => verb.action);

  test("a waiting or failed task under way can be edited and skipped, and a failed one run again", () => {
    expect(actions({ state: "pending" }, "active")).toEqual(["edit", "skip"]);
    expect(actions({ state: "failed" }, "paused")).toEqual(["edit", "skip", "rerun"]);
  });

  test("a running task offers the skip alone, which the bot refuses for a builder", () => {
    expect(actions({ state: "running" }, "active")).toEqual(["skip"]);
  });

  test("a skipped task is restored, edited or run again, and never skipped twice", () => {
    expect(actions({ state: "skipped" }, "active")).toEqual(["edit", "restore", "rerun"]);
    expect(actions({ state: "skipped" }, "done")).toEqual(["restore"]);
  });

  test("a done task can be relabelled skipped on a finished order too, and run again only while under way", () => {
    expect(actions({ state: "done" }, "active")).toEqual(["skip", "rerun"]);
    expect(actions({ state: "done" }, "done")).toEqual(["skip"]);
  });

  test("a draft offers nothing", () => {
    expect(actions({ state: "pending" }, "draft")).toEqual([]);
  });
});

describe("the progress line's counts", () => {
  test("keep done and skipped apart", () => {
    expect(taskCounts([task(), task({ state: "skipped" }), task({ state: "skipped" }), task({ state: "pending" })])).toEqual({ done: 1, skipped: 2, total: 4 });
  });
});

describe("the steps of an order", () => {
  const vote = (id: string, state: WorkTask["state"], startedAt: number | null, title: string) =>
    task({ id, role: "screener", state, startedAt, jobId: startedAt === null ? null : Number(id.slice(-1)) + 10, title });

  const order = (over: Partial<WorkOrderView> = {}): WorkOrderView =>
    ({
      status: "active",
      history: [task({ id: "plan-1", role: "builder", model: "claude-code::claude-opus-5", startedAt: 1_000_000, title: "Plan" })],
      stages: [
        {
          title: "Screen the root-cause claims",
          tasks: [vote("stage-0-0", "done", 1_100_000, "First vote"), vote("stage-0-1", "done", 1_100_000, "Second vote"), vote("stage-0-2", "running", 1_101_000, "Third vote")]
        },
        { title: "Build it", tasks: [task({ id: "stage-1-0", role: "builder", state: "pending", startedAt: null })] }
      ],
      tasks: [],
      control: null,
      ended: { "plan-1": 1_090, "stage-0-0": 1_160, "stage-0-1": 1_170 },
      ...over
    }) as WorkOrderView;

  test("a stage of several tasks is one step, named by its stage and listed in the order the steps ran", () => {
    const steps = workSteps(wording, order());

    expect(steps.map((step) => step.title)).toEqual(["Plan", "Screen the root-cause claims", "Build it"]);
    expect(steps[1]!.tasks).toHaveLength(3);
  });

  test("a step not begun keeps its place after the ones that have", () => {
    const started = order({
      stages: [
        { title: "Later", tasks: [task({ id: "stage-0-0", state: "pending", startedAt: null })] },
        { title: "Earlier", tasks: [task({ id: "stage-1-0", state: "done", startedAt: 1_050_000 })] }
      ]
    });

    expect(workSteps(wording, started).map((step) => step.title)).toEqual(["Plan", "Earlier", "Later"]);
  });

  test("reads as its state, its kind, its roles and its title, then its model, its place and its time", () => {
    const stage = workSteps(wording, order())[1]!;

    expect(stepHeading(wording, stage)).toBe([wording("todo.label.task_running"), wording("todo.label.step_investigate"), "screener", "Screen the root-cause claims"].join(" · "));
    expect(stepModelLine(wording, stage)).toBe("H45");
    expect(stepPlace(stage)).toBe("2/3 66%");
    expect(stepRoles(stage)).toBe("screener");
    expect(stepSeconds(stage, 1_200)).toBe(100);
  });

  test("a stage mixing roles names each of them once", () => {
    const mixed = workSteps(wording, order({ stages: [{ title: "Look", tasks: [task({ id: "a", role: "scout" }), task({ id: "b", role: "verifier" }), task({ id: "c", role: "scout" })] }] }));

    expect(stepHeading(wording, mixed.find((step) => step.title === "Look")!)).toBe([wording("todo.label.task_done"), wording("todo.label.step_investigate"), "scout", "verifier", "Look"].join(" · "));
  });

  test("every step wears the name of its kind, and only a build step is numbered, among the build steps", () => {
    const named = workSteps(
      wording,
      order({
        history: [
          task({ id: "plan", role: "builder", startedAt: 1_000_000 }),
          task({ id: "synthesis", role: "builder", startedAt: 1_200_000 }),
          task({ id: "final-1", role: "builder", startedAt: 1_500_000 })
        ],
        stages: [
          { title: "Find", kind: "investigate", tasks: [task({ id: "stage-0-0", startedAt: 1_100_000 })] },
          { title: "Check", kind: "review", tasks: [task({ id: "stage-1-0", startedAt: 1_150_000 })] }
        ],
        tasks: [task({ id: "build-0", role: "builder", startedAt: 1_300_000 }), task({ id: "build-1", role: "builder", startedAt: 1_400_000 })],
        control: task({ id: "final", role: "builder", state: "pending", startedAt: null })
      })
    );

    expect(named.map((step) => step.name)).toEqual([
      wording("todo.label.step_plan"),
      wording("todo.label.step_investigate"),
      wording("todo.label.step_review"),
      wording("todo.label.step_synthesis"),
      wording("todo.label.step_build_place", { n: 1, of: 2 }),
      wording("todo.label.step_build_place", { n: 2, of: 2 }),
      wording("todo.label.step_final"),
      wording("todo.label.step_final")
    ]);
  });

  test("the order's line names the step it is at", () => {
    expect(phaseName(wording, order({ phase: "planning" }))).toBe(wording("todo.label.step_plan"));
    expect(phaseName(wording, order({ phase: "research", stage: 1, stages: [{ title: "Find", kind: "investigate", tasks: [] }, { title: "Check", kind: "review", tasks: [] }] }))).toBe(wording("todo.label.step_review"));
    expect(phaseName(wording, order({ phase: "synthesis" }))).toBe(wording("todo.label.step_synthesis"));
    expect(phaseName(wording, order({ phase: "implementation" }))).toBe(wording("todo.label.step_build"));
    expect(phaseName(wording, order({ phase: "finalization" }))).toBe(wording("todo.label.step_final"));
  });

  test("a lone task's step reads as that task does and stands no place", () => {
    const plan = workSteps(wording, order())[0]!;

    expect(stepModelLine(wording, plan)).toBe("CC::O5");
    expect(stepPlace(plan)).toBe("");
    expect(stepSeconds(plan, 5_000)).toBe(90);
  });

  test("a step's state follows its tasks", () => {
    expect(stepState([task({ state: "done" }), task({ state: "failed" })])).toBe("failed");
    expect(stepState([task({ state: "skipped" }), task({ state: "skipped" })])).toBe("skipped");
    expect(stepState([task({ state: "done" }), task({ state: "skipped" })])).toBe("done");
    expect(stepState([task({ state: "pending" }), task({ state: "pending" })])).toBe("pending");
    expect(stepState([task({ state: "done" }), task({ state: "pending" })])).toBe("running");
  });

  test("a step whose end the archive does not hold says no time", () => {
    const lost = workSteps(wording, order({ ended: {} }))[0]!;

    expect(stepSeconds(lost, 5_000)).toBeNull();
  });

  test("a task's own time needs both its ends", () => {
    expect(taskSeconds(task({ id: "plan-1", startedAt: 1_000_000 }), { "plan-1": 1_090 })).toBe(90);
    expect(taskSeconds(task({ id: "plan-1", startedAt: null }), { "plan-1": 1_090 })).toBeNull();
  });

  test("the whole work stands from the first start to the last end, and counts only what ran", () => {
    const steps = workSteps(wording, order());

    // The plan ran 1_000 to 1_090 and the stage 1_100 to now; the ten seconds between them ran
    // nothing and are counted for nothing.
    expect(orderSpan(steps, "active", 1_300)).toEqual({ start: 1_000, end: null, seconds: 290 });

    const finished = workSteps(wording, order({ status: "done", stages: [], ended: { "plan-1": 1_090 } }));

    expect(orderSpan(finished, "done", 9_999)).toEqual({ start: 1_000, end: 1_090, seconds: 90 });
    expect(orderSpan([], "draft", 1)).toBeNull();
  });

  // What #285 read as 161 hours: a plan on one day, the rest of the order a week later, and the
  // week between them standing paused with nothing running.
  test("an order paused for a week counts the running and not the standing", () => {
    const week = 7 * 24 * 60 * 60;
    const paused = order({
      status: "done",
      history: [task({ id: "plan-1", role: "builder", startedAt: 1_000_000, title: "Plan" })],
      stages: [{ title: "Later", tasks: [task({ id: "stage-0-0", startedAt: (1_000 + week) * 1_000 })] }],
      ended: { "plan-1": 1_060, "stage-0-0": 1_000 + week + 120 }
    });
    const span = orderSpan(workSteps(wording, paused), "done", 9_999_999)!;

    expect(span.start).toBe(1_000);
    expect(span.end).toBe(1_000 + week + 120);
    expect(span.seconds).toBe(180);
  });

  // A branch of a stage rerun days later makes that one step span the days, so a step is counted
  // the same way the order is.
  test("a step counts its own runs merged, not the stretch its tasks are spread over", () => {
    const rerun = order({
      stages: [{
        title: "Screen",
        tasks: [vote("stage-0-0", "done", 1_100_000, "First"), vote("stage-0-1", "done", 1_100_000, "Second"), vote("stage-0-2", "done", 900_000_000, "Rerun")]
      }],
      ended: { "stage-0-0": 1_160, "stage-0-1": 1_170, "stage-0-2": 900_030 }
    });
    const step = workSteps(wording, rerun).find((one) => one.title === "Screen")!;

    expect(step.start).toBe(1_100);
    expect(stepSeconds(step, 1_000_000_000)).toBe(100);
  });

  // A step carries its tasks' runs, which is what jobs/jobs/work-time.ts then counts.
  test("a step carries a run for each task that ran and none for the rest", () => {
    const steps = workSteps(wording, order());

    expect(steps[0]!.runs).toEqual([{ from: 1_000, to: 1_090 }]);
    expect(steps[1]!.runs).toEqual([{ from: 1_100, to: 1_160 }, { from: 1_100, to: 1_170 }, { from: 1_101, to: null }]);
    expect(steps[2]!.runs).toEqual([]);
  });
});

describe("a builder turn's answer", () => {
  test("lays a plan out as steps and their tasks", () => {
    const plan = readBuilderResult('```json\n{"stages":[{"title":"Survey","tasks":[{"title":"Map","role":"scout","model":null,"instruction":"Find it"}]}]}\n```');

    expect(plan).toEqual({ kind: "plan", stages: [{ title: "Survey", tasks: [{ title: "Map", role: "scout", model: "", instruction: "Find it" }] }] });
  });

  test("lays a list of things to build out as tasks", () => {
    expect(readBuilderResult('{"tasks":[{"title":"Commit","instruction":"Do it"},"Plain"]}')).toEqual({
      kind: "tasks",
      tasks: [
        { title: "Commit", role: "", model: "", instruction: "Do it" },
        { title: "", role: "", model: "", instruction: "Plain" }
      ]
    });
  });

  test("lays any other JSON out as its fields, and leaves prose alone", () => {
    expect(readBuilderResult('{"result":"done","verification":{"typecheck":"pass","tests":[1,2]}}')).toEqual({
      kind: "fields",
      fields: [
        { label: "result", value: "done", depth: 0 },
        { label: "verification", value: "", depth: 0 },
        { label: "typecheck", value: "pass", depth: 1 },
        { label: "tests", value: "", depth: 1 },
        { label: "1", value: "1", depth: 2 },
        { label: "2", value: "2", depth: 2 }
      ]
    });
    expect(readBuilderResult("Done. {not json}")).toBeNull();
    expect(readBuilderResult("{broken")).toBeNull();
    expect(readBuilderResult(null)).toBeNull();
  });
});
