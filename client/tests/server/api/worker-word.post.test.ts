import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

// The console's own road for a word said to a worker. It launches nothing: the screen's worker is the repository
// whose worker the words are for, and the agency hands them to that worker's own session (the agency's `docs/api.md`,
// `POST /repositories/{repositoryName}/words`), taking them as the owner's alone, so any other account is refused here.

const OWNER_SENDER = 900;
// The signed-in login, account 1, is the owner's while the account service links it to the owner's sender.
let ownersLogin = true;

standIn("RECEIVER", () => answer({ room: -1, senderId: OWNER_SENDER }));
standIn("WEB_SERVER", (one) => {
  const user = one.path.match(/^\/users\/(\d+)$/)?.[1] ?? "";

  return answer({ user, name: "tester", administrator: true, senders: ownersLogin ? [OWNER_SENDER] : [] });
});

let said: "delivered" | "waiting" | "refused" = "delivered";
let reason: string | null = null;
let tooLarge = false;
const agency = standIn("AGENCY", () =>
  tooLarge
    ? answer({ code: "too-large", error: "the files are too large" }, 413)
    : answer({ said, reason })
);

const handler = await routeOf<{ ok: true }>("../../apps/web/server/api/worker-word.post");

const FORM = { "content-type": "multipart/form-data; boundary=test" };
const text = (value: string): Uint8Array => new TextEncoder().encode(value);

describe("a word from the console to one worker", () => {
  test("hands the words and the sender to the repository's worker", async () => {
    agency.asked.length = 0;
    said = "delivered";
    reason = null;
    tooLarge = false;

    expect(await asked(handler, { body: { worker: "worker-b", text: "  stop what you are doing and report  " } })).toMatchObject({
      status: 200,
      answer: { ok: true }
    });
    expect(agency.asked).toEqual([
      {
        method: "POST",
        path: "/repositories/worker-b/words",
        body: { words: "stop what you are doing and report", text: "stop what you are doing and report", by: "owner", files: [] }
      }
    ]);
  });

  test("hands the files as base64 beside the words", async () => {
    agency.asked.length = 0;
    said = "waiting";
    tooLarge = false;

    expect(await asked(handler, {
      method: "POST",
      headers: FORM,
      parts: [
        { name: "worker", data: text("worker-b") },
        { name: "text", data: text("look at this") },
        { name: "file", filename: "notes.txt", type: "text/plain", data: text("hello") }
      ]
    })).toMatchObject({ status: 200, answer: { ok: true } });
    expect(agency.asked[0]!.body).toMatchObject({
      words: "look at this",
      text: "look at this",
      by: "owner",
      files: [{ name: "notes.txt", type: "text/plain", data: Buffer.from("hello").toString("base64") }]
    });
  });

  test("refuses a file past the agency's ceiling before asking it", async () => {
    agency.asked.length = 0;
    tooLarge = false;

    expect(await asked(handler, {
      method: "POST",
      headers: FORM,
      parts: [
        { name: "worker", data: text("worker-b") },
        { name: "text", data: text("look at this") },
        { name: "file", filename: "big.bin", type: "application/octet-stream", data: new Uint8Array(8 * 1024 * 1024 + 1) }
      ]
    })).toMatchObject({ status: 413, message: wording("common.error.file_too_large") });
    expect(agency.asked).toEqual([]);
  });

  test("says the file-size sentence where the agency answers too large", async () => {
    agency.asked.length = 0;
    tooLarge = true;

    expect(await asked(handler, { body: { worker: "worker-b", text: "look at this" } })).toMatchObject({
      status: 413,
      message: wording("common.error.file_too_large")
    });
    tooLarge = false;
  });

  test("says the words did not go where the agency refused them", async () => {
    agency.asked.length = 0;
    tooLarge = false;
    said = "refused";
    reason = "there is no session to hand them to";

    expect(await asked(handler, { body: { worker: "worker-b", text: "stop" } })).toMatchObject({
      status: 502,
      message: wording("common.error.not_sent")
    });
  });

  test("refuses a word with no worker to say it to, and words that are not there", async () => {
    agency.asked.length = 0;

    expect(await asked(handler, { body: { text: "where to?" } })).toMatchObject({ status: 400 });
    expect(await asked(handler, { body: { worker: "worker-b", text: "   " } })).toMatchObject({ status: 400 });
    expect(agency.asked).toEqual([]);
  });

  test("refuses a word longer than one request may carry", async () => {
    agency.asked.length = 0;

    expect(await asked(handler, { body: { worker: "worker-b", text: "a".repeat(1_000_001) } })).toMatchObject({ status: 400 });
    expect(agency.asked).toEqual([]);
  });

  test("refuses any account but the owner's before asking the agency", async () => {
    agency.asked.length = 0;
    ownersLogin = false;

    expect(await asked(handler, { body: { worker: "worker-b", text: "stop" } })).toMatchObject({
      status: 403,
      message: wording("agents.error.word_owner_only")
    });
    expect(agency.asked).toEqual([]);
    ownersLogin = true;
  });
});
