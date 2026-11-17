import { MIMEType } from "node:util";

import sharp from "sharp";

import { pageHead, pageText } from "./page-head";
import { addressRanges, readWeb } from "./web-read";

import type { PageHead } from "./page-head";
import type { WebRead, WebReadLimits } from "./web-read";

// A link card's page and picture, read once per address and kept (docs/web.md, the link previews rule): a page's head
// for six hours, a page that could not be read for fifteen minutes, and the picture's small form as long as its page.

const PAGE_LIMITS = { timeoutMs: 5_000, maxBytes: 512 * 1024, whole: false, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" };
const PICTURE_LIMITS = { timeoutMs: 8_000, maxBytes: 5 * 1024 * 1024, whole: true, accept: "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9" };

const READ_KEPT_MS = 6 * 60 * 60 * 1000;
const FAILED_KEPT_MS = 15 * 60 * 1000;
const MAX_KEPT = 1_000;

// The square a card's picture is drawn into, in device pixels: the card's square at up to three device pixels to one.
export const CARD_PICTURE_PIXELS = 240;

const PAGE_TYPES = new Set(["text/html", "application/xhtml+xml"]);
const PICTURE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"]);

/** The card picture's bytes and their type. */
export interface CardPicture {
  bytes: Uint8Array;
  type: string;
}

/** How a page and a picture are read: the read itself and the clock their keeping is measured by. */
export interface PreviewReading {
  read: (address: string, limits: WebReadLimits) => Promise<WebRead>;
  now: () => number;
  /** The address ranges the read reaches although the check refuses them. */
  open: WebReadLimits["open"];
}

interface Kept<T> {
  until: number;
  value: Promise<T>;
}

// Answers kept by address, the oldest let go once more than the most are kept, a read under way shared by everyone
// asking for the same address meanwhile.
class KeptReads<T> {
  private readonly kept = new Map<string, Kept<T>>();

  constructor(private readonly keptFor: (value: T) => number) {}

  get(address: string, now: number, read: () => Promise<T>): Promise<T> {
    const standing = this.kept.get(address);

    if (standing !== undefined && standing.until > now) return standing.value;

    const value = read();
    const entry: Kept<T> = { until: Number.POSITIVE_INFINITY, value };

    this.kept.delete(address);
    this.kept.set(address, entry);
    void value.then((answered) => {
      entry.until = now + this.keptFor(answered);
    });

    while (this.kept.size > MAX_KEPT) this.kept.delete(this.kept.keys().next().value!);

    return value;
  }
}

// The type a server named, with its parameters set aside; empty where it named none that reads.
function essence(contentType: string): string {
  try {
    return new MIMEType(contentType).essence;
  } catch {
    return "";
  }
}

/** The reading of the open web the server does by itself, letting through the ranges its setting names. */
export function webPreviewReading(): PreviewReading {
  return { read: readWeb, now: Date.now, open: addressRanges(process.env.LINK_PREVIEW_OPEN_RANGES) };
}

/** Reads the head of the page at each address and the picture it names, each kept by address. */
export class LinkPreviews {
  private readonly heads = new KeptReads<PageHead | null>((head) => (head === null ? FAILED_KEPT_MS : READ_KEPT_MS));
  private readonly pictures = new KeptReads<CardPicture | null>((picture) => (picture === null ? FAILED_KEPT_MS : READ_KEPT_MS));

  constructor(private readonly reading: PreviewReading) {}

  /** What the page at an address declares for sharing; null where it could not be read as a page. */
  head(address: string): Promise<PageHead | null> {
    return this.heads.get(address, this.reading.now(), async () => {
      try {
        const page = await this.reading.read(address, { ...PAGE_LIMITS, open: this.reading.open });

        if (!PAGE_TYPES.has(essence(page.contentType))) return null;

        return pageHead(pageText(page.bytes, page.contentType), page.url);
      } catch {
        // An address refused, a page gone or slow, or a server failing all leave the plain card alike.
        return null;
      }
    });
  }

  /** The picture at an address, redrawn as the card's square; null where it could not be read as a picture. */
  picture(address: string): Promise<CardPicture | null> {
    return this.pictures.get(address, this.reading.now(), async () => {
      try {
        const picture = await this.reading.read(address, { ...PICTURE_LIMITS, open: this.reading.open });

        if (!PICTURE_TYPES.has(essence(picture.contentType))) return null;

        const bytes = await sharp(picture.bytes)
          .rotate()
          .resize(CARD_PICTURE_PIXELS, CARD_PICTURE_PIXELS, { fit: "cover" })
          .webp({ quality: 80 })
          .toBuffer();

        return { bytes: new Uint8Array(bytes), type: "image/webp" };
      } catch {
        // A picture that cannot be read or redrawn leaves the card without one.
        return null;
      }
    });
  }
}

let serverPreviews: LinkPreviews | null = null;

/** The server's one keeper of link previews. */
export function linkPreviews(): LinkPreviews {
  serverPreviews ??= new LinkPreviews(webPreviewReading());

  return serverPreviews;
}
