import { extname } from "node:path";

import { receiver, receiverCall } from "./receiver";

import type { ExactMessageId } from "#shared/types";

// A file that came with a room's message, served by the message it belongs to. A browser never names
// a path: it names a room, a message, a kind and the file's place among the message's files, and the file
// comes off the receiver, which keeps it (docs/web.md, the room screen's message files). The rules a served
// file is held to are this app's: the types each kind may be and the kinds that leave only as a file to keep.
// The receiver answers the stretch a player asks for.
//
// Audio, video, ordinary downloads, and Telegram visual assets share this authenticated route.

/** One of a message's files as the receiver lists it (its `docs/boundary-api.md`, 「A message's files and picture」). */
export interface ReceivedFile {
  place: number;
  kind: string;
  // The name it was sent under.
  name: string;
  // The type the stored file's name implies, its size, and whether its bytes stand in the store.
  type: string | null;
  size: number | null;
  kept: boolean;
}

/** How one kept file goes out: the type it is served as, and whether it leaves only as a file to keep. */
export interface FileOut {
  type: string;
  keep: boolean;
}

// What each kind is allowed to be. A file whose name is not one of these is refused rather than
// served as something the browser has to guess at.
const TYPES: Record<string, Record<string, string>> = {
  document: {},
  sticker: { ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".webm": "video/webm", ".tgs": "application/x-tgsticker" },
  // What a room's animation plays as: a short looping video without sound.
  animation: { ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/mp4", ".webm": "video/webm" },
  // What a room's video plays as. A QuickTime file from a phone is the MPEG-4 family inside, so it
  // is named as MP4, which is the type every browser that plays MP4 takes.
  video: {
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".mov": "video/mp4",
    ".webm": "video/webm"
  },
  audio: {
    ".ogg": "audio/ogg",
    ".oga": "audio/ogg",
    ".opus": "audio/ogg",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".wav": "audio/wav",
    ".flac": "audio/flac",
    ".webm": "audio/webm"
  },
  // The page a share was saved from, exactly as it came off the web. Down this road it only ever
  // leaves as a file to keep; drawing it is the saved-page road's business, and that one draws it
  // under an isolation this route has none of.
  page: {
    ".html": "text/html",
    ".htm": "text/html"
  },
  // What a saved page says, in words. This is the one part of a share that is read on screen,
  // and it is plain text, so there is nothing in it to run.
  text: {
    ".txt": "text/plain; charset=utf-8"
  },
  // What was embedded in a saved page and kept beside it.
  media: {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".m4v": "video/mp4",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp"
  }
};

// Which kinds never leave this road as anything but a file to keep, whatever their type says. A
// saved page is somebody else's HTML: handed over here it would be drawn in this console's own
// origin with nothing holding it back, so here it is a download and nothing else.
const KEEP_ONLY = new Set(["page", "document"]);

export function servedAsFile(kind: string): boolean {
  return KEEP_ONLY.has(kind);
}

// The kinds a message's files are asked for by. A captured page's kinds belong to a unit not split yet.
const MESSAGE_KINDS = ["audio", "video", "animation", "document", "sticker"];

// What a file kept to be saved goes out as: bytes, never anything a browser would open.
const KEPT_AS_FILE = "application/octet-stream";

/** A message's files, in the order a page's files stand. */
export async function messageFiles(chatId: number, messageId: ExactMessageId): Promise<ReceivedFile[]> {
  const page = await receiverCall(
    receiver().GET("/rooms/{roomId}/messages/{messageId}/files", {
      params: { path: { roomId: chatId, messageId } }
    })
  );

  return page.items;
}

// The kinds of file a kind is asked for under: a sound or a video may stand as a document, its name saying which.
function filedUnder(kind: string): string[] {
  if (kind === "animation") return ["animation", "video"];

  return kind === "audio" || kind === "video" ? [kind, "document"] : [kind];
}

/** The file a request names among a message's files: the one at its place, or the kind's first where it names none. */
export function fileAsked(kind: string, files: readonly ReceivedFile[], place: number | null): ReceivedFile | null {
  const under = filedUnder(kind);

  return files.find((file) => under.includes(file.kind) && (place === null || file.place === place)) ?? null;
}

/**
 * How a kept file of a kind goes out, or null where it may not: a document, or a sound or a video asked for to
 * keep, leaves as a file to keep; anything else goes out as the type its kind takes for its name, or as the type
 * the receiver gives it where that is one its kind takes, and a file of any other type is refused.
 */
export function fileOut(kind: string, file: ReceivedFile, download: boolean): FileOut | null {
  if (!MESSAGE_KINDS.includes(kind) || !file.kept) return null;
  if (servedAsFile(kind) || ((kind === "audio" || kind === "video") && download)) return { type: KEPT_AS_FILE, keep: true };

  const taken = Object.values(TYPES[kind] ?? {});
  const type = servedType(kind, file.name) ?? (file.type !== null && taken.includes(file.type) ? file.type : null);

  return type === null ? null : { type, keep: false };
}

// The kinds a browser plays where the file stands, in the order a name is judged by: a WebM is
// a video before it is a sound.
const PLAYED = ["video", "audio"] as const;

// Which played kind a kept file's name is, or null where a browser plays it as neither.
export function playedKind(name: string): (typeof PLAYED)[number] | null {
  const extension = extname(name).toLowerCase();

  return PLAYED.find((kind) => TYPES[kind]![extension] !== undefined) ?? null;
}

// The type a kind's file of this name is served as, or null where the kind takes no file of that name.
export function servedType(kind: string, name: string): string | null {
  return TYPES[kind]?.[extname(name).toLowerCase()] ?? null;
}

/**
 * A kept file the receiver answered, as this console hands it on: the type it decided where one is given, the
 * browser told never to guess another, the stretch a player seeks answered as the receiver answered it, and kept
 * by no cache but the reader's, since it is their own room read behind their own login. A refusal goes on as it is.
 */
export function servedFile(answer: Response, out: FileOut | null = null): Response {
  if (!answer.ok) return answer;

  if (out !== null) answer.headers.set("content-type", out.type);
  answer.headers.set("x-content-type-options", "nosniff");
  answer.headers.set("accept-ranges", "bytes");
  answer.headers.set("cache-control", "private, max-age=86400");

  return answer;
}
