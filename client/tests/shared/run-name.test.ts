import { describe, expect, test } from "bun:test";

import { jobOfRunName, jobRunName, jobRunNameOf, runBeside } from "../../apps/web/shared/run-name";

// One run's one name, and what stands beside it (docs/web.md, 「One run reads one name, everywhere」). A job's run is
// named `job-<its number>`, which is how the agency builds the name, how the run ledger keys its row and how every
// line the run left carries it; the item and the agent that did the work stand beside the name, in that order.

describe("a job's run name", () => {
  test("is the name the job record carries where it has one", () => {
    expect(jobRunName({ id: 908260, runName: "job-908260" })).toBe("job-908260");
  });

  // A job whose turn has yet to publish its ledger row carries no name, and the screen that shows its run must still
  // name it the same way the lines it left carry it.
  test("is built from the job's number where the record carries none", () => {
    expect(jobRunName({ id: 908260, runName: null })).toBe("job-908260");
    expect(jobRunNameOf(12)).toBe("job-12");
  });

  test("names no run of a turn, a session or a checkout", () => {
    // The ledger's composite row name, a turn's session id, a checkout's own name and a place's folder each name
    // something else, and none of them is read as a job's.
    for (const name of ["bmo-web-w2:job-908260", "bmo-web-w2@run:4975", "apart-bmo-web-w2-run-4975", "bmo-web-w2", "run-4975", "", "job-", "job-0", "job--3", "job-1.5", "job-1e3", "job- 3", null, undefined]) {
      expect(jobOfRunName(name)).toBeNull();
    }
  });

  test("gives back the job's number the name was built from", () => {
    expect(jobOfRunName(jobRunName({ id: 1, runName: null }))).toBe(1);
    expect(jobOfRunName("job-908260")).toBe(908260);
  });
});

describe("what stands beside a run's name", () => {
  test("is the item then the agent, in that order", () => {
    expect(runBeside({ run: "job-908260", item: 3999, agent: "coder-01" })).toBe("#3999 · coder-01");
  });

  test("leaves out what the run does not name, and stands as nothing when neither does", () => {
    expect(runBeside({ run: "job-9", item: 3999, agent: null })).toBe("#3999");
    expect(runBeside({ run: "job-9", item: null, agent: "coder-01" })).toBe("coder-01");
    expect(runBeside({ run: "job-9", item: 0, agent: "" })).toBe("");
  });
});
