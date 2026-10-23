import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createSSRApp, defineComponent, h, ref, watch } from "vue";
import { renderToString } from "vue/server-renderer";

import { appFile } from "../../support/render-page";
import { stepFolds, stepLook } from "../../../apps/web/app/domain/stepper";

import type { Component } from "vue";
import type { StepperStep } from "../../../apps/web/app/domain/stepper";

// The one vertical stepper work progress is read on (docs/web.md, 「The progress stepper」): a TODO item's
// work order, an agent's log on its screen and in the log dialog. The component is rendered as the server
// renders it, compiled by the support's single-file loader, with the library's collapsible and icon stood
// in for; the three places are read off the files that ship.

// The console's auto-imported reactivity, as the component reads it.
Object.assign(globalThis, { ref, watch });

const read = async (path: string): Promise<string> => Bun.file(new URL(path, import.meta.url)).text();
const logView = await read("../../../apps/web/app/components/AgentLogView.vue");
const logDialog = await read("../../../apps/web/app/components/AgentLogDialog.vue");
const agentPage = await read("../../../apps/web/app/pages/agents/[name].vue");
const workOrder = await read("../../../apps/web/app/components/WorkOrderPanel.vue");
const Stepper = ((await import(appFile("components", "ProgressStepper.vue"))) as { default: Component }).default;

// The collapsible draws its trigger always and its content only while open, as the library's does.
const UCollapsible = defineComponent({
  props: { open: { type: Boolean, default: false } },
  setup(props, { slots }) {
    return () => h("div", { "data-collapsible": props.open ? "open" : "closed" }, [slots.default?.(), props.open ? slots.content?.() : null]);
  }
});
const UIcon = defineComponent({
  props: { name: { type: String, required: true } },
  setup(props) {
    return () => h("i", { "data-icon": props.name });
  }
});

const STEPS: StepperStep[] = [
  { key: "a", state: "done", stateLabel: "state-done", title: "step-a", time: "time-a", open: false },
  { key: "b", state: "failed", stateLabel: "state-failed", title: "step-b", time: "", open: true },
  { key: "c", state: "running", stateLabel: "state-running", title: "step-c", time: "time-c", open: true }
];

// The rendered HTML is read through a document of its own, for this file alone.
beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

async function render(steps: readonly StepperStep[]): Promise<HTMLElement> {
  const app = createSSRApp({
    render: () => h(Stepper, { steps, label: "steps-label" }, { body: ({ step }: { step: StepperStep }) => h("p", { "data-body": step.key }, `body-${step.key}`) })
  });

  app.component("UCollapsible", UCollapsible);
  app.component("UIcon", UIcon);
  app.config.globalProperties.$t = (key: string) => key;

  const holder = document.createElement("div");

  holder.innerHTML = await renderToString(app);

  return holder;
}

describe("the stepper as it renders", () => {
  test("stands one step per stage in the order handed, under the list's name", async () => {
    const page = await render(STEPS);
    const list = page.querySelector("ol")!;

    expect(list.getAttribute("aria-label")).toBe("steps-label");
    expect([...list.children].map((step) => step.getAttribute("data-step"))).toEqual(["done", "failed", "running"]);
  });

  test("wears each state's mark in its colour, and only a running step's mark turns", async () => {
    const marks = [...(await render(STEPS)).querySelectorAll("ol > li > div:first-child i")];

    expect(marks.map((mark) => mark.getAttribute("data-icon"))).toEqual(STEPS.map((step) => stepLook(step.state).icon));
    expect(marks.map((mark) => mark.getAttribute("class")?.includes(stepLook(STEPS[marks.indexOf(mark)]!.state).tone))).toEqual([true, true, true]);
    expect(marks.map((mark) => mark.getAttribute("class")?.includes("animate-spin") ?? false)).toEqual([false, false, true]);
  });

  test("draws the rail down to the next step and none under the last", async () => {
    const rails = [...(await render(STEPS)).querySelectorAll("ol > li > div:first-child")].map((rail) => rail.querySelectorAll("span[aria-hidden]").length);

    expect(rails).toEqual([1, 1, 0]);
  });

  test("names the step, its state and its time in the head, and says which way a press folds it", async () => {
    const heads = [...(await render(STEPS)).querySelectorAll("button")];

    expect(heads.map((head) => head.getAttribute("aria-label"))).toEqual([
      "state-done · step-a common.action.expand",
      "state-failed · step-b common.action.collapse",
      "state-running · step-c common.action.collapse"
    ]);
    expect(heads[0]?.textContent).toContain("time-a");
    // A step with no time draws no time at all.
    expect(heads[1]?.querySelectorAll(".tabular-nums").length).toBe(0);
  });

  test("draws the body of an open step only", async () => {
    const bodies = [...(await render(STEPS)).querySelectorAll("[data-body]")].map((body) => body.getAttribute("data-body"));

    expect(bodies).toEqual(["b", "c"]);
  });
});

