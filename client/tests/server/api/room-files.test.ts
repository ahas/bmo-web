import { afterAll, describe, expect, test } from "bun:test";

import { asked, routeOf } from "../../support/nitro";

import type { RoomPicturePage, RoomStats, RoomWindow } from "../../../apps/web/shared/types";

// A room's files, pictures, figures and window, read from a stood-in receiver (its `docs/boundary-api.md`,
// 「Reading a room」, 「A message's files and picture」, 「A room's pictures」 and 「A room's figures」): a file's bytes
// handed on whole with the range a player asked for, under the type this console decides for its kind, or as a file
// to keep; a photo as the bytes it is; a refusal said in the pack's words; and the pictures, the figures and the
// window as the receiver answers them, the figures counted in the zone the console shows every time in.

interface Heard {
  path: string;
  range: string | null;
}

const heard: Heard[] = [];
const SOUND = new Uint8Array([79, 103, 103, 83, 0, 1, 2, 3, 4, 5]);
const PHOTO = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9]);
const files = [
  { place: 0, kind: "photo", name: "p.jpg", type: "image/jpeg", size: 5, kept: true },
  { place: 1, kind: "audio", name: "voice.ogg", type: "audio/ogg", size: 10, kept: true },
  { place: 2, kind: "document", name: "notes.pdf", type: "application/pdf", size: 3, kept: true },
  { place: 3, kind: "audio", name: "take.txt", type: "text/plain", size: 3, kept: true }
];

const receiver = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    const url = new URL(request.url);

    heard.push({ path: `${url.pathname}${url.search}`, range: request.headers.get("range") });

    if (url.pathname === "/rooms/-7/messages/9/files") return Response.json({ items: files, more: false });
    if (url.pathname === "/rooms/-7/messages/9/files/1") {
      const ranged = request.headers.get("range") === "bytes=0-3";

      return new Response(ranged ? SOUND.slice(0, 4) : SOUND, {
        status: ranged ? 206 : 200,
        headers: { "content-type": "audio/ogg", "accept-ranges": "bytes", ...(ranged ? { "content-range": "bytes 0-3/10" } : {}), "x-stored-at": "/kept" }
      });
    }
    if (url.pathname === "/rooms/-7/messages/9/files/2") {
      return new Response("pdf", { headers: { "content-type": "application/pdf", "content-disposition": "attachment; filename*=UTF-8''notes.pdf" } });
    }
    if (url.pathname === "/rooms/-7/messages/9/picture") return new Response(PHOTO, { headers: { "content-type": "image/jpeg" } });
    if (url.pathname === "/rooms/-7/pictures") {
      return Response.json({ items: [{ id: 9, album: null, senderName: "person-a", sentAt: 10_000, text: "a picture", file: { name: "p.jpg", bytes: 5, type: "image/jpeg" } }], more: false, before: 2, total: 3 });
    }
    if (url.pathname === "/rooms/-7/window") return Response.json({ openForMs: 161_000, closesAt: 1_790_000_161 });
    if (url.pathname === "/rooms/-7/figures") {
      return Response.json({
        room: -7, messages: 4, fromPeople: 3, speakers: 2, firstAt: 1, lastAt: 4, lastAnswerAt: 4, top: [{ name: "person-a", messages: 2 }],
        byHour: Array.from({ length: 24 }, (_, hour) => (hour === 9 ? 4 : 0)),
        agents: [{ agentName: "agent-a", messages: 1, lastAnswerAt: 4, session: null, label: "Agent A", lastMode: null, lastModel: null, lastEffort: null,
          sessionMode: null, model: null, contextTokens: null, runs: null, lastRunAt: null, weekTokens: null, totalTokens: null }]
      });
    }

    return Response.json({ code: "not-found", error: "The receiver keeps no such message." }, { status: 404 });
  }
});

process.env.RECEIVER_ADDRESS = `http://127.0.0.1:${receiver.port}`;
process.env.RECEIVER_TOKEN = "receiver-token";

afterAll(() => {
  void receiver.stop(true);
  delete process.env.RECEIVER_ADDRESS;
  delete process.env.RECEIVER_TOKEN;
});

const globals: Record<string, unknown> = globalThis;

globals.requireReadableRoom = async () => undefined;
globals.useAppConfig = () => ({ bmoUi: { zone: "Asia/Seoul" } });

const { wording } = await import("../../../apps/web/shared/wording");
const media = await routeOf<Response>("../../apps/web/server/api/media/[kind]/[chatId]/[messageId].get.ts");
const photo = await routeOf<Response>("../../apps/web/server/api/images/[chatId]/[messageId].get.ts");
const pictures = await routeOf<RoomPicturePage>("../../apps/web/server/api/rooms/[chatId]/pictures.get.ts");
const window = await routeOf<RoomWindow>("../../apps/web/server/api/rooms/[chatId]/window.get.ts");
const stats = await routeOf<RoomStats>("../../apps/web/server/api/rooms/[chatId]/stats.get.ts");

