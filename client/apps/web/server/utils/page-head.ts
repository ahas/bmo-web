import { Parser } from "htmlparser2";
import { MIMEType } from "node:util";

// What a page's head declares for sharing it (docs/web.md, the link previews rule): its Open Graph tags, with the
// document title and the meta description standing in where the page declares no title or description of its own.

/** A page as a link card shows it; each field null where the page declares nothing for it. */
export interface PageHead {
  title: string | null;
  description: string | null;
  siteName: string | null;
  /** The picture's absolute web address. */
  image: string | null;
}

const MAX_TITLE = 300;
const MAX_DESCRIPTION = 600;

// The tags each field is read from, first declared first.
const TITLE_TAGS = ["og:title", "twitter:title"];
const DESCRIPTION_TAGS = ["og:description", "twitter:description", "description"];
const SITE_TAGS = ["og:site_name"];
const IMAGE_TAGS = ["og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src"];

// How many bytes the charset a page names for itself is looked for in.
const CHARSET_SNIFF_BYTES = 4096;

function cleaned(text: string | undefined, most: number): string | null {
  const one = (text ?? "").replace(/\s+/g, " ").trim();

  if (one === "") return null;

  return one.length > most ? `${one.slice(0, most - 1)}\u2026` : one;
}

function charsetOf(contentType: string | undefined): string | null {
  if (contentType === undefined || contentType.trim() === "") return null;

  try {
    return new MIMEType(contentType).params.get("charset");
  } catch {
    return null;
  }
}

// The charset the page's own markup names in its first bytes: a meta charset, or the type an http-equiv names.
function namedCharset(bytes: Uint8Array): string | null {
  let named: string | null = null;
  const parser = new Parser({
    onopentag(name, attributes) {
      if (named !== null || name !== "meta") return;
      if (attributes.charset !== undefined) named = attributes.charset.trim();
      else if (attributes["http-equiv"]?.toLowerCase() === "content-type") named = charsetOf(attributes.content);
    }
  });

  parser.end(new TextDecoder("latin1").decode(bytes.subarray(0, CHARSET_SNIFF_BYTES)));

  return named;
}

/** A page's bytes as text, in the charset its server or its own markup names, UTF-8 where neither names one that
 * reads. */
export function pageText(bytes: Uint8Array, contentType: string): string {
  const charset = charsetOf(contentType) ?? namedCharset(bytes) ?? "utf-8";

  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function webAddress(address: string | undefined, base: string): string | null {
  if (address === undefined || address.trim() === "") return null;

  try {
    const url = new URL(address.trim(), base);

    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** What a page's head declares for sharing, read from its markup; `address` is where the page was read from, which
 * a relative picture address is taken against. */
export function pageHead(html: string, address: string): PageHead {
  const tags = new Map<string, string>();
  let title = "";
  let inTitle = false;
  let titled = false;
  let inBody = false;

  const parser = new Parser(
    {
      onopentag(name, attributes) {
        if (inBody) return;
        if (name === "body") {
          inBody = true;

          return;
        }
        if (name === "title" && !titled) inTitle = true;
        if (name !== "meta") return;

        const key = (attributes.property ?? attributes.name ?? "").trim().toLowerCase();
        const content = attributes.content;

        if (key !== "" && content !== undefined && !tags.has(key)) tags.set(key, content);
      },
      ontext(text) {
        if (inTitle) title += text;
      },
      onclosetag(name) {
        if (name === "title" && inTitle) {
          inTitle = false;
          titled = true;
        }
      }
    },
    { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true }
  );

  parser.end(html);

  const first = (keys: string[]) => keys.map((key) => tags.get(key)).find((value) => cleaned(value, 1) !== null);

  return {
    title: cleaned(first(TITLE_TAGS), MAX_TITLE) ?? cleaned(title, MAX_TITLE),
    description: cleaned(first(DESCRIPTION_TAGS), MAX_DESCRIPTION),
    siteName: cleaned(first(SITE_TAGS), MAX_TITLE),
    image: webAddress(first(IMAGE_TAGS), address)
  };
}
