import { describe, expect, test } from "bun:test";

// The searcher tab as it ships: the searchers' work keys as rows of the road table, and a sentence for
// what no unit serves. The keys it picks are the domain's (domain/research.test.ts); these checks hold
// the screen to what docs/web.md promises it shows.

// The sources are read where the app keeps them.
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
    expect(scriptOf(settings)).toContain('useFetch<FallbackView>("/api/fallback", { key: "fallback"');
    expect(scriptOf(settings)).toContain('useFetch<TierSettingsView>("/api/model-tiers", { key: "model-tiers"');
    expect(scriptOf(settings)).toContain("researchKeys(fallback.value?.profiles ?? [], tiers.value?.assignments ?? [])");
  });

  test("says in one sentence what the agency does not serve, and reads no research settings", () => {
    expect(templateOf(settings)).toContain('$t("research.status.no_keys")');
    expect(templateOf(settings)).toContain('$t("research.message.settings_unserved")');

    for (const source of [settings, page]) {
      expect(source).not.toContain("research-settings");
    }
  });
});
