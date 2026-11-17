import { callHostedTool, HostedToolFailed, settingsToolSession } from "./tool-host";

import type { ToolResult } from "./tool-host";

// A link card's page and picture, read through bmo-explorer's entries on the tool host once per address and kept
// (docs/web.md, the link previews rule): a page's head for six hours, a page that could not be read for fifteen
// minutes, and the picture's card form as long as its page. bmo-explorer bounds no call by a clock, so each call is
// bounded by the console's own wait.

const LINK_PREVIEW = { namespace: "explorer", name: "link_preview" };
const FETCH_RASTER = { namespace: "explorer", name: "fetch_raster" };

// Whose requests bmo-explorer paces together: every link card the console reads.
const PACING = "link-cards";

const PAGE_WAIT_MS = 5_000;
const PICTURE_WAIT_MS = 8_000;

const READ_KEPT_MS = 6 * 60 * 60 * 1000;
const FAILED_KEPT_MS = 15 * 60 * 1000;
const MAX_KEPT = 1_000;

// The square a card's picture is cut to, in device pixels: the card's square at up to three device pixels to one.
export const CARD_PICTURE_PIXELS = 240;

/** A page as a link card shows it; each field null where the page declares nothing for it. */
export interface PageHead {
  title: string | null;
  description: string | null;
  siteName: string | null;
  /** The picture's absolute web address. */
  image: string | null;
}

/** The card picture's bytes and their type. */
export interface CardPicture {
  bytes: Uint8Array;
  type: string;
}

/** How a page and a picture are read: one hosted tool's call, waited on at most so long, and the clock their keeping
 * is measured by. */
export interface PreviewReading {
  call: (tool: { namespace: string; name: string }, input: Record<string, unknown>, waitMs: number) => Promise<ToolResult>;
  now: () => number;
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

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

// What the link preview entry answers of a page's head; null where its answer carries none.
function pageHeadOf(result: ToolResult): PageHead | null {
  const answer = result.structuredContent;

  if (typeof answer !== "object" || answer === null) return null;

  const head = answer as Record<string, unknown>;

  return { title: text(head.title), description: text(head.description), siteName: text(head.siteName), image: text(head.image) };
}

// The picture the picture entry answers as its one image piece; null where it answers none.
function cardPictureOf(result: ToolResult): CardPicture | null {
  const piece = result.content?.find((one) => one.type === "image");

  if (piece?.data === undefined || piece.mimeType === undefined) return null;

  const bytes = Buffer.from(piece.data, "base64");

  return bytes.length === 0 ? null : { bytes: new Uint8Array(bytes), type: piece.mimeType };
}

/** The reading through the console's own tool session, as its settings name it. */
export function hostedPreviewReading(): PreviewReading {
  return {
    now: Date.now,
    call: (tool, input, waitMs) => {
      const session = settingsToolSession();

      if (session === null) return Promise.reject(new HostedToolFailed("the console's settings name no tool session"));

      return callHostedTool(session, tool, input, waitMs);
    }
  };
}

/** Reads the head of the page at each address and the picture it names, each kept by address. */
export class LinkPreviews {
  private readonly heads = new KeptReads<PageHead | null>((head) => (head === null ? FAILED_KEPT_MS : READ_KEPT_MS));
  private readonly pictures = new KeptReads<CardPicture | null>((picture) => (picture === null ? FAILED_KEPT_MS : READ_KEPT_MS));

  constructor(private readonly reading: PreviewReading) {}

  /** What the page at an address declares for sharing; null where it could not be read. */
  head(address: string): Promise<PageHead | null> {
    return this.heads.get(address, this.reading.now(), async () => {
      try {
        return pageHeadOf(await this.reading.call(LINK_PREVIEW, { address, pacing: PACING }, PAGE_WAIT_MS));
      } catch {
        // No session, a call refused, slow or failed, and a page gone all leave the plain card alike.
        return null;
      }
    });
  }

  /** The picture at an address, cut to the card's square; null where it could not be read as a picture. */
  picture(address: string): Promise<CardPicture | null> {
    return this.pictures.get(address, this.reading.now(), async () => {
      try {
        const input = { address, pacing: PACING, square: CARD_PICTURE_PIXELS };

        return cardPictureOf(await this.reading.call(FETCH_RASTER, input, PICTURE_WAIT_MS));
      } catch {
        // A picture that cannot be read leaves the card without one.
        return null;
      }
    });
  }
}

let serverPreviews: LinkPreviews | null = null;

/** The server's one keeper of link previews. */
export function linkPreviews(): LinkPreviews {
  serverPreviews ??= new LinkPreviews(hostedPreviewReading());

  return serverPreviews;
}
