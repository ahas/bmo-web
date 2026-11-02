import { isAgentName } from "#shared/config";
import { wording } from "#shared/wording";

import type { CompanionResetAnswer, CompanionResetRange } from "#shared/agency";

// A companion's reset of the ranges the administrator chose, carried to the agency under their name (the agency's
// `docs/api.md`, 「companion-resets」). It walks every archive copy under the data root, and waits for that answer
// however long it takes under load.

export default defineEventHandler(async (event): Promise<CompanionResetAnswer> => {
  const signed = await requireAdministrator(event);
  const body = await readBody<{ agent?: unknown; conversation?: unknown; person?: unknown }>(event);

  if (!isAgentName(body?.agent)) throw fail(400, wording("agents.error.no_such_agent_name"));

  const reset = await agencyCall(
    agency().POST("/companion-resets", {
      body: {
        agent: body.agent,
        conversation: body.conversation === true,
        person: body.person === true,
        alone: null,
        shared: null,
        dryRun: false,
        by: signed.name
      }
    })
  );
  const ranges = (Array.isArray(reset.ranges) ? reset.ranges : []).filter(
    (range: unknown): range is CompanionResetRange => range === "conversation" || range === "person"
  );

  return {
    agent: reset.agentName,
    label: reset.agentName,
    ranges,
    alone: [],
    shared: [],
    rows: [],
    files: [],
    copies: [],
    writerRuns: []
  };
});
