import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { computed, createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";

import { appFile } from "../../support/render-page";
import { stepLook } from "../../../apps/web/app/domain/stepper";

import type { Component } from "vue";
import type { Stage } from "../../../apps/web/app/domain/stepper";

// The one vertical stepper work progress is read on (docs/web.md, 「The progress stepper」): a stage a step, with its
// dot, title, owner, model and time, a stage of several tasks holding them as sub-stages, and no body that folds. The
// component is rendered as the server renders it, with the library's stepper and icon stood in for; where it stands
// is read off the files that ship.

Object.assign(globalThis, { computed });

const read = async (path: string): Promise<string> => Bun.file(new URL(path, import.meta.url)).text();
const logView = await read("../../../apps/web/app/components/AgentLogView.vue");
const workView = await read("../../../apps/web/app/components/WorkView.vue");
const workOrder = await read("../../../apps/web/app/components/WorkOrderPanel.vue");
const Stepper = ((await import(appFile("components", "StageStepper.vue"))) as { default: Component }).default;

// The library's stepper draws every item's indicator, title and description slots, as the library's does.
const UStepper = defineComponent({
  props: { items: { type: Array, required: true } },
  setup(props, { slots }) {
    return () =>
      h(
        "ol",
        (props.items as { value: string }[]).map((item) =>
          h("li", { "data-item": item.value }, [slots.indicator?.({ item }), slots.title?.({ item }), slots.description?.({ item })])
        )
      );
  }
});
const UIcon = defineComponent({
  props: { name: { type: String, required: true } },
  setup(props) {
    return () => h("i", { "data-icon": props.name });
  }
});

const sub = (key: string, state: Stage["state"]): Stage => ({ key, state, stateLabel: `state-${state}`, title: `sub-${key}`, owner: "scout", model: "model-a", seconds: 5, rejections: 0, subs: [] });
const STAGES: Stage[] = [
  { key: "a", state: "done", stateLabel: "state-done", title: "stage-a", owner: "scout", model: "model-a", seconds: 75, rejections: 0, subs: [sub("a1", "done"), sub("a2", "done")] },
  { key: "b", state: "running", stateLabel: "state-running", title: "stage-b", owner: "builder", model: "model-b", seconds: 3, rejections: 2, subs: [] },
  { key: "c", state: "pending", stateLabel: "state-pending", title: "stage-c", owner: "builder", model: "", seconds: null, rejections: 0, subs: [] }
];

beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

async function render(stages: readonly Stage[]): Promise<HTMLElement> {
  const app = createSSRApp({ render: () => h(Stepper, { stages, label: "stages-label" }) });

  app.component("UStepper", UStepper);
  app.component("UIcon", UIcon);
  app.component("UBadge", defineComponent({ props: { label: String }, setup: (props) => () => h("span", { "data-stage-rejections": "" }, props.label) }));
  app.config.globalProperties.$t = ((key: string, values?: Record<string, unknown>) =>
    values === undefined ? key : `${key}${JSON.stringify(values)}`) as unknown as typeof app.config.globalProperties.$t;

  const holder = document.createElement("div");

  holder.innerHTML = await renderToString(app);

  return holder;
}

describe("the stage stepper", () => {
  test("a stage wears its state's dot, its title, its owner, its model and its time", async () => {
    const shown = await render(STAGES);
    const items = [...shown.querySelectorAll("[data-item]")];

    expect(items.map((item) => item.getAttribute("data-item"))).toEqual(["a", "b", "c"]);
    expect(items.map((item) => item.querySelector("i")?.getAttribute("data-icon"))).toEqual(STAGES.map((stage) => stepLook(stage.state).icon));
    expect(items[0]!.textContent).toContain("stage-a");
    expect(items[0]!.textContent).toContain("scout · model-a");
    expect(items[1]!.querySelector("[data-stage]")?.getAttribute("data-stage")).toBe("running");
    // A stage not begun carries no time.
    expect(items[2]!.querySelector(".tabular-nums")).toBeNull();
  });

  test("a stage its review sent back says how many times, and one never sent back says nothing", async () => {
    const shown = await render(STAGES);

    expect(shown.querySelector('[data-item="b"] [data-stage-rejections]')?.textContent).toBe('todo.label.step_rejections{"n":2}');
    expect(shown.querySelector('[data-item="a"] [data-stage-rejections]')).toBeNull();
  });

  test("a stage of several tasks holds them as sub-stages, each pressable on its own", async () => {
    const shown = await render(STAGES);
    const subs = [...shown.querySelectorAll('[data-item="a"] [data-substage]')];

    expect(subs.map((one) => one.textContent?.includes("sub-a"))).toEqual([true, true]);
    expect(shown.querySelectorAll("[data-substage]").length).toBe(2);
  });

  test("no stage folds and none has a body", async () => {
    const shown = await render(STAGES);

    expect(shown.querySelector("[aria-expanded]")).toBeNull();
    expect(shown.querySelector("[data-collapsible]")).toBeNull();
  });

  test("stands in a work order and in the work view, and a log is no stepper", () => {
    expect(workOrder).toContain('<StageStepper class="mt-2" :stages="stages"');
    expect(workView).toContain("<StageStepper :stages=\"stages\"");
    expect(logView).not.toContain("Stepper");
  });
});
