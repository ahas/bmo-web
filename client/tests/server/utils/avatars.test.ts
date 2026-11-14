import { afterAll, beforeEach, describe, expect, test } from "bun:test";

// A profile picture reaches the console by one road, the receiver's (docs/web.md, 「Profile photos」): the console
// lists the receiver's pictures at its `GET /avatars`, a page at a time, oldest taken first, and reads a room's off
// its `GET /rooms/{roomId}/avatar` and a person's off its `GET /people/{personId}/avatar`, with the receiver's token,
// serving them under its own path. Two chat services stand beside it, named in the settings and each keeping
// pictures of its own on its own page, so every case shows that no chat service is ever asked.

const JPEG: Uint8Array<ArrayBuffer> = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG: Uint8Array<ArrayBuffer> = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 4, 5, 6]);

interface Kept {
  kind: string;
  id: number;
  takenAt: number;
}

interface Keeper {
  heard: { path: string; after: string | null; token: string | null }[];
  kept: Kept[];
  pictures: Map<string, { bytes: Uint8Array<ArrayBuffer>; type: string }>;
  pageSize: number;
  refusedFrom: number | null;
  listed: number;
  port: number;
  stop: () => Promise<void>;
}

// A unit keeping pictures on the shape every chat service's protocol and the receiver give them.
function keeper(): Keeper {
  const one: Keeper = { heard: [], kept: [], pictures: new Map(), pageSize: 2, refusedFrom: null, listed: 0, port: 0, stop: async () => undefined };
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => {
      const url = new URL(request.url);

      one.heard.push({ path: url.pathname, after: url.searchParams.get("after"), token: request.headers.get("authorization") });

      if (url.pathname === "/avatars") {
        one.listed += 1;

        if (one.refusedFrom !== null && one.listed >= one.refusedFrom) {
          return Response.json({ code: "unavailable", error: "not now" }, { status: 503 });
        }

        const after = url.searchParams.has("after") ? Number(url.searchParams.get("after")) : Number.NEGATIVE_INFINITY;
        const later = one.kept.filter((row) => row.takenAt > after);
        const page = later.slice(0, one.pageSize);

        return Response.json({ items: page, more: later.length > page.length });
      }

      const picture = one.pictures.get(url.pathname);

      return picture === undefined
        ? Response.json({ error: "no picture is kept", code: "not-found" }, { status: 404 })
        : new Response(picture.bytes, { headers: { "content-type": picture.type } });
    }
  });

  one.port = server.port ?? 0;
  one.stop = async () => await server.stop(true);

  return one;
}

const receiver = keeper();
const telegram = keeper();
const kakaotalk = keeper();

beforeEach(() => {
  for (const one of [receiver, telegram, kakaotalk]) {
    one.heard.length = 0;
    one.pageSize = 2;
    one.refusedFrom = null;
    one.listed = 0;
  }

  // The receiver keeps a room's picture, a person's and the owner's own, whichever chat service handed each in; the
  // owner's (42) stands on no chat service's page at all.
  receiver.kept = [
    { kind: "room", id: -9_000_000_000_002, takenAt: 500 },
    { kind: "person", id: 43, takenAt: 3_000 },
    { kind: "person", id: 42, takenAt: 5_000 }
  ];
  receiver.pictures = new Map([
    ["/rooms/-9000000000002/avatar", { bytes: PNG, type: "image/png" }],
    ["/people/42/avatar", { bytes: JPEG, type: "image/jpeg" }]
  ]);
  // Each chat service keeps pictures of its own the receiver does not, served on its own page.
  telegram.kept = [{ kind: "room", id: -100, takenAt: 1_000 }];
  telegram.pictures = new Map([["/rooms/-100/avatar", { bytes: JPEG, type: "image/jpeg" }]]);
  kakaotalk.kept = [{ kind: "person", id: 77, takenAt: 7_000 }];
  kakaotalk.pictures = new Map([["/people/77/avatar", { bytes: JPEG, type: "image/jpeg" }]]);
  process.env.RECEIVER_ADDRESS = `http://127.0.0.1:${receiver.port}`;
  process.env.RECEIVER_TOKEN = "the receiver's token";
  process.env.TELEGRAM_ADDRESS = `http://127.0.0.1:${telegram.port}`;
  process.env.TELEGRAM_TOKEN = "the service's token";
  process.env.KAKAOTALK_ADDRESS = `http://127.0.0.1:${kakaotalk.port}`;
  process.env.KAKAOTALK_TOKEN = "the other service's token";
});

