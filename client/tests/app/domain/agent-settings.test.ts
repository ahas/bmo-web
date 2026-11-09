import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { AGENT_TABS, isAgentTab, searchSettings, settingsAnchor } from "../../../apps/web/app/domain/agent-settings";

describe("the sections of the agent management screen", () => {
  test("are the roles, the agents, the repositories, the registered models and the model files, in that order", () => {
    // The agents' tab keeps the section it was the supervisors' under, which the addresses and the grants name.
    expect(AGENT_TABS.map((tab) => tab.value)).toEqual(["roles", "supervisors", "repositories", "models", "model-files"]);
    expect(AGENT_TABS.map((tab) => wording(tab.label))).toEqual([
      wording("agents.label.tab_roles"),
      wording("agents.label.tab_supervisors"),
      wording("agents.label.tab_repositories"),
      wording("agents.label.tab_models"),
      wording("agents.label.tab_model_files")
    ]);
  });

  test("retire the general, workers, tiers, routes and searcher tabs", () => {
    for (const retired of ["general", "workers", "tiers", "routes", "research", "pool", "fallback"]) expect(isAgentTab(retired)).toBe(false);
    expect(isAgentTab("model-files")).toBe(true);
  });
});

describe("the settings search", () => {
  const entries = [
    { id: "role-builder", tab: "roles" as const, label: "builder", fields: [{ label: "name", text: "builder", shown: true }, { label: "label", text: "Builder", shown: false }] },
    { id: "repository-repo-a", tab: "repositories" as const, label: "repo-a", fields: [{ label: "path", text: "/srv/repo-a", shown: true }, { label: "preamble", text: "sanitizer", shown: false }] }
  ];

  test("finds a row by what it shows and by what it only holds, and names the tab", () => {
    expect(searchSettings(wording, entries, "builder").map((hit) => hit.entry.id)).toEqual(["role-builder"]);
    expect(searchSettings(wording, entries, "sanitizer")[0]?.match).toEqual({ shown: false, hidden: { label: "preamble", snippet: "sanitizer" } });
    expect(searchSettings(wording, entries, wording("agents.label.tab_repositories")).map((hit) => hit.entry.id)).toEqual(["repository-repo-a"]);
    expect(searchSettings(wording, entries, "")).toEqual([]);
  });

  test("anchors a row by an id a page can carry", () => {
    expect(settingsAnchor("role-role:builder")).toBe("setting-role-role-builder");
  });
});
