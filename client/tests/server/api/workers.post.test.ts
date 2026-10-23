import { describe, expect, test } from "bun:test";

import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { WorkerChanged } from "../../../apps/web/shared/types";

// Adding and changing a job worker, asked of the agency (the agency's `docs/api.md`, 「workers」). The documents a
// worker's session prefix carries go as the form sends them, in their order, each path trimmed and an empty one
// dropped; a change that sends none leaves them out, so the agency keeps the ones it holds (docs/web.md, the
// worker's session prefix documents).

const agency = standIn("AGENCY", () => answer({}, 200));

const handler = await routeOf<WorkerChanged>("../../apps/web/server/api/workers.post");

describe("a worker's session prefix documents", () => {
  test("go with a new worker in the order the form put them", async () => {
    agency.asked.length = 0;

    expect((await asked(handler, { body: { action: "add", name: "worker-b", label: "Worker B", path: "/srv/b", prefixDocuments: [" docs/a.md ", "", "/srv/umbrella/b.md"] } })).status).toBe(200);
    expect(agency.asked.map((one) => [one.method, one.path, one.body?.prefixDocuments])).toEqual([["POST", "/workers", ["docs/a.md", "/srv/umbrella/b.md"]]]);
  });

  test("go whole with a change that touches them, and not at all with one that does not", async () => {
    agency.asked.length = 0;

    await asked(handler, { body: { action: "update", name: "worker-b", label: "Worker B", prefixDocuments: ["docs/b.md", "docs/a.md"] } });
    await asked(handler, { body: { action: "update", name: "worker-b", label: "Worker B" } });
    await asked(handler, { body: { action: "update", name: "worker-b", label: "Worker B", prefixDocuments: [] } });

    expect(agency.asked.map((one) => [one.method, one.path, one.body !== null && "prefixDocuments" in one.body ? one.body.prefixDocuments : "absent"])).toEqual([
      ["PATCH", "/workers/worker-b", ["docs/b.md", "docs/a.md"]],
      ["PATCH", "/workers/worker-b", "absent"],
      ["PATCH", "/workers/worker-b", []]
    ]);
  });
});
