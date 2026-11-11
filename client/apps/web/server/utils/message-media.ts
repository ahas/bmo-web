import { wording } from "#shared/wording";

import { fileOut, messageFiles, playedKind } from "./media";
import { receiver, receiverCall } from "./receiver";

import type { ReceivedFile } from "./media";
import type { MessageAttachment, TelegramExpression, VideoShape } from "#shared/types";

// What a message carried, as the room screen draws it: its files, each with its size and type and whether it can be
// received, and the custom emoji its words drew, read from the receiver's list of the message's files and the
// metadata the chat service handed over beside it (the receiver's `docs/boundary-api.md`, 「Reading a room」 and 「A
// message's files and picture」). The browser sees no file's path and nothing of the chat service's own identifiers.

// The kinds of file a message's line stands, in the order its files stand.
const ATTACHED: readonly string[] = ["audio", "video", "animation", "document", "sticker"];

// A file the chat agent's own voice made is kept under a name of the deployment's, not one a person gave it.
const OWN_NAME = "bmo:";

/** Whether a message's page names any file the line would stand, so its files are worth asking for. */
export function carriesFiles(files: readonly { kind: string }[]): boolean {
  return files.some((file) => ATTACHED.includes(file.kind));
}

// One file of the message as its line stands it, with the kind it plays as.
interface Asset {
  file: ReceivedFile;
  attachment: MessageAttachment;
}

function assetOf(file: ReceivedFile): Asset {
  // A document that is a video or a sound plays as one, whatever its row calls it; the name it was sent under is
  // what says which.
  const played = file.kind === "document" ? playedKind(file.name) : null;
  const kind = (played ?? file.kind) as MessageAttachment["kind"];
  // A sound or a video in a form no browser plays can still be kept as a file.
  const out = fileOut(kind, file, false) ?? (kind === "audio" || kind === "video" ? fileOut(kind, file, true) : null);

  return {
    file,
    attachment: {
      id: file.place,
      kind,
      name: file.name.startsWith(OWN_NAME) ? wording("room.label.voice_message") : file.name,
      bytes: out === null ? null : file.size,
      type: out?.type ?? null,
      available: out !== null
    }
  };
}

/** A message's files and the expressions its words drew, as the room screen draws them. */
export async function messageMedia(chatId: number, messageId: number, text: string): Promise<{ attachments: MessageAttachment[]; expressions: TelegramExpression[] }> {
  const [files, metadata] = await Promise.all([
    messageFiles(chatId, messageId),
    receiverCall(
      receiver().GET("/rooms/{roomId}/messages/{messageId}/metadata", {
        params: { path: { roomId: chatId, messageId } }
      })
    )
      .then((answer) => answer.metadata)
      .catch(() => null)
  ]);
  const assets = files.filter((file) => ATTACHED.includes(file.kind)).map(assetOf);
  const described = typeof metadata === "object" && metadata !== null ? (metadata as Record<string, unknown>) : null;
  const shape = videoShape(described?.attachment);
  const latestSticker = assets.filter((asset) => asset.file.kind === "sticker" && /^sticker[.-]/.test(asset.file.name)).at(-1);
  const attachments = assets
    .filter((asset) => asset.file.kind !== "sticker" || (described?.sticker != null && asset === latestSticker))
    .map((asset) => (asset.attachment.kind === "video" && shape !== null ? { ...asset.attachment, shape } : asset.attachment));

  return { attachments, expressions: expressionsOf(text, described, assets) };
}

// The custom emoji a message's words drew, each over the stretch of the words it stands for. They are paired only
// with the words the chat service handed over as they were, since the room's line may carry marks before them.
function expressionsOf(text: string, metadata: Record<string, unknown> | null, assets: readonly Asset[]): TelegramExpression[] {
  const raw = metadata?.text;
  const base = typeof raw === "string" && raw.length > 0 && text.endsWith(raw) ? text.length - raw.length : -1;

  if (base < 0 || typeof raw !== "string" || !Array.isArray(metadata?.entities)) return [];

  const expressions: TelegramExpression[] = [];
  let end = 0;

  for (const entity of [...(metadata.entities as Record<string, unknown>[])].sort((a, b) => Number(a.offset) - Number(b.offset))) {
    const { offset, length } = entity as { offset: number; length: number };
    const emoji = typeof entity.custom_emoji_id === "string" ? entity.custom_emoji_id : "";

    if (entity.type !== "custom_emoji" || !/^\d+$/.test(emoji) || !Number.isSafeInteger(offset) || !Number.isSafeInteger(length) ||
      offset < end || length <= 0 || offset + length > raw.length) continue;

    const asset = assets.find((one) => one.file.name.startsWith(`emoji-${emoji}.`));

    if (asset?.attachment.available === true) {
      expressions.push({ offset: base + offset, length, attachment: asset.attachment });
      end = offset + length;
    }
  }

  return expressions;
}

// The shape a video stands in, as the chat service described it when it arrived: its own size, a round note's side,
// or failing both its thumbnail's, which is the same shape smaller. It is what lets the player hold its place before
// the file has said anything of itself.
function videoShape(described: unknown): VideoShape | null {
  if (typeof described !== "object" || described === null) return null;

  const { length, thumbnail } = described as { length?: unknown; thumbnail?: unknown };

  return sized(described) ?? (typeof length === "number" && length > 0 ? { width: length, height: length } : null) ?? sized(thumbnail);
}

function sized(one: unknown): VideoShape | null {
  if (typeof one !== "object" || one === null) return null;

  const { width, height } = one as { width?: unknown; height?: unknown };

  return typeof width === "number" && typeof height === "number" && width > 0 && height > 0 ? { width, height } : null;
}
