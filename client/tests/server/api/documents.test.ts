import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { asked, routeOf } from "../../support/nitro";
import { scratchDir } from "../../support/scratch";
import { answer, standIn } from "../../support/units";
import { scratchWebDatabase } from "../../support/web-database";

import type { DocumentFragmentView, DocumentList, DocumentSeekResult, DocumentTalk, DocumentTranslation, DocumentView } from "../../../apps/web/shared/types";

// The document viewer's routes over a checkout of the test's own, a stood-in brain for the fragments and a
// stood-in receiver for the talk. What is pinned here is that the list holds the checkout's documents and stands
// the other units' roots unread, that a question is answered from the text, that a translation is the stood-in
// translator's — the parts it kept, each failed part's sentence, and the parts handed to it — and unavailable where no
// translator is named,
// that the fragment switch writes the brain's row, and that a turn of the talk writes the owner's words at once,
// the chat agent's answer when the receiver's talk comes back, and why it came back with nothing where it did.

await scratchWebDatabase();

const scratch = scratchDir("bmo-web-document-routes-");
const checkout = join(scratch, "checkout");

function put(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

put(join(checkout, "README.md"), "# The checkout\n");
put(join(checkout, "docs", "deploy.md"), "# Deployment\n\n## Rolling back\n\nThe release before is put back when the health check fails.\n");
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

process.env.DOCUMENT_ROOTS = JSON.stringify([{ key: "first", label: "First", checkout }]);

function fragmentOf(state: string): Record<string, unknown> {
  return {
    id: 1,
    key: "readme",
    kind: "system-document",
    scope: null,
    subjectKey: null,
    title: "What the checkout is",
    path: "README.md",
    text: "",
    state,
    switchedOff: [],
    labels: { agent: "agent-a", keywords: "", handAt: "300000" },
    hitCount: 0,
    lastHitAt: null,
    createdAt: 0,
    changedAt: 0,
    version: "v1",
    libraryName: null
  };
}

// The translator: the first part of every version it is asked of kept as failed, with the sentence it said.
const translator = standIn("GATE", (one) => {
  const path = one.path.split("?")[0]!;

  if (path === "/documents/translations/parts") {
    return answer({ items: [{ part: 0, text: null, failed: true, failure: "The answer dropped a heading." }], more: false });
  }

  if (path === "/documents/translations/state") return answer({ pending: 0, failure: null });
  if (path === "/documents/translations" && one.method === "POST") return answer({ taken: (one.body?.wanted as unknown[]).length }, 202);

  return answer({ code: "no-route", error: "Not served here." }, 404);
});

const brain = standIn("BRAIN", (one) => {
  const path = one.path.split("?")[0]!;

  if (path === "/fragment-kinds") return answer({ items: [{ name: "system-document", description: "", fragmentCount: 1 }], more: false });
  if (path === "/fragments") {
    return answer({ items: [fragmentOf("active")], more: false });
  }
  if (one.method === "PATCH" && path === "/fragments/readme") {
    return answer(fragmentOf(one.body?.state === "active" ? "active" : "off"));
  }

  return answer({ code: "no-route", error: "no route" }, 404);
});

// The receiver's talk, held until the test lets it answer, as a turn waits behind a running round.
let release: (reply: Response) => void = () => undefined;

const receiver = standIn("RECEIVER", (one) => {
  if (one.path === "/talks") return new Promise<Response>((resolve) => (release = resolve));

  return answer({ code: "not-found", error: "no route" }, 404);
});

const { onConsoleEvent } = await import("../../../apps/web/server/utils/console-events");
const { wording } = await import("../../../apps/web/shared/wording");

const heard: unknown[] = [];

onConsoleEvent((event) => heard.push(event));

const list = await routeOf<DocumentList>("../../apps/web/server/api/documents/index.get.ts");
const file = await routeOf<DocumentView>("../../apps/web/server/api/documents/file.get.ts");
const seek = await routeOf<DocumentSeekResult>("../../apps/web/server/api/documents/seek.post.ts");
const translation = await routeOf<unknown>("../../apps/web/server/api/documents/translation.get.ts");
const translate = await routeOf<unknown>("../../apps/web/server/api/documents/translation.post.ts");
const fragment = await routeOf<DocumentFragmentView>("../../apps/web/server/api/documents/fragment.post.ts");
const talk = await routeOf<DocumentTalk>("../../apps/web/server/api/documents/talk.get.ts");
const say = await routeOf<{ ok: true }>("../../apps/web/server/api/documents/talk.post.ts");

const deploy = { root: "first", path: "docs/deploy.md" };

// Until the receiver has been handed the given count of turns.
async function handed(count: number): Promise<void> {
  for (let tries = 0; tries < 100 && receiver.asked.filter((one) => one.path === "/talks").length < count; tries += 1) {
    await Bun.sleep(10);
  }
}

// Until the turn handed to the receiver has come back and the drawer would read it as done.
async function settled(): Promise<DocumentTalk> {
  for (let tries = 0; tries < 100; tries += 1) {
    const now = await talk({ query: deploy });

    if (!now.answering) return now;

    await Bun.sleep(10);
  }

  throw new Error("the talk did not settle");
}

describe("the list", () => {
  test("holds the checkout's documents, its fragment by the brain's row, and the other units' roots unread", async () => {
    const read = await list({});

    expect(read.documents.map((entry) => [entry.root, entry.path, entry.fragment?.slug ?? null])).toEqual([
      ["first", "docs/deploy.md", null],
      ["first", "README.md", "readme"]
    ]);
    expect(read.roots[0]).toMatchObject({ key: "first", label: "First", available: true });
    expect(read.roots.slice(1).every((root) => !root.available)).toBe(true);
    expect(read.translation).toBe(true);
  });
});

describe("a document", () => {
  test("is read whole, and a name that is no document is the one 404", async () => {
    expect((await file({ query: deploy })).title).toBe("Deployment");
    expect(await asked(file, { query: { root: "first", path: "../outside.md" } })).toMatchObject({ status: 404, message: wording("documents.error.no_such_document") });
    expect(await asked(file, { query: { root: "knowledge", path: "index.md" } })).toMatchObject({ status: 404 });
  });

  test("answers a question from its text, and an empty one is refused", async () => {
    expect((await seek({ body: { question: "when does the health check fail", ...deploy } })).picks).toEqual([{ ...deploy, title: "Deployment", heading: "rolling-back" }]);
    expect((await seek({ body: { question: "health check" } })).picks[0]).toMatchObject(deploy);
    expect(await asked(seek, { body: { question: " " } })).toMatchObject({ status: 400, message: wording("documents.error.seek_empty") });
  });

  test("is read in translation as the translator keeps it, a failed part with the sentence it said", async () => {
    const read = (await translation({ query: deploy })) as DocumentTranslation;

    expect(read.version).toMatch(/^[0-9a-f]{64}$/);
    expect(read.parts[0]).toMatchObject({ part: 0, text: null, failed: true, failure: "The answer dropped a heading." });
    expect(read.parts.slice(1).every((part) => !part.failed && part.failure === null && part.text === null)).toBe(true);
    expect(read).toMatchObject({ pending: 0, failure: null });

    const asking = translator.asked.findLast((one) => one.path.startsWith("/documents/translations/parts"))!.path;

    expect(asking).toContain("document=first%2Fdocs%2Fdeploy.md");
  });

  test("hands the translator the parts it keeps none of, and the failed ones too where asked again", async () => {
    const parts = ((await translation({ query: deploy })) as DocumentTranslation).parts.length;
    const first = (await translate({ body: deploy })) as { taken: number };
    const again = (await translate({ body: { ...deploy, retry: true } })) as { taken: number };
    const handed = translator.asked.filter((one) => one.method === "POST").map((one) => (one.body?.wanted as { part: number }[]).map((part) => part.part));

    expect(first.taken).toBe(parts - 1);
    expect(again.taken).toBe(parts);
    expect(handed.at(-1)).toContain(0);
  });

  test("has no translation where no translator is named", async () => {
    const named = process.env.GATE_ADDRESS;

    delete process.env.GATE_ADDRESS;

    try {
      expect(await asked(translation, { query: deploy })).toMatchObject({ status: 503, message: wording("documents.error.translation_unavailable") });
      expect(await asked(translate, { body: deploy })).toMatchObject({ status: 503 });
      expect((await list({})).translation).toBe(false);
    } finally {
      process.env.GATE_ADDRESS = named;
    }
  });

  test("that is a fragment is switched on the brain's row, and one that is none has no switch", async () => {
    const written = await fragment({ body: { root: "first", path: "README.md", active: false } });

    expect(brain.asked.findLast((one) => one.path === "/fragments/readme")).toMatchObject({ method: "PATCH", body: { state: "off" } });
    expect(written).toMatchObject({ active: false, kindLabel: "system-document", handAt: 300 });
    expect(await asked(fragment, { body: { ...deploy, active: false } })).toMatchObject({ status: 404, message: wording("documents.error.not_fragment") });
  });
});

describe("the talk about a document", () => {
  test("writes the owner's words at once, refuses more while they are answered, and writes the answer when it comes", async () => {
    heard.length = 0;

    await say({ body: { ...deploy, text: "Why roll back?", heading: "rolling-back", passage: "The release before is put back" } });

    const waiting = await talk({ query: deploy });

    expect(waiting.answering).toBe(true);
    expect(waiting.turns.map((turn) => [turn.speaker, turn.text, turn.passage, turn.heading])).toEqual([["owner", "Why roll back?", "The release before is put back", "rolling-back"]]);
    expect(await asked(say, { body: { ...deploy, text: "And then?" } })).toMatchObject({ status: 409, message: wording("documents.error.talk_busy") });

    // The turn went to the receiver with the document as its topic and nothing said before it.
    await handed(1);
    expect(receiver.asked.at(-1)).toMatchObject({
      path: "/talks",
      body: {
        topic: { kind: "document", document: "first/docs/deploy.md", label: "First", file: join(checkout, "docs", "deploy.md"), heading: "rolling-back", passage: "The release before is put back", translated: false },
        turns: [],
        said: "Why roll back?"
      }
    });

    release(answer({ answer: "So a failed release never stays up." }));

    const done = await settled();

    expect(done.turns.map((turn) => [turn.speaker, turn.text])).toEqual([
      ["owner", "Why roll back?"],
      ["bmo", "So a failed release never stays up."]
    ]);
    expect(done.failure).toBeNull();
    expect(heard).toEqual([
      { name: "document-talk", data: { document: "first/docs/deploy.md" } },
      { name: "document-talk", data: { document: "first/docs/deploy.md" } }
    ]);
  });

  test("hands on the earlier turns, and a turn refused for a rest writes no answer and says why", async () => {
    await say({ body: { ...deploy, text: "Is it automatic?" } });
    await handed(2);

    expect(receiver.asked.at(-1)?.body?.turns).toEqual([
      { owner: true, text: "Why roll back?" },
      { owner: false, text: "So a failed release never stays up." }
    ]);

    release(answer({ code: "resting", error: "the agent rests" }, 409));

    const done = await settled();

    expect(done.turns.at(-1)?.text).toBe("Is it automatic?");
    expect(done.failure).toBe(wording("documents.message.unanswered_resting"));
  });

  test("is refused for empty words or a name that is no document", async () => {
    expect(await asked(say, { body: { ...deploy, text: " " } })).toMatchObject({ status: 400 });
    expect(await asked(say, { body: { root: "first", path: "docs/none.md", text: "hello" } })).toMatchObject({ status: 404 });
  });
});
