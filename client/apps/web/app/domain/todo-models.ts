import { onBeforeUnmount, onMounted, ref } from "vue";

import type { Ref } from "vue";
import type { TodoModelPlan } from "#shared/types";

// What a TODO row names as the model its work will go out on (docs/web.md, the TODO panel's section): each worker's own road and
// the road each running job of an item took, read from the console's own route and kept for every row to read. The
// panel asks again every few seconds, since a job's road changes while it runs, and a read that fails leaves what the
// rows already have.

// How often the plan is read again: often enough that a job's road stands within a few seconds of its starting.
const PLAN_EVERY_MS = 5_000;

const plan = ref<TodoModelPlan | null>(null);

/** The plan the TODO rows read, as the console last answered it; null before the first read. */
export function todoModelPlan(): Ref<TodoModelPlan | null> {
  return plan;
}

async function readPlan(): Promise<void> {
  try {
    plan.value = await $fetch<TodoModelPlan>("/api/todos/model-plan");
  } catch {
    // A unit that did not answer leaves the plan the rows already hold standing.
  }
}

/** Reads the plan while the screen that shows the rows stands, and again on its clock. Taken in that screen's setup. */
export function useTodoModelPlan(): Ref<TodoModelPlan | null> {
  let clock: ReturnType<typeof setInterval> | null = null;

  onMounted(() => {
    void readPlan();
    clock = setInterval(() => void readPlan(), PLAN_EVERY_MS);
  });

  onBeforeUnmount(() => {
    if (clock !== null) clearInterval(clock);

    clock = null;
  });

  return plan;
}
