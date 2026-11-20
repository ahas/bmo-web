// What the room information's tabs collect from a room's messages, a kind to a tab (docs/web.md, the room screen's
// room information): the receiver answers the messages holding a kind, a page at a time, and each tab stands only its
// own kind of what those messages carried. A file is counted by what it is, as the receiver counts it: one kept as a
// document is a video or a sound where the type its name implies says so, and only the rest are files.

import { messageLinks } from "#shared/links";

import type { ArchivedMessage, ExactMessageId, MediaShape, MessageAttachment, RoomHolding, RoomHoldingPage } from "#shared/types";

// Who sent what a row shows and when, in epoch seconds, as every row of a tab names it.
interface Sent {
  key: string;
  messageId: ExactMessageId;
  senderName: string;
  sentAt: number;
}

/** One thing a tab shows, by what it is. */
export type HeldRow =
  | (Sent & { kind: "picture"; shape: MediaShape | null })
  | (Sent & { kind: "video" | "animation" | "file"; attachment: MessageAttachment })
  | (Sent & { kind: "link"; url: string; site: string })
  | (Sent & { kind: "sound"; attachment: MessageAttachment; seconds: number | null; transcript: string | null });

// The site an address names, as a link's line shows it under the address.
function siteOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function sentOf(message: ArchivedMessage, part: string): Sent {
  return { key: `${message.messageId}:${part}`, messageId: message.messageId, senderName: message.senderName, sentAt: message.sentAt };
}

// What a kept file is, for the tabs: a video (an animation among them), a sound, or a file of any other kind. A sticker
// is none of them.
type FileKind = "video" | "sound" | "file";

function fileKindOf(attachment: MessageAttachment): FileKind | null {
  switch (attachment.kind) {
    case "video":
    case "animation":
      return "video";
    case "audio":
      return "sound";
    case "sticker":
      return null;
    case "document": {
      const implied = attachment.impliedType ?? "";

      return implied.startsWith("video/") ? "video" : implied.startsWith("audio/") ? "sound" : "file";
    }
  }
}

function filesOf(message: ArchivedMessage, kind: FileKind): MessageAttachment[] {
  return (message.attachments ?? []).filter((attachment) => fileKindOf(attachment) === kind);
}

// Whether the room plays a kept file where it stands: its bytes are kept and served as a type of its own kind, as a
// bubble plays a video or a sound only then.
function played(attachment: MessageAttachment): boolean {
  return attachment.available && attachment.type?.startsWith(attachment.kind === "audio" ? "audio/" : "video/") === true;
}

// A kept file as a tab stands it: a video, an animation or a sound drawn as one where the room plays it, and a file
// line where the room has nothing to play it with.
function fileRow(message: ArchivedMessage, attachment: MessageAttachment, sound: Omit<Extract<HeldRow, { kind: "sound" }>, keyof Sent | "kind" | "attachment">): HeldRow {
  const sent = sentOf(message, `file:${attachment.id}`);

  if (!played(attachment)) return { ...sent, kind: "file", attachment };

  switch (attachment.kind) {
    case "video":
    case "animation":
      return { ...sent, kind: attachment.kind, attachment };
    case "audio":
      return { ...sent, kind: "sound", attachment, ...sound };
    default:
      return { ...sent, kind: "file", attachment };
  }
}

// What one message gives a tab, in the order the message carried it.
function rowsOf(holding: RoomHolding, message: ArchivedMessage): HeldRow[] {
  switch (holding) {
    case "media": {
      const picture: HeldRow[] = message.imagePath !== null && message.sticker !== true
        ? [{ ...sentOf(message, "picture"), kind: "picture", shape: message.imageShape ?? null }]
        : [];

      return [...picture, ...filesOf(message, "video").map((attachment) => fileRow(message, attachment, { seconds: null, transcript: null }))];
    }
    case "file":
      return filesOf(message, "file").map((attachment) => fileRow(message, attachment, { seconds: null, transcript: null }));
    case "link":
      return messageLinks(message.text, Number.POSITIVE_INFINITY).map((url) => ({ ...sentOf(message, `link:${url}`), kind: "link", url, site: siteOf(url) }));
    case "music":
    case "voice":
      return filesOf(message, "sound").map((attachment) =>
        fileRow(message, attachment, {
          seconds: holding === "voice" ? (message.voiceSeconds ?? null) : null,
          transcript: holding === "voice" && (message.transcript ?? "").trim() !== "" ? message.transcript! : null
        })
      );
  }
}

/** What a tab shows of the messages read for it, newest first. A deleted message shows nothing. */
export function heldRows(holding: RoomHolding, messages: readonly ArchivedMessage[]): HeldRow[] {
  return [...messages]
    .filter((message) => message.deletedAt == null)
    .sort((a, b) => b.sentAt - a.sentAt)
    .flatMap((message) => rowsOf(holding, message));
}

/** One tab's read of the room's messages holding its kind: the first page as the tab is shown, and each older page as
 * the reader nears the end. */
export function useRoomHolding(chatId: number, holding: RoomHolding) {
  const messages = shallowRef<ArchivedMessage[]>([]);
  const loaded = ref(false);
  const pending = ref(false);
  const failed = ref(false);
  const more = ref(false);
  // The oldest message read, the next page ending just before it.
  let oldest: ExactMessageId | null = null;
  let generation = 0;

  onScopeDispose(() => {
    generation++;
  });

  async function read(): Promise<void> {
    if (pending.value) return;

    const mine = ++generation;

    pending.value = true;
    failed.value = false;

    try {
      const page = await $fetch<RoomHoldingPage>(`/api/rooms/${chatId}/holding`, { query: { kind: holding, ...(oldest === null ? {} : { before: oldest }) } });

      if (mine !== generation) return;
      messages.value = [...page.messages, ...messages.value];
      oldest = page.messages[0]?.messageId ?? oldest;
      more.value = page.hasMore && page.messages.length > 0;
      loaded.value = true;
    } catch {
      if (mine === generation) failed.value = true;
    } finally {
      if (mine === generation) pending.value = false;
    }
  }

  // The next page, where older messages stand and none is being read.
  function readMore(): void {
    if (more.value && !failed.value) void read();
  }

  const rows = computed<HeldRow[]>(() => heldRows(holding, messages.value));

  return { rows, loaded, pending, failed, more, read, readMore };
}
