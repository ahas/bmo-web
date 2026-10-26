import { relayBotStream } from "../utils/bot-relay";
import { roomStreamFilter } from "../utils/room-stream";

// The units' live streams — the receiver's, bmo-job's and the agency's — relayed event by event, with the
// console's own events written between them. The browser cannot carry the units' tokens, so the session is
// checked here and the tokens are added on this side. A receiver that is not there ends the stream, and the
// browser opens it again on its own. A user who reads only some rooms hears only those rooms' news, and
// nothing of bmo-job's or the agency's, which name no room (docs/web.md, 「Access」).
export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const signed = await signedInUser(event);
  const rooms = await readableRooms(event);
  // A room read is the account's own news: the console's word of it goes to that account's tabs alone.
  const ownRead = (said: { name: string; data: unknown }): boolean | null =>
    said.name === "room-read" ? (said.data as { user?: unknown } | null)?.user === signed.name : null;
  const filter = rooms === "all" ? {} : roomStreamFilter(rooms);

  const query = getQuery(event);
  // Where the receiver's and bmo-job's streams resume from, each with the run of that unit its number was
  // taken against. A unit sets a cursor from an earlier run aside and hands over its whole buffer instead, so
  // the run travels with it.
  const cursors = {
    receiver: { after: readCursor(query.after) ?? 0, run: typeof query.run === "string" ? query.run : null },
    job: { after: readCursor(query.jobAfter) ?? 0, run: typeof query.jobRun === "string" ? query.jobRun : null }
  };
  const aborted = new AbortController();

  // The upstream call outlives this handler, so it ends when the browser lets go.
  event.node.res.on("close", () => aborted.abort());
  event.web?.request?.signal?.addEventListener("abort", () => aborted.abort());

  setResponseHeaders(event, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "x-accel-buffering": "no"
  });

  return sendStream(
    event,
    relayBotStream(cursors, aborted, { ...filter, consoleEvent: (said) => ownRead(said) ?? filter.consoleEvent?.(said) ?? true })
  );
});
