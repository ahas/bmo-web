import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { defineComponent, h } from "vue";

import { wording } from "../../../apps/web/shared/wording";
import { appFile, renderPage } from "../../support/render-page";

import { SCREENS } from "../../../apps/web/app/domain/screens";

import type { Component } from "vue";

// The screens of units not yet split stand as placeholders (docs/boundary.md, 「Screens of units not yet
// split」): each has its entry and its route, and its page says, from the pack, that the feature is not
// available in this console, under the screen's own name.

const PLACEHOLDERS = SCREENS.filter((screen) => screen.placeholder === true);

// Nuxt UI's components, stood in for by plain elements that keep what the page hands them.
const NUXT_UI: Record<string, Component> = {
  UDashboardPanel: defineComponent({
    props: { id: String },
    setup: (props, { slots }) => () => h("section", { id: props.id }, [slots.header?.(), slots.body?.()])
  }),
  UDashboardNavbar: defineComponent({
    props: { title: String, icon: String },
    setup: (props) => () => h("header", { "data-icon": props.icon }, props.title)
  }),
  UIcon: defineComponent({
    props: { name: String },
    setup: (props) => () => h("span", { "data-icon": props.name })
  })
};

const placeholder = ((await import(appFile("components", "ScreenPlaceholder.vue"))) as { default: Component }).default;

// The page a screen's address lands on: its own file, or the catch-all below it where the screen's pages
// stood below its address as well.
function pageOf(to: string, nested: boolean): string {
  return nested ? appFile("pages", to.slice(1), "[...path].vue") : appFile("pages", `${to.slice(1)}.vue`);
}

test("every unit not yet split stands as a placeholder", () => {
  expect(PLACEHOLDERS.map((screen) => screen.to)).toEqual(["/graph", "/gates", "/briefing"]);
});

describe.each(PLACEHOLDERS.map((screen) => [screen.to, screen] as const))("the placeholder at %s", (_to, screen) => {
  const page = pageOf(screen.to, screen.nested);

  test("has a page of its own", () => {
    expect(existsSync(page)).toBe(true);
  });

  test("renders the screen's name and icon and says the feature is not available", async () => {
    const html = await renderPage(page, { ...NUXT_UI, ScreenPlaceholder: placeholder }, (key) => wording(key));

    expect(html).toContain(`<header data-icon="${screen.icon}">${wording(screen.label)}</header>`);
    expect(html).toContain(wording("screens.message.not_available"));
    expect(html).toContain(`id="placeholder-${screen.to.slice(1)}"`);
  });
});
