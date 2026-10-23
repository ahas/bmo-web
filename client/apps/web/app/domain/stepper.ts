import type { Ref } from "vue";

// The progress stepper's own vocabulary: the states a step stands in, the mark each wears, and which
// steps stand open. What a step is — a work order's stage, a run of an agent's log — and the words for
// its state are the place's; the marks and the folding are the same wherever a stepper stands
// (docs/web.md, 「The progress stepper」).

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

// One step as the stepper draws it. The place hands what its head says and whether it stands open
// when it first appears; the body is the place's own slot.
export interface StepperStep {
  key: string;
  state: StepState;
  // The state in the place's own words, said for a reader who cannot see the mark.
  stateLabel: string;
  title: string;
  // The time at the head's right end; empty where the step has none to say.
  time: string;
  // Whether the step stands open the first time it appears. After that only a press changes it.
  open: boolean;
}

// Which steps stand open. A step is settled open or folded the first time it is seen, from what its
// place said of it then, and only a press changes it afterwards: a step that ends while it is read stays
// open, and a step arriving folds nothing.
export interface StepFolds {
  isOpen: (step: Pick<StepperStep, "key" | "open">) => boolean;
  set: (key: string, open: boolean) => void;
  // Settles every step not seen before.
  see: (steps: readonly Pick<StepperStep, "key" | "open">[]) => void;
}

export function stepFolds(held: Ref<Record<string, boolean>>): StepFolds {
  return {
    isOpen: (step) => held.value[step.key] ?? step.open,
    set: (key, open) => {
      held.value = { ...held.value, [key]: open };
    },
    see: (steps) => {
      const unseen = steps.filter((step) => !(step.key in held.value));

      if (unseen.length > 0) {
        held.value = { ...held.value, ...Object.fromEntries(unseen.map((step) => [step.key, step.open])) };
      }
    }
  };
}
