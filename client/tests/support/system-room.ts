// The browser harness's system line room, as its stand-in receiver answers it and the test that reads it names it
// (docs/web.md, 「A system notice stands as a system line, not a bubble」 and 「A fixed line stands as a system line
// too」): a person's words, then a row the archive kept before the service's stop was a fixed line, opening with the
// notice mark and filed under a sender the room does not answer as, the service's stop kept as the fixed line it is,
// and a session handed over naming a supervisor by its key, which the account service names by the label the agency
// gives it.

import marks from "../../apps/web/i18n/data/ko.yaml";

export const SYSTEM_ROOM = -9_002_000_000_004;

/** The supervisor the handover line names by its key, and the label the harness's agency gives it. */
export const HANDED_AGENT = { key: "agent-c", label: "Agent C" };

/** The words the marked row says after its mark. */
export const MARKED_WORDS = "restarting briefly";

/** The marks the service's own lines opened with in rows kept before they were fixed lines. */
export const NOTICE_MARKS = (marks as { marks: { notice: string[] } }).marks.notice;

/** The room's messages, oldest first, by id: the person's words, the marked row, the stop and the handover. */
export const SYSTEM_IDS = { words: "1", marked: "2", stop: "3", handover: "4" } as const;

function message(id: string, at: number, over: Record<string, unknown>): Record<string, unknown> {
  return {
    id: Number(id), room: SYSTEM_ROOM, senderId: 7, senderName: "person-b", sentAt: at, text: "", imagePath: null,
    replyToMessageId: null, answerSeconds: null, round: null, album: null, via: null, files: [], ...over
  };
}

/** The room's line as the receiver keeps it, its last message `at`. */
export function systemLine(at: number): Record<string, unknown>[] {
  return [
    message(SYSTEM_IDS.words, at - 3_000, { text: "hello there" }),
    message(SYSTEM_IDS.marked, at - 2_000, { senderId: 99, senderName: "service", text: `${NOTICE_MARKS[0]} ${MARKED_WORDS}` }),
    message(SYSTEM_IDS.stop, at - 1_000, {
      senderId: null, senderName: "agent-a", kind: "fixed-line", line: { code: "going-down", fields: {} }, text: "Restarting for a moment."
    }),
    message(SYSTEM_IDS.handover, at, {
      senderId: null, senderName: "agent-a", kind: "fixed-line",
      line: { code: "session-handed-over", fields: { agent: HANDED_AGENT.key, cause: "full" } },
      text: `${HANDED_AGENT.key} went to sleep to tidy its memories and wakes in a fresh session.`
    })
  ];
}

/** The room as the receiver answers it: its page, its chat service and its title; null for any other road. */
export function systemRoom(path: string, at: number): Response | null {
  const room = new RegExp(`^/rooms/${SYSTEM_ROOM}(/.*)?$`).exec(path);

  if (room === null) return null;

  const line = systemLine(at);

  switch (room[1] ?? "") {
    case "/messages":
      return Response.json({ items: line, more: false });
    case "/providers":
      return Response.json({ providers: ["record"], chosen: true, fileLimit: null });
    case "/title":
      return Response.json({ title: "system-room" });
    default: {
      const one = /^\/messages\/(-?\d+)$/.exec(room[1] ?? "");
      const found = one === null ? undefined : line.find((held) => String(held.id) === one[1]);

      return found === undefined ? null : Response.json(found);
    }
  }
}
