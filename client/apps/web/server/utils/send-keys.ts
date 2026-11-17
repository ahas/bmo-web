import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { wording } from "#shared/wording";

import type { SendOutcomeRecord } from "#shared/types";

// The keys the room screen puts on its sends, so a send tried again — after a deployment, a reload, a
// call the browser never heard back from — reaches the bot once (docs/web.md, the room screen's section on a send going once). Each key is
// one small file under the data root, made only where none stands: making it is the claim, and two
// tries of one key can never both make it, whichever process each one reaches.

// What a key says when a send comes in under it: never seen, already answered with this, or claimed by
// a send that has not answered — still going, or cut off when this app stopped.
export type SendClaim<T> = { kind: "fresh" } | { kind: "answered"; answer: T } | { kind: "going" };

interface SendRecord<T> {
  at: number;
  answer?: T;
}

// How long a key is kept: far past any reload or deployment a send waits through.
export const SEND_KEY_SECONDS = 7 * 24 * 60 * 60;

// How often the old keys are swept, at most, while sends come in.
const SWEEP_EVERY_MS = 60 * 60 * 1000;

const KEY_SHAPE = /^[A-Za-z0-9-]{16,64}$/;

// The console's own data folder, which `WEB_DATA_DIR` names (docs/web.md, 「Settings」), inside no checkout.
export function consoleDataRoot(): string {
  const named = process.env.WEB_DATA_DIR?.trim() ?? "";

  return named === "" ? join(homedir(), ".local", "share", "bmo-web", "data") : resolve(named);
}

export function sendKeysRoot(): string {
  return join(consoleDataRoot(), "console-sends");
}

// The key a send carries, or none. A key of another shape is refused rather than ignored, since a send
// that meant to carry one would otherwise go unguarded.
export function sendKeyOf(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string" || !KEY_SHAPE.test(value)) {
    throw fail(400, wording("room.error.bad_send_key"));
  }

  return value;
}

function recordPath(root: string, chatId: number, key: string): string {
  return join(root, `${chatId}_${key}.json`);
}

let sweptAt = 0;

export async function claimSend<T>(chatId: number, key: string, root = sendKeysRoot(), now = Date.now()): Promise<SendClaim<T>> {
  await mkdir(root, { recursive: true });

  if (now - sweptAt >= SWEEP_EVERY_MS) {
    sweptAt = now;
    await sweepSends(root, now);
  }

  const path = recordPath(root, chatId, key);

  if (await made(path, now)) {
    return { kind: "fresh" };
  }

  const read = await readRecord<T>(path);
  const record = read === "unreadable" ? null : read;

  return record?.answer === undefined ? { kind: "going" } : { kind: "answered", answer: record.answer };
}

// The claim made where none stands, or false where one already does.
async function made(path: string, now: number): Promise<boolean> {
  try {
    await writeFile(path, JSON.stringify({ at: now } satisfies SendRecord<never>), { flag: "wx" });

    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }

    return false;
  }
}

// A record cut off half written is a send whose fate nobody wrote down: going, like any unanswered one.
// No record at all is null.
async function readRecord<T>(path: string): Promise<SendRecord<T> | null | "unreadable"> {
  return readFile(path, "utf8")
    .then((text) => JSON.parse(text) as SendRecord<T>)
    .catch((error: NodeJS.ErrnoException) => (error.code === "ENOENT" ? null : "unreadable"));
}

// What a key came to, read without claiming it, for the screen checking a send another try is carrying.
export async function readSend<T>(chatId: number, key: string, root = sendKeysRoot()): Promise<SendOutcomeRecord<T>> {
  const record = await readRecord<T>(recordPath(root, chatId, key));

  if (record === null) {
    return { state: "unknown" };
  }

  if (record === "unreadable") {
    return { state: "going" };
  }

  return record.answer === undefined ? { state: "going" } : { state: "answered", answer: record.answer };
}

// The answer a claimed send came back with, handed to every later try of its key. It is written beside
// the record and moved over it, so a reader never meets it half written.
export async function answerSend<T>(chatId: number, key: string, answer: T, root = sendKeysRoot(), now = Date.now()): Promise<void> {
  const path = recordPath(root, chatId, key);
  const beside = `${path}.${process.pid}.next`;

  await writeFile(beside, JSON.stringify({ at: now, answer } satisfies SendRecord<T>));
  await rename(beside, path);
}

// A claim given up: the send never reached the bot, or the bot refused it, so the next try may send.
export async function releaseSend(chatId: number, key: string, root = sendKeysRoot()): Promise<void> {
  await rm(recordPath(root, chatId, key), { force: true });
}

export async function sweepSends(root: string, now = Date.now()): Promise<void> {
  const names = await readdir(root).catch(() => [] as string[]);

  await Promise.all(
    names.map(async (name) => {
      const path = join(root, name);
      const made = await stat(path).catch(() => null);

      if (made !== null && now - made.mtimeMs >= SEND_KEY_SECONDS * 1000) {
        await rm(path, { force: true });
      }
    })
  );
}

// One send under its key: an answered key hands its answer back, a key still going answers as `going`
// says, and a fresh one is sent, waited on however long the bot takes, and its answer kept. A send that failed
// is one the bot did not take or refused, and frees the key. A send with no key is simply sent (docs/web.md, the
// room screen's section on a send going once).
export async function sendOnce<T>(chatId: number, key: string | null, send: () => Promise<T>, going: () => T, root = sendKeysRoot()): Promise<T> {
  if (key === null) {
    return send();
  }

  const claim = await claimSend<T>(chatId, key, root);

  if (claim.kind === "answered") {
    return claim.answer;
  }

  if (claim.kind === "going") {
    return going();
  }

  let answer: T;

  try {
    answer = await send();
  } catch (error) {
    await releaseSend(chatId, key, root);

    throw error;
  }

  await answerSend(chatId, key, answer, root);

  return answer;
}