const last = () => heard.at(-1)!;
const at = (kind: string, query: Record<string, string> = {}, headers: Record<string, string> = {}) => ({ params: { kind, chatId: "-7", messageId: "9" }, query, headers });

describe("a message's file", () => {
  test("is the receiver's bytes of the file at its place, under the type this console decides, and seekable", async () => {
    const answer = await media(at("audio", { item: "1" }));

    expect(last()).toEqual({ path: "/rooms/-7/messages/9/files/1", range: null });
    expect(answer.status).toBe(200);
    expect(new Uint8Array(await answer.arrayBuffer())).toEqual(SOUND);
    expect(answer.headers.get("content-type")).toBe("audio/ogg");
    expect(answer.headers.get("accept-ranges")).toBe("bytes");
    expect(answer.headers.get("x-content-type-options")).toBe("nosniff");
    expect(answer.headers.get("cache-control")).toBe("private, max-age=86400");
    expect(answer.headers.get("x-stored-at")).toBeNull();
  });

  test("hands on the stretch a player asked for, and the stretch the receiver answered", async () => {
    const answer = await media(at("audio", { item: "1" }, { range: "bytes=0-3" }));

    expect(last()).toEqual({ path: "/rooms/-7/messages/9/files/1", range: "bytes=0-3" });
    expect(answer.status).toBe(206);
    expect(answer.headers.get("content-range")).toBe("bytes 0-3/10");
    expect(new Uint8Array(await answer.arrayBuffer())).toEqual(SOUND.slice(0, 4));
  });

  test("leaves as a file to keep for a document, and for a sound asked for to keep", async () => {
    const document = await media(at("document", { item: "2" }));

    expect(last().path).toBe("/rooms/-7/messages/9/files/2?download=true");
    expect(document.headers.get("content-type")).toBe("application/octet-stream");
    expect(document.headers.get("content-disposition")).toBe("attachment; filename*=UTF-8''notes.pdf");

    await media(at("audio", { item: "1", as: "download" }));
    expect(last().path).toBe("/rooms/-7/messages/9/files/1?download=true");
  });

  test("is refused, without asking for its bytes, where its type is not its kind's or its place holds none of the kind", async () => {
    for (const asked of [at("audio", { item: "3" }), at("video", { item: "1" }), at("audio", { item: "8" }), at("page", { item: "2" })]) {
      heard.length = 0;

      expect(await askedFile(asked)).toMatchObject({ status: 404, message: wording("room.error.file_not_found") });
      expect(heard.map((one) => one.path)).toEqual(["/rooms/-7/messages/9/files"]);
    }
  });

  test("of a message the receiver does not keep is refused in the pack's words", async () => {
    expect(await askedFile({ ...at("audio", { item: "1" }), params: { kind: "audio", chatId: "-7", messageId: "404" } })).toMatchObject({ status: 404 });
  });
});

async function askedFile(event: ReturnType<typeof at>) {
  return await asked(media, event);
}

describe("a message's photo", () => {
  test("is the picture the receiver kept for it, as its bytes", async () => {
    const answer = await photo({ params: { chatId: "-7", messageId: "9" } });

    expect(last().path).toBe("/rooms/-7/messages/9/picture");
    expect(answer.headers.get("content-type")).toBe("image/jpeg");
    expect(answer.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await answer.arrayBuffer())).toEqual(PHOTO);
  });

  test("not kept is refused in the pack's words", async () => {
    expect(await asked(photo, { params: { chatId: "-7", messageId: "404" } })).toMatchObject({ status: 404, message: wording("room.error.photo_not_found") });
  });
});

describe("a room's pictures, figures and window", () => {
  test("the pictures are the receiver's stretch, asked by the cursor the viewer holds", async () => {
    const page = await pictures({ params: { chatId: "-7" }, query: { before: "9", limit: "30", other: "x" } });

    expect(last().path).toBe("/rooms/-7/pictures?before=9&limit=30");
    expect(page).toMatchObject({ hasMore: false, before: 2, total: 3, pictures: [{ messageId: 9, file: { name: "p.jpg", bytes: 5, type: "image/jpeg" } }] });
  });

  test("the figures are counted in the console's zone, an agent's runs and tokens left as none where no unit counts them", async () => {
    const counted = await stats({ params: { chatId: "-7" } });

    expect(last().path).toBe("/rooms/-7/figures?zone=Asia%2FSeoul");
    expect(counted).toMatchObject({ chatId: -7, messages: 4, fromPeople: 3, speakers: 2, top: [{ name: "person-a", messages: 2 }] });
    expect(counted.byHour[9]).toBe(4);
    expect(counted.agents[0]).toMatchObject({ agent: "agent-a", label: "Agent A", runs: null, weekTokens: null, totalTokens: null });
  });

  test("the window is how long the chat agent's window has left", async () => {
    expect(await window({ params: { chatId: "-7" } })).toEqual({ openFor: 161 });
    expect(last().path).toBe("/rooms/-7/window");
  });
});
