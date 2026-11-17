import { describe, expect, test } from "bun:test";

import { pageHead, pageText } from "../../../apps/web/server/utils/page-head";

// What a page's head declares for a link card (docs/web.md, the link previews rule): the Open Graph tags first, the
// document title and the meta description where the page declares no title or description for sharing.

const ADDRESS = "https://site.example/articles/one";

function page(head: string, body = "<p>body</p>"): string {
  return `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
}

describe("pageHead", () => {
  test("reads the title, description, site and picture the sharing tags declare", () => {
    const head = pageHead(
      page(`<title>document title</title><meta name="description" content="meta description">
        <meta property="og:title" content="Sharing title"><meta property="og:description" content="Sharing description">
        <meta property="og:site_name" content="Example Site"><meta property="og:image" content="https://cdn.example/picture.jpg">`),
      ADDRESS
    );

    expect(head).toEqual({
      title: "Sharing title",
      description: "Sharing description",
      siteName: "Example Site",
      image: "https://cdn.example/picture.jpg"
    });
  });

  test("falls back to the document title and the meta description, and names no site or picture it was not given", () => {
    const head = pageHead(page(`<title>  Plain\n  title </title><meta name="description" content="Plain description">`), ADDRESS);

    expect(head).toEqual({ title: "Plain title", description: "Plain description", siteName: null, image: null });
  });

  test("passes over a sharing tag left empty for the next that says something", () => {
    const head = pageHead(page(`<meta property="og:title" content=" "><title>Fallback title</title><meta property="og:image" content="">`), ADDRESS);

    expect(head.title).toBe("Fallback title");
    expect(head.image).toBeNull();
  });

  test("takes a relative picture address against where the page was read, and drops one that is no web address", () => {
    expect(pageHead(page(`<meta property="og:image" content="/media/card.png">`), ADDRESS).image).toBe("https://site.example/media/card.png");
    expect(pageHead(page(`<meta property="og:image" content="javascript:alert(1)">`), ADDRESS).image).toBeNull();
  });

  test("decodes entities and reads no tag that stands in the body", () => {
    const head = pageHead(page(`<meta property="og:title" content="Fish &amp; Chips">`, `<meta property="og:description" content="from the body">`), ADDRESS);

    expect(head.title).toBe("Fish & Chips");
    expect(head.description).toBeNull();
  });

  test("cuts a title past its length", () => {
    const title = pageHead(page(`<title>${"a".repeat(400)}</title>`), ADDRESS).title!;

    expect(title.length).toBe(300);
    expect(title.slice(0, 299)).toBe("a".repeat(299));
    expect(title.at(-1)).not.toBe("a");
  });
});

describe("pageText", () => {
  // Two syllables of a legacy double-byte charset, which read as something else in UTF-8.
  const legacy = new Uint8Array([0xc1, 0xa6, 0xb8, 0xf1]);
  const words = new TextDecoder("euc-kr").decode(legacy);

  test("decodes in the charset the server names", () => {
    expect(words).not.toBe(new TextDecoder("utf-8").decode(legacy));
    expect(pageText(legacy, "text/html; charset=EUC-KR")).toBe(words);
  });

  test("decodes in the charset the page's own markup names where the server names none", () => {
    const head = new TextEncoder().encode('<html><head><meta charset="euc-kr"><title>');
    const bytes = new Uint8Array([...head, ...legacy]);

    expect(pageText(bytes, "text/html")).toContain(words);
  });

  test("reads UTF-8 where the charset named is none the decoder knows", () => {
    expect(pageText(new TextEncoder().encode(words), "text/html; charset=no-such-charset")).toBe(words);
  });
});
