import { describe, expect, test } from "bun:test";

import { packEntries } from "../../../apps/web/shared/wording";
import KO from "../../fixtures/app/pages/live.test.ko.json";

// The keys whose words carry a phrase, so a check that a screen never says it reads the keys.
const keysSaying = (phrase: string) => packEntries().filter(([, value]) => value.includes(phrase)).map(([key]) => key);

// The live status board as it ships: a section to a tab, the tab in the address, and every section
// drawn whether it stands or not, so nothing it reads is cut off by a tab being closed. These
// source checks hold the browser boundary to what docs/web.md promises; the behaviour behind it is
// the bot's and its tests'.

// The sources are read where the app keeps them.
const read = async (name: string) => await Bun.file(new URL(name, new URL("../../../apps/web/app/pages/", import.meta.url))).text();
const templateOf = (source: string) => source.slice(0, source.indexOf("<script"));
const scriptOf = (source: string) => source.slice(source.indexOf("<script"));

const page = await read("./live.vue");
const pool = await read("../components/CoworkerPoolBoard.vue");
const tile = await read("../components/PoolTile.vue");
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

    for (const one of ["v-show=\"tab === 'pool'\"", "v-show=\"tab === 'executions'\"", 'v-show="tab === group.key"']) {
      expect(template).toContain(one);
    }
    // A section taken down would take its reading down with it, and put a skeleton back on return.
    expect(template).not.toContain("v-if=\"tab === ");
    expect(template).toContain("<CoworkerPoolBoard :now=");
  });

  test("never repeat the tab's own name as a heading over the section", () => {
    for (const source of [templateOf(page), templateOf(pool)]) {
      expect(source).not.toContain("<h2");
    }
    expect(templateOf(page)).toContain('{{ status.reachable ? $t("live.status.nothing_running") : $t("live.status.unknown_now") }}');
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
describe(KO.line_63, () => {
  test("stands by what the bot named rather than by the row's own kind", () => {
    const template = templateOf(page);

    // The one reading of what a row is stopped by, and no second one written here.
    expect(scriptOf(page)).toContain('stopTargetOf');
    expect(scriptOf(page)).not.toContain('run.kind === "runner"');
    expect(template).toContain('stoppable(run) && !stops.isAsking(stopTargetOf(run)!)');
    // Every group's rows are drawn by the one block, so no section carries a stop of its own.
    expect(template).toContain('<StopConfirm');
  });

  test("asks again on the row it was pressed on, and says which row's stop is out", () => {
    const confirm = templateOf(stopConfirm);

    // The question a row asks by default; a tile's own says it is the run the tile works inside.
    expect(stopConfirm).toContain('live.message.stop_confirm_default');
    expect(confirm).toContain(':loading="props.stops.isSending(props.target)"');
    // A row asked to stop and not yet seen gone reads as stopping, which is what the verb answers.
    expect(templateOf(page)).toContain(`:label="$t('live.status.stopping')"`);
    expect(templateOf(pool)).not.toContain("live.status.stopping");
    expect(templateOf(tile)).toContain(":label=\"$t('live.status.stopping')\"");
  });

  test("keeps a refusal on its own row rather than under the section it was in", () => {
    // The old shape: one line under the runner group, gone the moment another tab stood.
    expect(page).not.toContain("stopFailed");
    expect(templateOf(stopConfirm)).toContain('role="alert"');
    expect(templateOf(stopConfirm)).toContain("props.stops.errorOf(props.target)");
  });

  test("sends the target the picture gave the row, and the question goes back with the back gesture", () => {
    expect(scriptOf(page)).toContain('body: { target }');
    expect(scriptOf(page)).not.toContain("body: { unit:");
    expect(scriptOf(page)).toContain("useBackClose(computed(() => stops.asking.value !== null)");
  });

  test("a co-worker tile carries the stop of the run it works inside", () => {
    expect(templateOf(tile)).toContain("$t('live.aria.stop_named', { name: caption })");
    expect(scriptOf(tile)).toContain("tileStop(props.tile)");
    expect(templateOf(pool)).toContain(`:question="$t('live.message.stop_confirm')"`);
  });
});

describe("when the picture was taken", () => {
  test("stands as a button that reads it again, spinning while it does", () => {
    const template = templateOf(page);

    expect(template).toContain(`<UTooltip :text="standing === '' ? $t('common.action.refresh') : $t('common.aria.refresh_standing', { standing })">`);
    expect(template).toContain(':loading="reading"');
    expect(template).toContain('@click="load()"');
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
