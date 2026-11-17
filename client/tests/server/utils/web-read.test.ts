import { afterAll, describe, expect, test } from "bun:test";

import { addressRanges, readWeb, refusedAddress, WebReadRefused } from "../../../apps/web/server/utils/web-read";

import type { WebReadLimits } from "../../../apps/web/server/utils/web-read";

// A link card's read of the open web (docs/web.md, the link previews rule): only public addresses, checked before every
// request and on every redirect, within its time and size. The pages here stand on loopback, which the read reaches
// only where the ranges it is given let it through.

const LOOPBACK = addressRanges("127.0.0.0/8, ::1/128");
const PAGE = "<html><head><title>stand-in</title></head></html>";

// A page that never answers, held open until the test is done with it.
const silent: Array<() => void> = [];

const site = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch(request) {
    const path = new URL(request.url).pathname;

    if (path === "/page") return new Response(PAGE, { headers: { "content-type": "text/html" } });
    if (path === "/hop") return Response.redirect("/page", 302);
    if (path === "/to-metadata") return Response.redirect("http://169.254.169.254/page", 302);
    if (path === "/loop") return Response.redirect("/loop", 302);
    if (path === "/long") return new Response("x".repeat(4096), { headers: { "content-type": "text/plain" } });
    if (path === "/gone") return new Response("gone", { status: 404 });
    if (path === "/silent") return new Promise<Response>((answer) => silent.push(() => answer(new Response("late"))));

    return new Response("no", { status: 404 });
  }
});

afterAll(() => {
  for (const answer of silent) answer();
  void site.stop(true);
});

const at = (path: string) => `http://127.0.0.1:${site.port}${path}`;

function limits(over: Partial<WebReadLimits> = {}): WebReadLimits {
  return { timeoutMs: 2_000, maxBytes: 1024, whole: false, accept: "text/html", open: LOOPBACK, ...over };
}

async function refusal(read: Promise<unknown>): Promise<string> {
  try {
    await read;
  } catch (error) {
    expect(error).toBeInstanceOf(Error);

    return (error as Error).message;
  }

  throw new Error("the read was not refused");
}

describe("refusedAddress", () => {
  test("refuses loopback, link-local and metadata, shared, documentation, multicast and reserved addresses, and what is no address", () => {
    for (const address of ["127.0.0.1", "169.254.169.254", "100.64.0.1", "192.0.2.1", "224.0.0.1", "0.0.0.0", "240.0.0.1", "::1", "::ffff:127.0.0.1", "2001:db8::1", "not-an-address"]) {
      expect(refusedAddress(address, null)).toBe(true);
    }
  });

  test("lets a public address through", () => {
    for (const address of ["93.184.215.14", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
      expect(refusedAddress(address, null)).toBe(false);
    }
  });

  test("lets through the ranges it is given and no other", () => {
    expect(refusedAddress("127.0.0.1", LOOPBACK)).toBe(false);
    expect(refusedAddress("169.254.169.254", LOOPBACK)).toBe(true);
  });
});

describe("addressRanges", () => {
  test("names nothing for an empty setting and refuses a range that does not read", () => {
    expect(addressRanges(undefined)).toBeNull();
    expect(addressRanges(" ")).toBeNull();
    expect(() => addressRanges("loopback")).toThrow();
    expect(addressRanges("127.0.0.0/8, ::1/128")).toHaveLength(2);
  });
});

describe("readWeb", () => {
  test("reads a page and says where it ended, following a redirect", async () => {
    const page = await readWeb(at("/hop"), limits());

    expect(new TextDecoder().decode(page.bytes)).toBe(PAGE);
    expect(page.url).toBe(at("/page"));
    expect(page.contentType).toBe("text/html");
  });

  test("refuses a loopback address it was not let through to, before any request", async () => {
    expect(await refusal(readWeb(at("/page"), limits({ open: null })))).toContain("refused address");
  });

  test("refuses a name that resolves to an address it was not let through to", async () => {
    expect(await refusal(readWeb(`http://localhost:${site.port}/page`, limits({ open: null })))).toContain("refused address");
  });

  test("checks the address a redirect leads to", async () => {
    expect(await refusal(readWeb(at("/to-metadata"), limits()))).toContain("refused address 169.254.169.254");
  });

  test("refuses an address that is not a web address", async () => {
    expect(await refusal(readWeb("file:///etc/hostname", limits()))).toContain("not a web address");
  });

  test("stops following redirects past five", async () => {
    expect(await refusal(readWeb(at("/loop"), limits()))).toContain("redirects");
  });

  test("refuses an answer other than a page", async () => {
    expect(await refusal(readWeb(at("/gone"), limits()))).toContain("404");
  });

  test("cuts a long answer at its bytes, or refuses it where it must be whole", async () => {
    expect((await readWeb(at("/long"), limits({ maxBytes: 100 }))).bytes.byteLength).toBe(100);
    expect(await refusal(readWeb(at("/long"), limits({ maxBytes: 100, whole: true })))).toContain("bytes");
  });

  test("gives up on a page that does not answer in time", async () => {
    const message = await refusal(readWeb(at("/silent"), limits({ timeoutMs: 50 })));

    expect(message).toContain("no answer within 50 ms");
  });

  test("names its refusals as its own", async () => {
    await readWeb(at("/gone"), limits()).catch((error: unknown) => expect(error).toBeInstanceOf(WebReadRefused));
  });
});
