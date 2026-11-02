import { describe, expect, test } from "bun:test";

// The research screen's settings tab as it ships (docs/web.md, 「Research screen」): what every research run is held
// to — each line's branches and clock, the branch role, the fetch strategy and the two gaps, each a cell saving its
// one value — and the search engines' state. The words and
// values are the domain's (domain/research.test.ts); these checks hold the screen to what the document promises.

const read = async (name: string) => await Bun.file(new URL(name, new URL("../../../apps/web/app/components/", import.meta.url))).text();
const templateOf = (source: string) => source.slice(0, source.indexOf("<script"));
const scriptOf = (source: string) => source.slice(source.indexOf("<script"));

const settings = await read("./ResearchSettings.vue");
const page = await read("../pages/research.vue");
const agents = await read("../pages/agents/index.vue");

describe("the research settings tab", () => {
  test("stands as the research screen's settings tab, and no longer on the agent page", () => {
    expect(page).toContain("<ResearchSettings v-if=\"tab === 'settings'\"");
    expect(agents).not.toContain("<ResearchSettings");
  });

  test("names no source of a value and no default word, and offers the roles the agency lists as callable", () => {
    expect(templateOf(settings)).not.toContain("sourceLabel");
    expect(settings).not.toContain("AgentsRouteTable");
    expect(scriptOf(settings)).toContain("roles.map((role) => ({ value: role.name, label: role.label }))");
  });

  test("reads the research settings and saves each value in a cell of its own", () => {
    expect(scriptOf(settings)).toContain('useFetch<ResearchSettingsView>("/api/research-settings"');
    expect(scriptOf(settings)).toContain('$fetch<ResearchSettingsView>("/api/research-settings", { method: "PUT", body: change })');

    for (const cell of ["#branches-cell", "#minutes-cell", "#branchRole-cell", "#strategy-cell", "#hostIntervalMs-cell", "#engineIntervalMs-cell"]) {
      expect(templateOf(settings)).toContain(cell);
    }
  });

  test("stands the engines' state as a mark and a word, and says why where they could not be read", () => {
    expect(templateOf(settings)).toContain("engineLook($t, row.original.state).label");
    expect(templateOf(settings)).toContain('$t("research.error.engines_unread", { reason: settings.enginesUnread ?? "" })');
    expect(templateOf(settings)).toContain("remainingText($t, toUnixSeconds(row.original.suspendedUntil), now)");
  });

  test("no longer says the agency serves none of it", () => {
    expect(settings).not.toContain("settings_unserved");
  });
});
