import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { Glob } from "bun";
import { CONTROL_CHECKING, CONTROL_UNREACHABLE } from "../../../apps/web/shared/config";
import { controlLine, controlLink, useControlStatus } from "../../../apps/web/app/domain/control";

import type { ControlStatus } from "../../../apps/web/shared/types";

describe("what a screen says of the bot's control API", () => {
  test("not having heard is asking, not a failure", () => {
    expect(controlLink(null)).toBe("checking");
    expect(controlLink(false)).toBe("unreachable");
    expect(controlLink(true)).toBe("reachable");
  });

  test("asking and failing read differently, and an answer reads as nothing", () => {
    expect(controlLine(wording, "checking")).toBe(wording(CONTROL_CHECKING));
    expect(controlLine(wording, "unreachable")).toBe(wording(CONTROL_UNREACHABLE));
    expect(controlLine(wording, "reachable")).toBe("");
    expect(CONTROL_CHECKING).not.toBe(CONTROL_UNREACHABLE);
  });

  test("a screen's reading starts as asking and settles on the answer or on its failure", async () => {
    let answer: () => Promise<ControlStatus> = async () => ({ reachable: true, ownerChatId: 7 });
    const reading = useControlStatus(() => answer());

    expect(reading.link.value).toBe("checking");
    expect(reading.reachable.value).toBe(false);

    await reading.read();
    expect(reading.link.value).toBe("reachable");
    expect(reading.control.value?.ownerChatId).toBe(7);

    answer = async () => ({ reachable: false, ownerChatId: null });
    await reading.read();
    expect(reading.link.value).toBe("unreachable");

    answer = async () => { throw Object.assign(new Error("fixture: refused for the login"), { response: { status: 401 } }); };
    await reading.read();
    expect(reading.link.value).toBe("unreachable");

    answer = async () => { throw Object.assign(new Error("fixture: refused here"), { response: { status: 503 } }); };
    await reading.read();
    expect(reading.link.value).toBe("unreachable");
  });

  test("a call this app never answered says nothing of the bot, and a reading short of an answer is asked again", async () => {
    let answer: () => Promise<ControlStatus> = async () => { throw new TypeError("fixture: Load failed"); };
    const asked: (() => void)[] = [];
    const reading = useControlStatus(() => answer(), (work) => {
      asked.push(work);

      return () => {};
    });

    await reading.read();
    expect(reading.link.value).toBe("checking");
    expect(asked).toHaveLength(1);

    answer = async () => ({ reachable: true, ownerChatId: 7 });
    asked.shift()!();
    await Bun.sleep(0);
    expect(reading.link.value).toBe("reachable");
    expect(asked).toHaveLength(0);

    answer = async () => { throw new TypeError("fixture: Load failed"); };
    await reading.read();
    expect(reading.link.value).toBe("reachable");
    expect(asked).toHaveLength(0);
  });

  test("every screen says it through these, so none of them calls a question unanswered a failure", async () => {
    const offenders: string[] = [];

    for await (const path of new Glob("{pages,components,layouts}/**/*.vue").scan({ cwd: new URL("../../../apps/web/app/", import.meta.url).pathname })) {
      const text = await Bun.file(new URL(`../../../apps/web/app/${path}`, import.meta.url)).text();

      if (/\bCONTROL_(UNREACHABLE|CHECKING|SLOW)\b/.test(text)) offenders.push(path);
    }

    expect(offenders).toEqual([]);
  });
});
