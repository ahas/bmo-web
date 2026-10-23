import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { profileLabel, researchKeys } from "../../../apps/web/app/domain/research";

describe("researchKeys", () => {
  test("takes every profile on a research line, in the order the agency lists them", () => {
    const profiles = [
      { key: "agent-a", line: "chat" },
      { key: "search:thorough", line: "search" },
      { key: "gate-a", line: "gate" },
      { key: "browse", line: "browse" }
    ];

    expect(researchKeys(profiles, [])).toEqual(["search:thorough", "browse"]);
  });

  test("adds an assigned key no profile declares when its name puts it on a research line", () => {
    const profiles = [{ key: "search:basic", line: "search" }];
    const assignments = [{ key: "search:basic" }, { key: "search:exhaustive" }, { key: "browse" }, { key: "role:scout" }, { key: "job-worker" }];

    expect(researchKeys(profiles, assignments)).toEqual(["search:basic", "search:exhaustive", "browse"]);
  });

  test("leaves a profiled key to its profile's line, whatever its name", () => {
    expect(researchKeys([{ key: "search-like", line: "worker" }], [{ key: "search-like" }])).toEqual([]);
  });

  test("is empty where the agency serves no research key", () => {
    expect(researchKeys([{ key: "agent-a", line: "chat" }], [{ key: "role:scout" }])).toEqual([]);
  });
});

describe("profileLabel", () => {
  test("names a known key in the pack's words and any other by its key", () => {
    expect(profileLabel(wording, "browse")).toBe(wording("research.label.profile_browse"));
    expect(profileLabel(wording, "search:other")).toBe("search:other");
  });
});
