import { describe, expect, test } from "bun:test";

import { packEntries } from "../../../apps/web/shared/wording";
import KO from "../../fixtures/app/pages/live.test.ko.json";

// The keys whose words carry a phrase, so a check that a screen never says it reads the keys.
const keysSaying = (phrase: string) => packEntries().filter(([, value]) => value.includes(phrase)).map(([key]) => key);

// The live status screen as it ships: the agents' space and the role slots, a tab each, the tab in the address, and
// both drawn whether they stand or not. These source checks hold the browser boundary to what docs/web.md promises;
// what the space draws is held by the tests of its own modules.

// The sources are read where the app keeps them.
const read = async (name: string) => await Bun.file(new URL(name, new URL("../../../apps/web/app/pages/", import.meta.url))).text();
const templateOf = (source: string) => source.slice(0, source.indexOf("<script"));
const scriptOf = (source: string) => source.slice(source.indexOf("<script"));

const page = await read("./live.vue");
const pool = await read("../components/RoleSlotsBoard.vue");
const space = await read("../components/AgentSpace.vue");
const tile = await read("../components/SlotTile.vue");
const stopConfirm = await read("../components/StopConfirm.vue");

describe("the board's sections", () => {
  test("stand as tabs kept in the address, on the console's own tab row", () => {
    expect(templateOf(page)).toContain("<UTabs");
    expect(templateOf(page)).toContain(':ui="TAB_ROW_UI"');
    expect(templateOf(page)).toContain("TAB_ROW_LINE");
    expect(scriptOf(page)).toContain("route.query.tab");
    expect(scriptOf(page)).toContain("router.push({ query: { ...route.query, tab:");
    // The row is read by the console search too, so the sections are the screen's own list.
    expect(scriptOf(page)).toContain("LIVE_TABS");
  });

  test("are drawn every one of them and shown one at a time, so none of them starts over when opened", () => {
    const template = templateOf(page);

    for (const one of ["v-show=\"tab === 'space'\"", "v-show=\"tab === 'slots'\""]) {
      expect(template).toContain(one);
    }
    // A section taken down would take its reading down with it, and put a skeleton back on return.
    expect(template).not.toContain("v-if=\"tab === ");
    expect(template).toContain("<RoleSlotsBoard :now=");
    // The space is the screen's own address, and out of sight it neither reads nor draws.
    expect(template).toContain(`<AgentSpace ref="spaceRef" :now="now * 1000" :rooms="rooms" :shown="tab === 'space'" />`);
    expect(scriptOf(page)).toContain('isLiveTab(route.query.tab) ? route.query.tab : "space"');
    expect(scriptOf(space)).toContain("if (props.shown && document.visibilityState === \"visible\") void load();");
    expect(scriptOf(space)).toContain("if (!props.shown || box === null || plan === null");
    // The tabs the gates, the runners, the job workers and the transport records stood in are gone.
    for (const gone of ["group.key", "status.executions", "recent[", "running["]) expect(template).not.toContain(gone);
  });

  test("never repeat the tab's own name as a heading over the section", () => {
    for (const source of [templateOf(page), templateOf(pool)]) {
      expect(source).not.toContain("<h2");
    }
  });

  test("carry no filter of their own any more: the address is where the choice lives", () => {
    expect(page).not.toContain("useStatusFilter");
    expect(page).not.toContain("STATUS_FILTERS");
    for (const key of keysSaying(KO.line_54)) {
      expect(page).not.toContain(key);
    }
  });
});

// The owner: "Set up a route that can stop the work of every agent that is working, you included"
// and "Build the feature into the UI too". The stop button stands on every row that names a stop,
// whichever section it is in, and on a co-worker tile it is aimed at the run that tile works inside.
describe("the space", () => {
  test("is one canvas drawn in code, read as its counts and walked as a list of its agents", () => {
    const template = templateOf(space);

    expect(template).toContain('role="img"');
    expect(template).toContain(':aria-label="summary"');
    expect(template).toContain(`<ul class="sr-only" :aria-label="$t('live.aria.space_agents')">`);
    // No picture file is loaded: everything is filled from boxes.
    expect(space).not.toContain("<img");
    expect(space).not.toContain("new Image(");
    expect(scriptOf(space)).toContain("for (const face of faces(scale, boxes))");
  });

  test("is moved by a drag, zoomed by the wheel, two fingers, the buttons and the keys, and fitted to its box", () => {
    const template = templateOf(space);

    for (const press of ['@click="zoom(1)"', '@click="zoom(-1)"', '@click="fit()"', '@pointerdown="pressed"', '@keydown="keyed"']) expect(template).toContain(press);
    expect(scriptOf(space)).toContain('addEventListener("wheel", wheeled, { passive: false })');
    expect(scriptOf(space)).toContain("if (held.size === 2) {");
  });

  test("opens the card of the agent touched, and holds everyone still for a reader who asked for less motion", () => {
    expect(scriptOf(space)).toContain("chosenName.value = actorAt(here[0], here[1]);");
    expect(templateOf(space)).toContain("data-space-card");
    expect(scriptOf(space)).toContain('still = matchMedia("(prefers-reduced-motion: reduce)").matches;');
    expect(scriptOf(space)).toContain("tick(plan, folk, Math.min(0.1, Math.max(0, (clock - last) / 1000)), Math.random, still);");
  });
});

describe(KO.line_63, () => {
  test("stands on a role slot's tile, asked again under the row it was pressed in", () => {
    const confirm = templateOf(stopConfirm);

    expect(stopConfirm).toContain('live.message.stop_confirm_default');
    expect(confirm).toContain(':loading="props.stops.isSending(props.target)"');
    // A tile asked to stop and not yet seen gone reads as stopping, which is what the verb answers.
    expect(templateOf(pool)).not.toContain("live.status.stopping");
    expect(templateOf(tile)).toContain(":label=\"$t('live.status.stopping')\"");
    expect(templateOf(pool)).toContain('<StopConfirm');
  });

  test("keeps a refusal on its own row rather than under the section it was in", () => {
    expect(page).not.toContain("stopFailed");
    expect(templateOf(stopConfirm)).toContain('role="alert"');
    expect(templateOf(stopConfirm)).toContain("props.stops.errorOf(props.target)");
  });

  test("a slot's tile carries the stop of the item its run is a job of", () => {
    expect(templateOf(tile)).toContain("$t('live.aria.stop_named', { name: caption })");
    expect(scriptOf(tile)).toContain("props.tile.run?.stop");
    expect(templateOf(pool)).toContain(`:question="$t('live.message.stop_confirm')"`);
  });
});

describe("when the picture was taken", () => {
  test("stands as a button that reads it again, spinning while it does", () => {
    const template = templateOf(page);

    expect(template).toContain(`<UTooltip :text="standing === '' ? $t('common.action.refresh') : $t('common.aria.refresh_standing', { standing })">`);
    expect(template).toContain(':loading="reading"');
    // The one refresh reads the bot's picture and the space again.
    expect(template).toContain('@click="refresh()"');
    expect(scriptOf(page)).toContain("void spaceRef.value?.load();");
    expect(template).toContain(':label="narrow ? undefined : standing"');
  });

  test("stands on the tab row's right end, so the screen holds one row under its title bar", () => {
    const template = templateOf(page);
    const row = template.slice(template.indexOf("<UTabs"), template.indexOf("<template #body>"));

    expect(row).toContain("<MachineRoom");
    expect(row).toContain('icon="i-material-symbols-refresh"');
    expect(template).not.toContain("<UDashboardToolbar");
  });
});
