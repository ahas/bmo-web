import type { PlanStep } from "./tool-view";
import type { Translate } from "#shared/wording";

// The progress stepper's own vocabulary: the states a stage stands in and the dot each wears. What a stage is — a work
// order's step, a step of a worker's plan — and the words for its state are the place's; the dots are the same wherever
// a stepper stands (docs/web.md, 「The progress stepper」).

export type StepState = "pending" | "running" | "done" | "failed" | "skipped" | "unended";

export interface StepLook {
  icon: string;
  // The colour the mark is drawn in.
  tone: string;
  // Whether the mark turns, which only a step at work does.
  spins: boolean;
}

const STEP_LOOKS: Record<StepState, StepLook> = {
  pending: { icon: "i-material-symbols-radio-button-unchecked", tone: "text-muted", spins: false },
  running: { icon: "i-material-symbols-progress-activity", tone: "text-primary", spins: true },
  done: { icon: "i-material-symbols-check-circle-outline-rounded", tone: "text-success", spins: false },
  failed: { icon: "i-material-symbols-cancel-outline-rounded", tone: "text-error", spins: false },
  skipped: { icon: "i-material-symbols-block", tone: "text-dimmed", spins: false },
  unended: { icon: "i-material-symbols-pending-outline", tone: "text-muted", spins: false }
};

export function stepLook(state: StepState): StepLook {
  return STEP_LOOKS[state];
}

// One stage as the stepper draws it (docs/web.md, 「The progress stepper」): its dot, its title, its owner, its model
// and how long it ran, and the sub-stages a stage of several tasks holds. The place hands the words; the dots are the
// stepper's.
export interface Stage {
  key: string;
  state: StepState;
  // The state in the place's own words, said for a reader who cannot see the dot.
  stateLabel: string;
  title: string;
  // The co-worker role, or the worker for a plan's step; empty where the place has none to say.
  owner: string;
  model: string;
  // How long it ran, in seconds, counting a running stage to now; null for one not begun or one with no time.
  seconds: number | null;
  subs: Stage[];
}

// A plan step's state in the place's words, the work order's own words for a task's.
const PLAN_LABELS = { pending: "todo.label.task_pending", running: "todo.label.task_running", done: "todo.label.task_done" } as const;

/** The steps of a plan a session laid out with its plan tool, as stages of the stepper owned by the one who laid it. */
export function planStages(t: Translate, steps: readonly PlanStep[], owner: string): Stage[] {
  return steps.map((step, index) => ({
    key: `plan-${index}`,
    state: step.state,
    stateLabel: t(PLAN_LABELS[step.state]),
    title: step.title,
    owner,
    model: "",
    seconds: null,
    subs: []
  }));
}