describe("which steps stand open", () => {
  test("a step is settled the first time it is seen, and only a press changes it afterwards", () => {
    const held = ref<Record<string, boolean>>({});
    const folds = stepFolds(held);

    folds.see([{ key: "a", open: true }, { key: "b", open: false }]);
    // The run ended, or a newer one arrived: what its place says of it now moves nothing.
    folds.see([{ key: "a", open: false }, { key: "b", open: true }, { key: "c", open: true }]);

    expect(folds.isOpen({ key: "a", open: false })).toBe(true);
    expect(folds.isOpen({ key: "b", open: true })).toBe(false);
    expect(folds.isOpen({ key: "c", open: false })).toBe(true);

    folds.set("a", false);

    expect(folds.isOpen({ key: "a", open: true })).toBe(false);
  });

  test("a step not seen yet stands as its place says", () => {
    const folds = stepFolds(ref({}));

    expect(folds.isOpen({ key: "x", open: true })).toBe(true);
    expect(folds.isOpen({ key: "x", open: false })).toBe(false);
  });
});

describe("the three places on the one stepper", () => {
  test("an agent's log stands its runs as steps, with each run's lines and spend in its body", () => {
    expect(logView).toContain('<ProgressStepper v-if="steps.length > 0" :steps="steps" :label="$t(\'agents.label.run_steps\')">');
    expect(logView).toContain('<template v-for="row in step.rows" :key="row.key">');
    expect(logView).toContain('<RunSpend :chip="chipOf(row)!" />');
    expect(logView).toContain("runStep(t, run, { newest: run.run === newest, atEnd: !log.newer.value, opened: run.run === opened })");
    expect(logView).not.toContain("run_boundary");
  });

  test("the agent screen and the log dialog both read that one log view", () => {
    expect(agentPage).toContain('<AgentLogView ref="view" :name="name" :place="place" :live="chatTurns" />');
    expect(logDialog).toContain('<AgentLogView :key="`${props.name}:${placeKey}`" :name="props.name" :place="props.place" />');
  });

  test("a work order stands its steps on it, a running step open, and a task of the body opens the dialog at it", () => {
    expect(workOrder).toContain('<ProgressStepper class="mt-2" :steps="stepperSteps" :label="$t(\'todo.title.coworkers\')">');
    expect(workOrder).toContain('open: step.state === "running", work: step');
    expect(workOrder).toContain('@click="open(step.work, task.id)"');
    expect(workOrder).toContain(':task-id="openedTask"');
  });

  test("each stands the stepper's own placeholder on its first read", () => {
    expect(logView).toContain("<ProgressStepSkeleton />");
    expect(logView).toContain('v-if="log.loading.value && rows.length === 0"');
    expect(workOrder).toContain("<ProgressStepSkeleton detail />");
  });

  test("an empty log's line stands in the middle of the body it is all of", () => {
    expect(logView).toContain('class="m-auto text-center text-sm text-muted">{{ $t("agents.status.no_log") }}</p>');
    expect(logView).toContain("min-h-full");
  });
});
