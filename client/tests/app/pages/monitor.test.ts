import { describe, expect, test } from "bun:test";

import { isMonitorTab, MONITOR_TABS } from "../../../apps/web/app/domain/hardware";

// The monitor screen as it ships: its machines, the card board and the logs, a tab each with the tab in the address;
// what each agent is doing now is agent management's, and the live address and the stream notice lead there
// (docs/web.md, 「Monitor screen」, 「What each agent is doing now」). These source checks hold the browser boundary to
// what the document promises; what an agent's state cell says is held by its own module tests and the agents' browser
// test.

// The sources are read where the app keeps them.
const read = async (name: string) => await Bun.file(new URL(name, new URL("../../../apps/web/app/pages/", import.meta.url))).text();
const templateOf = (source: string) => source.slice(0, source.indexOf("<script"));
const scriptOf = (source: string) => source.slice(source.indexOf("<script"));

const page = await read("./monitor/index.vue");
const live = await read("./live.vue");
const layout = await read("../layouts/default.vue");

describe("the monitor's tabs", () => {
  test("are the machines, the card board and the logs, in that order, each a value of the address", () => {
    expect(MONITOR_TABS.map((tab) => tab.value)).toEqual(["devices", "services", "logs"]);
    expect(isMonitorTab("slots")).toBe(false);
  });

  test("stand only the open one, so a tab out of sight reads nothing", () => {
    const template = templateOf(page);

    expect(template).toContain(`<MonitorDevices v-if="tab === 'devices'" />`);
    expect(template).toContain(`<CardsArbiter v-else-if="tab === 'services'" />`);
  });
});

describe("what runs now", () => {
  test("is reached from the old live address and the stream notice on agent management's agents tab", () => {
    expect(scriptOf(live)).toContain('definePageMeta({ redirect: { path: "/agents", query: { tab: "supervisors" } } });');
    expect(templateOf(layout)).toContain('to="/agents?tab=supervisors"');
    expect(layout).not.toContain("tab=slots");
  });
});
