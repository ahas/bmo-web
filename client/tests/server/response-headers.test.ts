import { describe, expect, test } from "bun:test";
import { createApp, createRouter, eventHandler, setResponseHeader, toWebHandler } from "h3";

// The lines every answer of the console carries for the browser (docs/web.md, 「Access」), on an app standing the
// plugin's two hooks where the server calls them: a page the renderer draws, a route's own answer, and a relayed
// unit's answer that sets lines of its own, which stand in place of the console's.

const globals: Record<string, unknown> = globalThis;

globals.defineNitroPlugin = (plugin: unknown) => plugin;

const { CONSOLE_HEADERS, dropPoweredBy, standConsoleHeaders, standResponseHeaders } = await import("../../apps/web/server/plugins/response-headers");

const router = createRouter()
  .get(
    "/page",
    eventHandler((event) => {
      // The page renderer names itself as it draws.
      setResponseHeader(event, "x-powered-by", "Nuxt");
      setResponseHeader(event, "content-type", "text/html;charset=utf-8");

      return "<!doctype html>";
    })
  )
  .get(
    "/relayed",
    eventHandler(() => new Response("{}", { headers: { "content-security-policy": "default-src 'none'", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" } }))
  );
const app = createApp({ onRequest: standConsoleHeaders, onBeforeResponse: dropPoweredBy }).use(router);
const ask = (path: string): Promise<Response> => toWebHandler(app)(new Request(`http://localhost${path}`));

describe("the console's answers", () => {
  test("carry nosniff, a same-origin referrer and no framing by any page", async () => {
    const page = await ask("/page");

    expect(page.headers.get("x-content-type-options")).toBe("nosniff");
    expect(page.headers.get("referrer-policy")).toBe("same-origin");
    expect(page.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
  });

  test("never say which framework drew them", async () => {
    expect((await ask("/page")).headers.get("x-powered-by")).toBeNull();
  });

  test("carry the console's lines on a path nothing answers as well", async () => {
    const missing = await ask("/nowhere");

    expect(missing.headers.get("content-security-policy")).toBe(CONSOLE_HEADERS["content-security-policy"]);
  });

  test("give way to the lines a relayed unit set of its own", async () => {
    const relayed = await ask("/relayed");

    expect(relayed.headers.get("content-security-policy")).toBe("default-src 'none'");
    expect(relayed.headers.get("referrer-policy")).toBe("no-referrer");
  });

  test("stand on the server's request and response hooks", () => {
    const hooked: Record<string, unknown> = {};

    standResponseHeaders({ hooks: { hook: (name, run) => (hooked[name] = run) } });

    expect(hooked).toEqual({ request: standConsoleHeaders, beforeResponse: dropPoweredBy });
  });
});
