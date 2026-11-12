import { describe, expect, test } from "bun:test";

import { isMonitorTab, MONITOR_TABS } from "../../../apps/web/app/domain/hardware";

// The monitor screen as it ships: its machines, the card board, the role slots and the logs, a tab each with the tab
// in the address, and the address the role slots once stood at sent on to their tab (docs/web.md, 「Monitor screen」,
// 「Monitor's role slots tab」). These source checks hold the browser boundary to what the document promises; what a
// tile says is held by the role slots' own module tests.

// The sources are read where the app keeps them.
const read = async (name: string) => await Bun.file(new URL(name, new URL("../../../apps/web/app/pages/", import.meta.url))).text();
const templateOf = (source: string) => source.slice(0, source.indexOf("<script"));
const scriptOf = (source: string) => source.slice(source.indexOf("<script"));

const page = await read("./monitor/index.vue");
const live = await read("./live.vue");
const board = await read("../components/RoleSlotsBoard.vue");
const tile = await read("../components/SlotTile.vue");
const stopConfirm = await read("../components/StopConfirm.vue");

describe("the monitor's tabs", () => {
  test("are the machines, the card board, the role slots and the logs, in that order, each a value of the address", () => {
    expect(MONITOR_TABS.map((tab) => tab.value)).toEqual(["devices", "services", "slots", "logs"]);
    expect(isMonitorTab("slots")).toBe(true);
    expect(isMonitorTab("space")).toBe(false);
  });

  test("stand only the open one, so a tab out of sight reads nothing", () => {
    const template = templateOf(page);

    expect(template).toContain(`<MonitorDevices v-if="tab === 'devices'" />`);
    expect(template).toContain(`<CardsArbiter v-else-if="tab === 'services'" />`);
    expect(template).toContain(`<RoleSlotsBoard v-else-if="tab === 'slots'" />`);
  });

  test("take an old link to the live status address to the role slots", () => {
    expect(scriptOf(live)).toContain('definePageMeta({ redirect: { path: "/monitor", query: { tab: "slots" } } });');
  });
});

describe("the role slots tab", () => {
  test("reads the slots on its own clock while it stands and is seen, and ticks its tiles' times itself", () => {
    const script = scriptOf(board);

    expect(script).toContain('await $fetch<SlotBoard>("/api/slots")');
    expect(script).toContain('if (document.visibilityState === "visible") void load();');
    expect(script).toContain("const POLL_MS = 3_000;");
    expect(script).toContain("now.value = Date.now();");
    expect(templateOf(board)).toContain('<SlotTile :tile="tile" :now="now"');
  });

  test("never repeats the tab's own name as a heading over the board", () => {
    expect(templateOf(board)).not.toContain("<h2");
  });
});

describe("the stop on a working tile", () => {
  test("is asked again under the row it was pressed in", () => {
    const confirm = templateOf(stopConfirm);

    expect(stopConfirm).toContain("live.message.stop_confirm_default");
    expect(confirm).toContain(':loading="props.stops.isSending(props.target)"');
    // A tile asked to stop and not yet seen gone reads as stopping, which is what the verb answers.
    expect(templateOf(board)).not.toContain("live.status.stopping");
    expect(templateOf(tile)).toContain(":label=\"$t('live.status.stopping')\"");
    expect(templateOf(board)).toContain("<StopConfirm");
  });

  test("keeps a refusal on its own row", () => {
    expect(templateOf(stopConfirm)).toContain('role="alert"');
    expect(templateOf(stopConfirm)).toContain("props.stops.errorOf(props.target)");
  });

  test("is the stop of the item the tile's run is a job of", () => {
    expect(templateOf(tile)).toContain("$t('live.aria.stop_named', { name: caption })");
    expect(scriptOf(tile)).toContain("props.tile.run?.stop");
    expect(templateOf(board)).toContain(`:question="$t('live.message.stop_confirm')"`);
  });
});
