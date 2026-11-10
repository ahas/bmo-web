import { describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../../support/globals";
import { mkdirSync, readdirSync, utimesSync } from "node:fs";
import { join } from "node:path";

import { scratchDir } from "../../support/scratch";

import { fail } from "../../../apps/web/server/utils/fail";
import { answerSend, claimSend, readSend, releaseSend, SEND_KEY_SECONDS, sendKeyOf, sendOnce, sweepSends } from "../../../apps/web/server/utils/send-keys";

// What Nitro would import into the module by itself.
const globals = globalThis as Record<string, unknown>;

globalsRestoredAfter(["createError", "fail"]);
globals.createError = (options: { statusCode: number; message: string }) => Object.assign(new Error(options.message), options);
globals.fail = fail;

const root = scratchDir("bmo-send-keys-");
let drawn = 0;

// A key of the shape the screen draws, new for every test.
function key(): string {
  drawn += 1;

  return `key-${String(drawn).padStart(16, "0")}`;
}

describe("a key under its claim", () => {
  test("is fresh once, then going until its send answers, then that answer", async () => {
    const one = key();

    expect(await claimSend(7, one, root)).toEqual({ kind: "fresh" });
    expect(await claimSend(7, one, root)).toEqual({ kind: "going" });

    await answerSend(7, one, { messageId: 42 }, root);

    expect(await claimSend(7, one, root)).toEqual({ kind: "answered", answer: { messageId: 42 } });
  });

  test("of two tries at once, only one is fresh", async () => {
    const one = key();
    const claims = await Promise.all([claimSend(7, one, root), claimSend(7, one, root)]);

    expect(claims.map((claim) => claim.kind).sort()).toEqual(["fresh", "going"]);
  });

  test("is a room's own: the same key in another room is another send", async () => {
    const one = key();

    await claimSend(7, one, root);

    expect(await claimSend(8, one, root)).toEqual({ kind: "fresh" });
  });

  test("released, is fresh again", async () => {
    const one = key();

    await claimSend(7, one, root);
    await releaseSend(7, one, root);

    expect(await claimSend(7, one, root)).toEqual({ kind: "fresh" });
  });

  test("is swept once it is older than it is kept, and not before", async () => {
    const swept = join(root, "swept");

    mkdirSync(swept);
    const [old, young] = [key(), key()];
    const now = Date.now();

    await claimSend(7, old, swept, now);
    await claimSend(7, young, swept, now);
    utimesSync(join(swept, `7_${old}.json`), new Date(now - SEND_KEY_SECONDS * 1000), new Date(now - SEND_KEY_SECONDS * 1000));
    await sweepSends(swept, now);

    expect(readdirSync(swept)).toEqual([`7_${young}.json`]);
  });
});

describe("what a send carries as its key", () => {
  test("nothing, or a key of the screen's shape", () => {
    expect(sendKeyOf(undefined)).toBeNull();
    expect(sendKeyOf("")).toBeNull();
    expect(sendKeyOf("0123456789abcdef0123456789abcdef")).toBe("0123456789abcdef0123456789abcdef");
  });

  test("anything else is refused, rather than sent unguarded", () => {
    for (const bad of ["short", "../../etc/passwd-0000000000", 42, "a key with spaces in it"]) {
      expect(() => sendKeyOf(bad)).toThrow();
    }
  });
});

describe("a send under its key", () => {
  const going = () => "going" as const;

  test("reaches the bot once however often it is tried, and every try hands back its answer", async () => {
    const one = key();
    let sent = 0;
    const send = async () => {
      sent += 1;

      return `message ${sent}`;
    };

    expect(await sendOnce(7, one, send, going, root)).toBe("message 1");
    expect(await sendOnce(7, one, send, going, root)).toBe("message 1");
    expect(sent).toBe(1);
  });

  test("tried while the first try is still going answers as going, and sends nothing", async () => {
    const one = key();
    let finish: (value: string) => void = () => undefined;
    let sent = 0;
    let started: () => void = () => undefined;
    const sending = new Promise<void>((resolve) => (started = resolve));
    const first = sendOnce(7, one, () => {
      sent += 1;
      started();

      return new Promise<string>((resolve) => (finish = resolve));
    }, going, root);

    // The first try's claim is made before its send starts, however long its files take.
    await sending;

    expect(await sendOnce(7, one, async () => "twice", going, root)).toBe("going");
    finish("once");
    expect(await first).toBe("once");
    expect(sent).toBe(1);
  });

  test("that the bot did not take frees its key, so the next try sends", async () => {
    const one = key();

    await expect(sendOnce(7, one, () => Promise.reject(fail(503, "no bot")), going, root)).rejects.toThrow("no bot");
    expect(await sendOnce(7, one, async () => "sent", going, root)).toBe("sent");
  });

  test("that the bot refused frees its key too, and its next try meets the refusal again", async () => {
    const one = key();

    await expect(sendOnce(7, one, () => Promise.reject(fail(409, "refused")), going, root)).rejects.toThrow("refused");
    expect(await readSend(7, one, root)).toEqual({ state: "unknown" });
    await expect(sendOnce(7, one, () => Promise.reject(fail(409, "refused")), going, root)).rejects.toThrow("refused");
  });

  test("with no key is simply sent, every time", async () => {
    let sent = 0;
    const send = async () => (sent += 1);

    await sendOnce(7, null, send, () => 0, root);
    await sendOnce(7, null, send, () => 0, root);

    expect(sent).toBe(2);
  });
});

describe("what a key came to, read without claiming it", () => {
  test("nothing for a key never handed over, going while claimed, then its answer", async () => {
    const one = key();

    expect(await readSend(7, one, root)).toEqual({ state: "unknown" });
    await claimSend(7, one, root);
    expect(await readSend(7, one, root)).toEqual({ state: "going" });
    await answerSend(7, one, { messageId: 42 }, root);
    expect(await readSend(7, one, root)).toEqual({ state: "answered", answer: { messageId: 42 } });
  });
});

describe("a send that takes its time", () => {
  const going = () => "going" as const;

  test("is waited for however long it takes, and what it went out as is written under its key", async () => {
    const one = key();
    let finish: (answer: string) => void = () => undefined;
    const first = sendOnce(7, one, () => new Promise<string>((resolve) => (finish = resolve)), going, root);

    await Bun.sleep(20);
    expect(await readSend(7, one, root)).toEqual({ state: "going" });

    finish("message 9");

    expect(await first).toBe("message 9");
    expect(await readSend(7, one, root)).toEqual({ state: "answered", answer: "message 9" });
    expect(await sendOnce(7, one, async () => "twice", going, root)).toBe("message 9");
  });
});
