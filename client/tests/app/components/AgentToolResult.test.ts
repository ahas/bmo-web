import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { computed, createSSRApp, defineComponent, h, inject, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from "vue";
import { renderToString } from "vue/server-renderer";

import { appFile } from "../../support/render-page";

import type { Component } from "vue";

// A call's result under its command (docs/web.md, 「A tool call」): its first five lines always stand, and the lines past
// them are not drawn at all until the press under them spreads them, so a result of tens of thousands of lines costs
// the log's opening no more than five. The component is rendered as the server renders it, with the library's button
// and the app's own composables stood in for.

Object.assign(globalThis, { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch, useColorMode: () => ref("light") });

const Result = ((await import(appFile("components", "AgentToolResult.vue"))) as { default: Component }).default;

const UButton = defineComponent({
  props: { label: { type: String, required: true } },
  setup(props) {
    return () => h("button", { type: "button", "data-result-press": "" }, props.label);
  }
});

// A result of twenty thousand numbered lines, each told apart from the others by its number.
const LINES = Array.from({ length: 20_000 }, (_, index) => `result line ${index + 1}`);

beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

async function render(text: string): Promise<HTMLElement> {
  const app = createSSRApp({ render: () => h(Result, { text, look: { kind: "plain" } }) });

  app.component("UButton", UButton);
  // The press's words carry the count it was handed, so what it says is read without the pack.
  Object.assign(app.config.globalProperties, { $t: (key: string, named?: { n?: string }) => (named?.n === undefined ? key : `${key} ${named.n}`) });

  const holder = document.createElement("div");

  holder.innerHTML = await renderToString(app);

  return holder;
}

describe("a long tool result", () => {
  test("draws its first five lines alone until it is spread, the press saying how many are hidden", async () => {
    const shown = await render(LINES.join("\n"));
    const text = shown.querySelector("[data-tool-result] pre")?.textContent ?? "";

    expect(text.split("\n")).toEqual(LINES.slice(0, 5));
    expect(shown.innerHTML).not.toContain("result line 6\n");
    expect(shown.innerHTML.length).toBeLessThan(2_000);
    expect(shown.querySelector("[data-result-press]")?.textContent).toContain("19,995");
  });

  test("a result of a few lines tens of thousands of characters long draws its first thousand characters alone", async () => {
    const long = ["a".repeat(30_000), "b".repeat(30_000), "c".repeat(30_000)];
    const shown = await render(long.join("\n"));
    const text = shown.querySelector("[data-tool-result] pre")?.textContent ?? "";

    expect(text).toBe("a".repeat(1_000));
    expect(shown.innerHTML).not.toContain("bbb");
    expect(shown.innerHTML.length).toBeLessThan(2_000);
    expect(shown.querySelector("[data-result-press]")?.textContent).toContain("3");
  });

  test("a result of five lines or fewer stands whole, with no press", async () => {
    const shown = await render(LINES.slice(0, 5).join("\n"));

    expect(shown.querySelector("[data-tool-result] pre")?.textContent).toBe(LINES.slice(0, 5).join("\n"));
    expect(shown.querySelector("[data-result-press]")).toBeNull();
  });
});
