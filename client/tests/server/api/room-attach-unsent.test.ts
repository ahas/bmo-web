import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { MAX_ATTACHMENTS } from "../../../apps/web/shared/config";
import { wording } from "../../../apps/web/shared/wording";
import { globalsRestoredAfter } from "../../support/globals";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { SentAttachments } from "../../../apps/web/shared/types";

// A file the receiver does not send (docs/web.md, the room screen's attachments): each file's row is handed its own
// reason, naming the file once, and this server's log says why with the receiver's own status and words, since the
// screen shows only the row's reason.

const GROUP = -7;

let filesAnswer: () => Response = () => answer({ sent: [], checking: [], failed: [] });

standIn("RECEIVER", (one) => {
  const path = one.path.split("?")[0] ?? "";

  if (path === "/owner") return answer({ room: -1, senderId: 900 });
  if (path === `/rooms/${GROUP}/word-files`) return filesAnswer();
  if (/^\/accounts\/\d+\/rooms$/.test(path)) return answer({ rooms: [] });
  if (/^\/rooms\/-?\d+$/.test(path)) return answer({ id: Number(path.split("/")[2]), title: null, privateOf: null });

  return answer({ code: "failed", error: "Not served here." }, 500);
});

standIn("AGENCY", () => answer({ items: [] }));

standIn("WEB_SERVER", (one) => {
  // The owner's sender stands linked to another account than the member's.
  if (one.path === "/senders/users") return answer({ links: [{ sender: 900, user: "1", signsIn: true }] });

  const user = one.path.match(/^\/users\/(\d+)$/)?.[1];

  if (user !== undefined) return answer({ user, name: `account-${user}`, administrator: false, senders: [] });

  return answer({ code: "forbidden", error: "Not this one." }, 403);
});

const globals: Record<string, unknown> = globalThis;

globalsRestoredAfter(["requireUserSession", "signedInUser"]);
globals.requireUserSession = async () => ({ user: { name: "member-a", id: 7 }, sid: "bmo.sid=member", administrator: false });
globals.signedInUser = (await import("../../../apps/web/server/utils/accounts")).signedInUser;

const attach = await routeOf<SentAttachments>("../../apps/web/server/api/rooms/[chatId]/attach.post");

const file = (name: string) => ({ name: "file", filename: name, type: "image/png", data: new Uint8Array([137, 80, 78, 71]) });

// The route's answer for two pictures sent together, and every line it wrote to the log on the way.
async function sentTwo(): Promise<{ answer: SentAttachments | null; logged: string[] }> {
  const warned = spyOn(console, "warn").mockImplementation(() => {});

  try {
    const sent = await asked(attach, { params: { chatId: String(GROUP) }, parts: [file("a.png"), file("b.png")], context: { readableRooms: new Set([GROUP]) } });

    return { answer: sent.answer, logged: warned.mock.calls.map((call) => call.map(String).join(" ")) };
  } finally {
    warned.mockRestore();
  }
}

afterEach(() => {
  filesAnswer = () => answer({ sent: [], checking: [], failed: [] });
});

describe("files the receiver refuses as one send", () => {
  test("each fail with a reason naming the file once, and the log carries the receiver's own words for each", async () => {
    filesAnswer = () => answer({ code: "bad-request", error: "Failed to buffer the request body: length limit exceeded" }, 400);

    const { answer: sent, logged } = await sentTwo();

    expect(sent).toEqual({
      sent: [],
      checking: [],
      failed: [
        { name: "a.png", reason: `a.png: ${wording("room.error.receiver_bad_request")}` },
        { name: "b.png", reason: `b.png: ${wording("room.error.receiver_bad_request")}` }
      ]
    });
    expect(logged).toEqual([
      `room ${GROUP}: file "a.png" was not sent: the receiver refused the send with 400: Failed to buffer the request body: length limit exceeded`,
      `room ${GROUP}: file "b.png" was not sent: the receiver refused the send with 400: Failed to buffer the request body: length limit exceeded`
    ]);
  });

  test("past the receiver's ceiling for one request are said as the console's ceiling", async () => {
    filesAnswer = () => answer({ code: "payload-too-large", error: "The request is past the ceiling." }, 413);

    const { answer: sent } = await sentTwo();
    const ceiling = wording("common.error.attachments_too_large", { n: MAX_ATTACHMENTS });

    expect(sent?.failed).toEqual([
      { name: "a.png", reason: `a.png: ${ceiling}` },
      { name: "b.png", reason: `b.png: ${ceiling}` }
    ]);
  });

  test("for one file past the ceiling say that file's sentence without naming it twice", async () => {
    filesAnswer = () => answer({ code: "too-large", error: "a.png is too large.", name: "a.png", size_bytes: 60_000_000, largest_bytes: 52_428_800 }, 413);

    const { answer: sent } = await sentTwo();

    expect(sent?.failed[0]).toEqual({ name: "a.png", reason: wording("room.error.file_too_large_named", { name: "a.png" }) });
  });
});

describe("a file the receiver answers as not sent", () => {
  test("is written to the log with the receiver's reason as it gave it", async () => {
    filesAnswer = () => answer({ sent: [], checking: [], failed: [{ name: "b.png", reason: { kind: "refused", reason: "the road is down" } }] });

    const { logged } = await sentTwo();

    expect(logged).toEqual([`room ${GROUP}: file "b.png" was not sent: the receiver answered {"kind":"refused","reason":"the road is down"}`]);
  });
});
