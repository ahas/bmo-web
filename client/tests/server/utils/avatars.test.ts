import { afterAll, beforeEach, describe, expect, test } from "bun:test";

// A profile picture comes from the archive and from each chat service (docs/web.md, 「Profile photos」): the console
// reads a room's off a keeper's `GET /rooms/{roomId}/avatar` and a person's off `GET /people/{personId}/avatar`, with
// that keeper's token, the receiver first, then the Telegram service, then the KakaoTalk service, and serves it
// under its own path. Each keeper lists its pictures at `GET /avatars`, a page at a time, oldest taken first, and the
// lists are joined with the earlier keeper's standing for a number two keep.

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

  receiver.kept = [
    { kind: "room", id: -9_000_000_000_002, takenAt: 500 },
    { kind: "person", id: 42, takenAt: 5_000 }
  ];
  receiver.pictures = new Map([["/rooms/-9000000000002/avatar", { bytes: PNG, type: "image/png" }]]);
  telegram.kept = [
    { kind: "room", id: -100, takenAt: 1_000 },
    { kind: "person", id: 42, takenAt: 2_000 },
    { kind: "person", id: 43, takenAt: 3_000 },
    { kind: "room", id: -200, takenAt: 4_000 }
  ];
  telegram.pictures = new Map([
    ["/rooms/-100/avatar", { bytes: JPEG, type: "image/jpeg" }],
    ["/rooms/-9000000000002/avatar", { bytes: JPEG, type: "image/jpeg" }]
  ]);
  process.env.RECEIVER_ADDRESS = `http://127.0.0.1:${receiver.port}`;
  process.env.RECEIVER_TOKEN = "the receiver's token";
  process.env.TELEGRAM_ADDRESS = `http://127.0.0.1:${telegram.port}`;
  process.env.TELEGRAM_TOKEN = "the service's token";
  kakaotalk.kept = [];
  kakaotalk.pictures = new Map();
  process.env.KAKAOTALK_ADDRESS = `http://127.0.0.1:${kakaotalk.port}`;
  process.env.KAKAOTALK_TOKEN = "the other service's token";
});

afterAll(async () => {
  await receiver.stop();
  await telegram.stop();
  await kakaotalk.stop();
});

const { avatarPicture, avatarRefs, isAvatarKind } = await import("../../../apps/web/server/utils/avatars");

describe("a profile picture", () => {
  test("is the archive's where the receiver keeps one, with the type it names, asked with its token", async () => {
    expect(await avatarPicture("room", -9_000_000_000_002)).toEqual({ bytes: PNG, type: "image/png" });
    expect(receiver.heard.at(-1)).toEqual({ path: "/rooms/-9000000000002/avatar", after: null, token: "Bearer the receiver's token" });
    expect(telegram.heard).toEqual([]);
  });

  test("is the chat service's where the receiver keeps none", async () => {
    expect(await avatarPicture("room", -100)).toEqual({ bytes: JPEG, type: "image/jpeg" });
    expect(telegram.heard.at(-1)).toEqual({ path: "/rooms/-100/avatar", after: null, token: "Bearer the service's token" });
  });

  test("is the chat service's where the receiver is not named", async () => {
    delete process.env.RECEIVER_ADDRESS;

    expect(await avatarPicture("room", -9_000_000_000_002)).toEqual({ bytes: JPEG, type: "image/jpeg" });
  });

  test("is the KakaoTalk service's where neither the receiver nor the Telegram service keeps one", async () => {
    kakaotalk.pictures = new Map([["/people/77/avatar", { bytes: JPEG, type: "image/jpeg" }]]);

    expect(await avatarPicture("person", 77)).toEqual({ bytes: JPEG, type: "image/jpeg" });
    expect(telegram.heard.at(-1)?.path).toBe("/people/77/avatar");
    expect(kakaotalk.heard.at(-1)).toEqual({ path: "/people/77/avatar", after: null, token: "Bearer the other service's token" });
  });

  test("is none where no keeper keeps one, or where none is named", async () => {
    expect(await avatarPicture("person", 42)).toBeNull();
    expect(receiver.heard.at(-1)?.path).toBe("/people/42/avatar");
    expect(telegram.heard.at(-1)?.path).toBe("/people/42/avatar");

    delete process.env.RECEIVER_ADDRESS;
    delete process.env.TELEGRAM_ADDRESS;
    delete process.env.KAKAOTALK_ADDRESS;
    expect(await avatarPicture("room", -100)).toBeNull();
  });

  test("is asked of a room or a person and nothing else", () => {
    expect(isAvatarKind("room")).toBe(true);
    expect(isAvatarKind("person")).toBe(true);
    expect(isAvatarKind("machine")).toBe(false);
  });
});

describe("the pictures the keepers keep", () => {
  test("are each keeper's, read page by page, oldest taken first, the receiver's standing for a number both keep", async () => {
    expect(await avatarRefs()).toEqual([
      { kind: "room", id: -9_000_000_000_002, url: "/api/avatars/room/-9000000000002?v=500" },
      { kind: "person", id: 42, url: "/api/avatars/person/42?v=5000" },
      { kind: "room", id: -100, url: "/api/avatars/room/-100?v=1000" },
      { kind: "person", id: 43, url: "/api/avatars/person/43?v=3000" },
      { kind: "room", id: -200, url: "/api/avatars/room/-200?v=4000" }
    ]);
    expect(telegram.heard.map((one) => [one.path, one.after])).toEqual([
      ["/avatars", null],
      ["/avatars", "2000"]
    ]);
    expect(receiver.heard.every((one) => one.token === "Bearer the receiver's token")).toBe(true);
    expect(telegram.heard.every((one) => one.token === "Bearer the service's token")).toBe(true);
  });

  test("join the KakaoTalk service's after the Telegram service's, the earlier keeper's standing for a number two keep", async () => {
    kakaotalk.kept = [
      { kind: "person", id: 43, takenAt: 6_000 },
      { kind: "person", id: 77, takenAt: 7_000 }
    ];

    expect((await avatarRefs()).slice(-3)).toEqual([
      { kind: "person", id: 43, url: "/api/avatars/person/43?v=3000" },
      { kind: "room", id: -200, url: "/api/avatars/room/-200?v=4000" },
      { kind: "person", id: 77, url: "/api/avatars/person/77?v=7000" }
    ]);
    expect(kakaotalk.heard.every((one) => one.token === "Bearer the other service's token")).toBe(true);
  });

  test("stand as many as were read where a later page is refused, and a keeper refused leaves only its own out", async () => {
    telegram.refusedFrom = 2;
    receiver.refusedFrom = 1;

    expect(await avatarRefs()).toEqual([
      { kind: "room", id: -100, url: "/api/avatars/room/-100?v=1000" },
      { kind: "person", id: 42, url: "/api/avatars/person/42?v=2000" }
    ]);
  });

  test("are none where no keeper is named", async () => {
    delete process.env.RECEIVER_ADDRESS;
    delete process.env.TELEGRAM_ADDRESS;
    delete process.env.KAKAOTALK_ADDRESS;

    expect(await avatarRefs()).toEqual([]);
  });
});
