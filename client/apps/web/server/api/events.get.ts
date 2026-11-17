import { relayBotStream } from "../utils/bot-relay";
import { companyPeopleOf } from "../utils/company-people";
import { accountPresenceFrames, maskedPresence } from "../utils/presence-frames";
import { presenceSwitches } from "../utils/presence-switches";
import { roomStreamFilter } from "../utils/room-stream";

// The units' live streams — the receiver's, bmo-job's and the agency's — relayed event by event, with the
// console's own events written between them. The browser cannot carry the units' tokens, so the session is
// checked here and the tokens are added on this side. A receiver that is not there ends the stream, and the
// browser opens it again on its own. A user who reads only some rooms hears only those rooms' news, and
// nothing of bmo-job's or the agency's, which name no room (docs/web.md, 「Access」), those rooms and the login itself
// read again while the stream is open. Every reader is handed an account's presence only where the account shows it,
// and the presence of the people of their own company by account as well, those people read again while the stream
// is open (docs/web.md, 「Presence and typing」).
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const address = browserAddress(event);

  const signed = await signedInUser(event);
  const readable = await readableRooms(event);
  // The reader's rooms as they stand while the stream is open: a room they are let into is heard from then on, one
  // they leave or are taken out of falls silent at once, and a login no longer what it was, or rooms that can no
  // longer be read, end the stream, which the browser opens again under what stands now.
  const rooms = new LiveRooms(signed, readable, async () => {
    if ((await sealState(session, address)) !== "stands") throw new Error("the login no longer stands");

    return await signedInOf(session);
  });
  // A room read is the account's own news: the console's word of it goes to that account's tabs alone.
  const ownRead = (said: { name: string; data: unknown }): boolean | null =>
    said.name === "room-read" ? (said.data as { user?: unknown } | null)?.user === signed.name : null;
  const filter = readable === "all" ? {} : roomStreamFilter(rooms);
  // Read before the stream opens, so the present handed after the replay already finds them.
  const company = companyPeopleOf(signed);

  await company.read();

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

  aborted.signal.addEventListener("abort", rooms.follow(() => aborted.abort()));
  aborted.signal.addEventListener("abort", company.follow(() => aborted.abort()));

  setResponseHeaders(event, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "x-accel-buffering": "no"
  });

  return sendStream(
    event,
    relayBotStream(cursors, aborted, {
      ...filter,
      shape: (frame) => maskedPresence(frame, presenceSwitches.hidden()),
      derived: () => {
        const roomFrames = filter.derived?.();
        const people = accountPresenceFrames(company);

        return (frame) => [...(roomFrames?.(frame) ?? []), ...people(frame)];
      },
      consoleEvent: (said) => ownRead(said) ?? filter.consoleEvent?.(said) ?? true
    })
  );
});
