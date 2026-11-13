import { isAgentName } from "#shared/config";
import { wording } from "#shared/wording";

import type { AgentLogPage } from "#shared/types";

// One page of an agent's log: the newest page where the link names no place, the page before or after an id, the page
// a moment stands in, narrowed to a room where one is named, or a page of one named run: its newest lines, the lines
// before or after one of it, or the lines from its start. A log holds
// the rooms' conversations and whatever a browse task was handed, so it stands behind the same session rule as the
// rest of the app and goes nowhere else.
export default defineEventHandler(async (event): Promise<AgentLogPage> => {
  await requireUserSession(event);

  const name = getRouterParam(event, "name", { decode: true }) ?? "";

  if (!isAgentName(name)) {
    throw fail(400, wording("agents.error.bad_agent_name"));
  }

  const query = getQuery(event);
  const limit = readLimit(query.limit);
  const run = typeof query.run === "string" ? query.run : "";
  const after = readCursor(query.after);

  const before = readCursor(query.before);

  // A screen that stands at one run reads that run: after the last line the reader holds, after none reading it from
  // its start; else its lines before the oldest one the reader holds, or its newest lines where it holds none.
  if (run !== "") {
    if (after !== null) return await readRunPage(run, after, limit);

    return await readRunBack(run, before === null || before <= 0 ? null : before, limit);
  }

  const at = readMoment(query.at);
  const chat = Number(query.chat);

  return await readAgentPage(name, {
    ...(before === null || before <= 0 ? {} : { before }),
    ...(after === null || after <= 0 ? {} : { after }),
    ...(at === null ? {} : { at, ...(Number.isSafeInteger(chat) ? { chat } : {}) })
  }, limit);
});
