import { fileSizeText } from "#shared/file-sizes";
import { countText } from "./numbers";
import { withoutMediaMark } from "./room";
import { formatStamp } from "bmo-ui/app/domain/time";
import { imageUrl } from "./urls";

import type { InjectionKey } from "vue";
import type { ExactMessageId, RoomPicture, RoomPicturePage } from "#shared/types";
import type { Translate } from "#shared/wording";
import type { Size } from "bmo-ui/app/domain/zoom";
import type { BarProperty } from "bmo-ui/app/domain/tabs";

// What a room screen hands every picture in its feed: the way to open the picture viewer that walks
// the whole room. A picture shown outside a room screen finds none and opens alone.
export interface RoomPictures {
  open: (messageId: ExactMessageId, title: string) => void;
}

export const ROOM_PICTURES: InjectionKey<RoomPictures> = Symbol("room-pictures");

// The run of a room's pictures read so far. It is always one unbroken stretch of the room's line,
// so a picture's place among all of the room's is the stretch's start plus its place in it.
export interface PictureStretch {
  pictures: RoomPicture[];
  // How many of the room's pictures stand before the first one held, and how many the room holds.
  before: number;
  total: number;
  // Whether the room holds pictures past either end of the stretch.
  older: boolean;
  newer: boolean;
}

export const EMPTY_STRETCH: PictureStretch = { pictures: [], before: 0, total: 0, older: false, newer: false };

// How many pictures a read brings, and how near an end of the stretch the viewer may come before the
// next read is asked for, so walking on never waits at the end of what was read.
export const PICTURE_PAGE = 40;
export const PICTURE_LEAD = 5;

// The stretch around one picture, out of the picture itself and the pages either side of it.
export function stretchAround(at: RoomPicturePage, before: RoomPicturePage, after: RoomPicturePage): PictureStretch {
  return {
    pictures: [...before.pictures, ...at.pictures, ...after.pictures],
    before: before.pictures.length > 0 ? before.before : at.before,
    total: at.total,
    older: before.hasMore,
    newer: after.hasMore
  };
}

// The stretch with a page read past one of its ends. A picture already held is not taken twice.
export function widened(stretch: PictureStretch, page: RoomPicturePage, side: "older" | "newer"): PictureStretch {
  const held = new Set(stretch.pictures.map((picture) => picture.messageId));
  const fresh = page.pictures.filter((picture) => !held.has(picture.messageId));

  return side === "older"
    ? { ...stretch, pictures: [...fresh, ...stretch.pictures], before: fresh.length > 0 ? page.before : stretch.before, total: page.total, older: page.hasMore }
    : { ...stretch, pictures: [...stretch.pictures, ...fresh], total: page.total, newer: page.hasMore };
}

// Which end of the stretch wants reading next, once the viewer stands this near it.
export function sideToRead(stretch: PictureStretch, index: number): "older" | "newer" | null {
  if (index < 0) {
    return null;
  }

  if (stretch.older && index < PICTURE_LEAD) {
    return "older";
  }

  if (stretch.newer && index >= stretch.pictures.length - PICTURE_LEAD) {
    return "newer";
  }

  return null;
}

// What the archive's message says beside its picture, without the mark that stands for the picture.
export function pictureCaption(picture: RoomPicture): string {
  // A caption's formatting is not read here: the viewer shows the caption whole, as the archive holds its words.
  return withoutMediaMark(picture.text, { attachments: [], pictured: true }, { expressions: [], formats: [] }).text.trim();
}

// The name the viewer's head carries: who sent it, when, and where it stands among the room's pictures.
export function pictureTitle(picture: RoomPicture, place: number, total: number): string {
  return `${picture.senderName} · ${formatStamp(picture.sentAt)} · ${countText(place)}/${countText(total)}`;
}

// The picture's details as the properties list stands them. The size it is drawn at is the browser's
// own reading of the file and is known only once the picture has loaded.
export function pictureProperties(t: Translate, picture: RoomPicture, drawn: Size | null): BarProperty[] {
  const caption = pictureCaption(picture);
  const file = picture.file;

  return [
    { label: t("room.label.picture_sender"), value: picture.senderName },
    { label: t("room.label.picture_sent_at"), value: formatStamp(picture.sentAt) },
    { label: t("room.label.picture_message"), value: String(picture.messageId), mono: true },
    ...(file === null
      ? [{ label: t("room.label.picture_file"), value: t("room.label.picture_not_kept") }]
      : [
          { label: t("room.label.picture_file"), value: file.name, mono: true },
          { label: t("room.label.picture_size"), value: fileSizeText(file.bytes) },
          { label: t("room.label.picture_format"), value: formatOf(file.type) }
        ]),
    ...(drawn === null || drawn.width === 0
      ? []
      : [{ label: t("common.label.picture_resolution"), value: t("common.label.picture_resolution_value", { width: countText(drawn.width), height: countText(drawn.height) }) }]),
    ...(caption === "" ? [] : [{ label: t("common.label.picture_caption"), value: caption }])
  ];
}

