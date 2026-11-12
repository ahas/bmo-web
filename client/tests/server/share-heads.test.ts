import { afterAll, afterEach, describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../support/globals";

import { attachBundles } from "../../apps/web/server/utils/console-manifests";
import { manifestOf } from "../support/console-manifest";

// A share page goes out with its card's head (docs/web.md, 「Screens a unit brings」): the shell served at a stand-in
// bundle's share address carries the tags of the head its unit answers, escaped, and every other address, and one
// whose head does not answer, goes out as it is.

const globals: Record<string, unknown> = globalThis;

globalsRestoredAfter(["defineNitroPlugin"]);
globals.defineNitroPlugin = (plugin: unknown) => plugin;

const { SHARE_HEAD_LANGUAGE, writeShareHead } = await import("../../apps/web/server/plugins/share-heads");

const BASE = "/bmo/";
const SHELL = '<meta name="viewport" content="width=device-width">';

// What each ask of the unit carried: its address and its headers, read as it came.
const asked: { url: URL; headers: Headers }[] = [];
let answer: (request: Request) => Response = () => Response.json({}, { status: 404 });
const served = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    asked.push({ url: new URL(request.url), headers: new Headers(request.headers) });

    return answer(request);
  }
});
const unit = { address: `http://127.0.0.1:${served.port}`, token: "token-a" };

function bundleOf(fields: Record<string, unknown> = {}) {
  return {
    manifest: manifestOf("unit-a", {
      screenPath: "/notes",
      shareReads: ["/links/{token}/picture"],
      shareHead: "/links/{token}/head",
      ...fields
    }),
    unit,
    words: {}
  };
}

const head = {
  title: 'Plan "one" <two> & three',
  description: "It's <b>found</b>",
  image: "/links/Ab3_x9/picture",
  url: "https://console.example/bmo/notes/share/Ab3_x9",
  locale: "ko_KR",
  siteName: "Notes",
  type: "article",
  kind: "Plan"
};

async function servedAt(path: string): Promise<string[]> {
  const html = { head: [SHELL] };

  await writeShareHead(html, { path }, BASE);

  return html.head;
}

afterEach(() => {
  asked.splice(0);
  attachBundles([]);
});
afterAll(() => void served.stop(true));

describe("a bundle's share address", () => {
  test("goes out with the head its unit answers, every value escaped", async () => {
    attachBundles([bundleOf()]);
    answer = () => Response.json(head);

    const written = (await servedAt("/bmo/notes/share/Ab3_x9")).join("");

    expect(written.startsWith(SHELL)).toBe(true);

    for (const tag of [
      "<title>Plan &quot;one&quot; &lt;two&gt; &amp; three</title>",
      '<meta name="robots" content="noindex, nofollow">',
      '<meta name="description" content="It&#39;s &lt;b&gt;found&lt;/b&gt;">',
      '<meta property="og:type" content="article">',
      '<meta property="og:site_name" content="Notes">',
      '<meta property="og:locale" content="ko_KR">',
      '<meta property="og:title" content="Plan &quot;one&quot; &lt;two&gt; &amp; three">',
      '<meta property="og:description" content="It&#39;s &lt;b&gt;found&lt;/b&gt;">',
      '<meta property="og:url" content="https://console.example/bmo/notes/share/Ab3_x9">',
      '<meta property="og:image" content="https://console.example/bmo/api/unit-a/links/Ab3_x9/picture">',
      '<meta name="twitter:card" content="summary_large_image">',
      '<meta name="twitter:title" content="Plan &quot;one&quot; &lt;two&gt; &amp; three">',
      '<meta name="twitter:description" content="It&#39;s &lt;b&gt;found&lt;/b&gt;">',
      '<meta name="twitter:image" content="https://console.example/bmo/api/unit-a/links/Ab3_x9/picture">',
      '<link rel="canonical" href="https://console.example/bmo/notes/share/Ab3_x9">'
    ]) {
      expect(written).toContain(tag);
    }

    expect(written).not.toContain("<b>");
  });

  test("asks the unit with its token alone, no owner key or role, in the console's language", async () => {
    attachBundles([bundleOf()]);
    answer = () => Response.json(head);

    await servedAt("/bmo/notes/share/Ab3_x9?from=room");

    expect(asked).toHaveLength(1);

    const [one] = asked;
    const url = one!.url;

    expect(url.pathname).toBe("/links/Ab3_x9/head");
    expect(url.searchParams.get("language")).toBe(SHARE_HEAD_LANGUAGE);
    expect(one!.headers.get("authorization")).toBe("Bearer token-a");
    expect(one!.headers.get("owner-key")).toBeNull();
    expect(one!.headers.get("owner-role")).toBeNull();
  });

  test("names no picture where the head has none or names a path that is no share read, and no description where it has none", async () => {
    attachBundles([bundleOf()]);

    for (const image of [undefined, "/links/Ab3_x9/secret"]) {
      answer = () => Response.json({ ...head, image, description: undefined });

      const written = (await servedAt("/bmo/notes/share/Ab3_x9")).join("");

      expect(written).toContain('<meta name="twitter:card" content="summary">');
      expect(written).not.toContain("og:image");
      expect(written).not.toContain("twitter:image");
      expect(written).not.toContain("description");
      expect(written).toContain("<title>");
    }
  });
});

describe("the shell goes out as it is", () => {
  test("at every address that is no share address, and the unit is not asked", async () => {
    attachBundles([bundleOf()]);
    answer = () => Response.json(head);

    for (const path of ["/bmo/notes", "/bmo/notes/42", "/bmo/notes/share", "/bmo/notes/share/", "/bmo/notes/share/Ab3_x9/more", "/bmo/rooms", "/bmo/other/share/Ab3_x9", "/bmo/notes/share/.."]) {
      expect(await servedAt(path)).toEqual([SHELL]);
    }

    expect(asked).toEqual([]);
  });

  test("where the unit answers 404, anything but a 200, or a head out of the shape", async () => {
    attachBundles([bundleOf()]);

    for (const refused of [
      () => Response.json({ code: "not-found" }, { status: 404 }),
      () => Response.json({ code: "gone" }, { status: 410 }),
      () => Response.json({ ...head, url: "/notes/share/Ab3_x9" }),
      () => new Response("<meta>", { headers: { "content-type": "text/html" } })
    ]) {
      answer = refused;

      expect(await servedAt("/bmo/notes/share/Ab3_x9")).toEqual([SHELL]);
    }
  });

  test("where no unit answers, or the manifest names no share head", async () => {
    attachBundles([{ ...bundleOf(), unit: { address: "http://[::1]:1", token: null } }]);

    expect(await servedAt("/bmo/notes/share/Ab3_x9")).toEqual([SHELL]);

    attachBundles([bundleOf({ shareHead: undefined })]);
    answer = () => Response.json(head);

    expect(await servedAt("/bmo/notes/share/Ab3_x9")).toEqual([SHELL]);
    expect(asked).toEqual([]);
  });
});
