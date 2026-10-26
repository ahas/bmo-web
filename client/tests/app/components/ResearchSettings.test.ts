import { describe, expect, test } from "bun:test";

// The searcher tab as it ships (docs/web.md, the searcher tab): the searchers' work keys as rows of the road table,
// and under them what every research run is held to — each key's branches and clock, the branch role, the fetch
// strategy and the two gaps, each a cell saving its one value — and the search engines' state. The words and
// values are the domain's (domain/research.test.ts); these checks hold the screen to what the document promises.

const read = async (name: string) => await Bun.file(new URL(name, new URL("../../../apps/web/app/components/", import.meta.url))).text();
const templateOf = (source: string) => source.slice(0, source.indexOf("<script"));
const scriptOf = (source: string) => source.slice(source.indexOf("<script"));

const settings = await read("./ResearchSettings.vue");
const page = await read("../pages/agents/index.vue");

describe("the searcher tab", () => {
  test("stands as the last tab of the agent page", () => {
    expect(page).toContain('<ResearchSettings v-else :query="query"');
  });

  test("shows the research keys as rows of the road table, saved through the same roads and tiers", () => {
    expect(templateOf(settings)).toContain('<AgentsRouteTable v-if="!read || keys.length > 0" :only="keys" :query="props.query" />');
    expect(scriptOf(settings)).toContain("researchKeys(fallback.value?.profiles ?? [], tiers.value?.assignments ?? [])");
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
