import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { globalsRestoredAfter } from "../../support/globals";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { RoomRemovalAnswer, RoomRemovalPreview } from "../../../apps/web/shared/types";

// A room's removal as the dialog says it (docs/web.md, the room menu's removal of its registration): the receiver's
// preview names its warnings under `warned` and its removal what it could not take under `couldNot` (the receiver's
// `docs/api.md`, 「Rooms」), each a code or kind with its fields (its `docs/codes.md`, `RoomRemovalWarning` and
// `RemovalLeft`). The console says each in the pack's sentence for it, a code it holds none for by the pack's sentence
// for its sort, and never the receiver's English.

const ROOM = -31;
const ADMINISTRATOR = 1;
const ENGLISH = "a sentence of the receiver's own";

// The receiver's answers as its removal route gives them.
let preview: Record<string, unknown> = {};
let removal: Record<string, unknown> = {};

standIn("RECEIVER", (one) => {
  const path = one.path.split("?")[0] ?? "";
  const dry = new URL(`http://unit${one.path}`).searchParams.get("dryRun") === "true";

  if (one.method === "GET" && path === `/rooms/${ROOM}`) return answer({ id: ROOM, title: null, privateOf: null, sealed: false });
  if (one.method === "GET" && path === "/owner") return answer({ room: -1, senderId: 900 });
  if (one.method === "GET" && /^\/accounts\/\d+\/rooms$/.test(path)) return answer({ rooms: [] });
  if (one.method === "DELETE" && path === `/rooms/${ROOM}`) return answer(dry ? preview : removal);

  return answer({ code: "failed", error: "Not served here." }, 500);
});

standIn("AGENCY", () => answer({ items: [] }));

standIn("WEB_SERVER", (one) => {
  const user = one.path.match(/^\/users\/(\d+)$/)?.[1];

  if (user !== undefined) return answer({ user, name: `account-${user}`, administrator: user === String(ADMINISTRATOR), senders: [] });

  return answer({ code: "failed", error: "Not served here." }, 500);
});

const globals: Record<string, unknown> = globalThis;

globalsRestoredAfter(["requireUserSession", "signedInUser"]);
globals.requireUserSession = async () => ({ user: { name: "boss", id: ADMINISTRATOR }, sid: "bmo.sid=boss", administrator: true });
globals.signedInUser = (await import("../../../apps/web/server/utils/accounts")).signedInUser;

const shown = await routeOf<RoomRemovalPreview>("../../apps/web/server/api/rooms/[chatId]/remove.get");
const taken = await routeOf<RoomRemovalAnswer>("../../apps/web/server/api/rooms/[chatId]/remove.post");

const roomOnly = { params: { chatId: String(ROOM) }, context: { readableRooms: new Set([ROOM]) } };

describe("the preview's warnings", () => {
  test("are read from `warned`, each said in the pack's sentence for its code, a road by its name", async () => {
    preview = {
      goes: [],
      stays: [],
      pictures: [],
      folders: [],
      warned: [
        { code: "answerers", names: ["agent-a", "agent-b"] },
        { code: "road", road: "telegram" },
        { code: "private", user: "7" },
        { code: "code-z", sentence: ENGLISH }
      ],
      warns: []
    };

    const read = await asked(shown, roomOnly);

    expect(read.answer?.warnings).toEqual([
      wording("room.label.removal_warning_answerers", { names: "agent-a, agent-b" }),
      wording("room.label.removal_warning_road", { road: wording("room.label.road_telegram") }),
      wording("room.label.removal_warning_private", { user: "7" }),
      wording("room.label.removal_warning_other")
    ]);
    expect(JSON.stringify(read.answer)).not.toContain(ENGLISH);
  });
});

describe("what the removal could not take", () => {
  test("is said by its path in the pack's sentence for its kind, never the receiver's reason", async () => {
    removal = {
      taken: [],
      cleared: [],
      pictures: [],
      folders: [],
      holders: [],
      couldNot: [
        { kind: "outside-data-root", path: "/elsewhere/room.jpg" },
        { kind: "not-removed", path: "images/-31", reason: ENGLISH },
        { kind: "kind-z", path: "x", reason: ENGLISH }
      ]
    };

    const read = await asked(taken, roomOnly);

    expect(read.answer?.left).toEqual([
      wording("room.label.removal_left_outside", { path: "/elsewhere/room.jpg" }),
      wording("room.label.removal_left_not_removed", { path: "images/-31" }),
      wording("room.label.removal_left_other")
    ]);
    expect(JSON.stringify(read.answer)).not.toContain(ENGLISH);
  });
});