// A content type as a format's name, `image/jpeg` as `JPEG`.
function formatOf(type: string): string {
  return (type.split("/")[1] ?? type).toUpperCase();
}

// The room's pictures as the viewer walks them: the one it was opened on first, then the room either
// side of it, read further as the viewer comes near either end.
export function useRoomPictures(t: Translate, chatId: number, onFailure: (error: unknown) => void) {
  const open = ref(false);
  const stretch = ref<PictureStretch>(EMPTY_STRETCH);
  const current = ref<ExactMessageId | null>(null);
  // The name the picture was opened under, which stands until the room's reading of it arrives.
  const openedTitle = ref("");
  const reading = { older: false, newer: false };
  // A read answering a viewer since opened on another picture changes nothing.
  let generation = 0;

  const index = computed(() => stretch.value.pictures.findIndex((picture) => picture.messageId === current.value));
  const picture = computed<RoomPicture | null>(() => stretch.value.pictures[index.value] ?? null);
  const src = computed(() => (current.value === null ? "" : imageUrl(chatId, current.value)));
  const title = computed(() =>
    picture.value === null ? openedTitle.value : pictureTitle(picture.value, stretch.value.before + index.value + 1, stretch.value.total)
  );
  const canPrevious = computed(() => index.value > 0);
  const canNext = computed(() => index.value >= 0 && index.value < stretch.value.pictures.length - 1);
  // The kept pictures either side of the one standing, which the browser fetches ahead of the press.
  const neighbours = computed(() =>
    index.value < 0
      ? []
      : [stretch.value.pictures[index.value - 1], stretch.value.pictures[index.value + 1]].flatMap((near) =>
          near === undefined || near.file === null ? [] : [imageUrl(chatId, near.messageId)]
        )
  );

  const page = (query: Record<string, ExactMessageId | number>) => $fetch<RoomPicturePage>(`/api/rooms/${chatId}/pictures`, { query });

  async function show(messageId: ExactMessageId, named: string): Promise<void> {
    const mine = ++generation;

    current.value = messageId;
    openedTitle.value = named;
    stretch.value = EMPTY_STRETCH;
    reading.older = reading.newer = false;
    open.value = true;

    try {
      const [at, before, after] = await Promise.all([
        page({ at: messageId }),
        page({ before: messageId, limit: PICTURE_PAGE }),
        page({ after: messageId, limit: PICTURE_PAGE })
      ]);

      if (mine === generation) {
        stretch.value = stretchAround(at, before, after);
      }
    } catch (error) {
      if (mine === generation) {
        onFailure(error);
      }
    }
  }

  async function readMore(side: "older" | "newer"): Promise<void> {
    const edge = side === "older" ? stretch.value.pictures[0] : stretch.value.pictures.at(-1);

    if (edge === undefined || reading[side]) {
      return;
    }

    const mine = generation;

    reading[side] = true;

    try {
      const arrived = await page(side === "older" ? { before: edge.messageId, limit: PICTURE_PAGE } : { after: edge.messageId, limit: PICTURE_PAGE });

      if (mine === generation) {
        stretch.value = widened(stretch.value, arrived, side);
      }
    } catch (error) {
      if (mine === generation) {
        onFailure(error);
      }
    } finally {
      if (mine === generation) {
        reading[side] = false;
      }
    }
  }

  function step(delta: number): void {
    const next = stretch.value.pictures[index.value + delta];

    if (next !== undefined) {
      current.value = next.messageId;
    }
  }

  watch([index, stretch], () => {
    const side = sideToRead(stretch.value, index.value);

    if (side !== null) {
      void readMore(side);
    }
  });

  return {
    open,
    current,
    picture,
    src,
    title,
    canPrevious,
    canNext,
    neighbours,
    show,
    previous: () => step(-1),
    next: () => step(1),
    properties: (drawn: Size | null) => (picture.value === null ? null : pictureProperties(t, picture.value, drawn))
  };
}