afterAll(async () => {
  await receiver.stop();
  await telegram.stop();
  await kakaotalk.stop();
  delete process.env.TELEGRAM_ADDRESS;
  delete process.env.KAKAOTALK_ADDRESS;
});

const { avatarPicture, avatarRefs, isAvatarKind } = await import("../../../apps/web/server/utils/avatars");

function noChatServiceAsked(): void {
  expect(telegram.heard).toEqual([]);
  expect(kakaotalk.heard).toEqual([]);
}

describe("a profile picture", () => {
  test("is the receiver's, a room's and a person's alike, with the type it names, asked with its token", async () => {
    expect(await avatarPicture("room", -9_000_000_000_002)).toEqual({ bytes: PNG, type: "image/png" });
    expect(await avatarPicture("person", 42)).toEqual({ bytes: JPEG, type: "image/jpeg" });
    expect(receiver.heard).toEqual([
      { path: "/rooms/-9000000000002/avatar", after: null, token: "Bearer the receiver's token" },
      { path: "/people/42/avatar", after: null, token: "Bearer the receiver's token" }
    ]);
    noChatServiceAsked();
  });

  test("is none where the receiver keeps none, though a chat service's own page keeps one", async () => {
    expect(await avatarPicture("room", -100)).toBeNull();
    expect(await avatarPicture("person", 77)).toBeNull();
    noChatServiceAsked();
  });

  test("is none, and nothing is asked, where the receiver is not named", async () => {
    delete process.env.RECEIVER_ADDRESS;

    expect(await avatarPicture("room", -9_000_000_000_002)).toBeNull();
    expect(receiver.heard).toEqual([]);
    noChatServiceAsked();
  });

  test("is asked of a room or a person and nothing else", () => {
    expect(isAvatarKind("room")).toBe(true);
    expect(isAvatarKind("person")).toBe(true);
    expect(isAvatarKind("machine")).toBe(false);
  });
});

describe("the pictures the console can show", () => {
  test("are the receiver's, read page by page, oldest taken first, a picture on no chat service's page among them", async () => {
    expect(await avatarRefs()).toEqual([
      { kind: "room", id: -9_000_000_000_002, url: "/api/avatars/room/-9000000000002?v=500" },
      { kind: "person", id: 43, url: "/api/avatars/person/43?v=3000" },
      { kind: "person", id: 42, url: "/api/avatars/person/42?v=5000" }
    ]);
    expect(receiver.heard.map((one) => [one.path, one.after, one.token])).toEqual([
      ["/avatars", null, "Bearer the receiver's token"],
      ["/avatars", "3000", "Bearer the receiver's token"]
    ]);
    noChatServiceAsked();
  });

  test("stand as many as were read where a later page is refused", async () => {
    receiver.refusedFrom = 2;

    expect(await avatarRefs()).toEqual([
      { kind: "room", id: -9_000_000_000_002, url: "/api/avatars/room/-9000000000002?v=500" },
      { kind: "person", id: 43, url: "/api/avatars/person/43?v=3000" }
    ]);
    noChatServiceAsked();
  });

  test("are none, and no chat service is asked in their place, where the receiver is not named or refuses", async () => {
    receiver.refusedFrom = 1;
    expect(await avatarRefs()).toEqual([]);

    delete process.env.RECEIVER_ADDRESS;
    expect(await avatarRefs()).toEqual([]);
    noChatServiceAsked();
  });
});
