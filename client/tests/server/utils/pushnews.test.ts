import { describe, expect, test } from "bun:test";

import { PUSH_BODY_LIMIT, PUSH_KIND_LIST } from "../../../apps/web/shared/config";
import { clipBody, isGone, readKinds } from "../../../apps/web/server/utils/push";
import {
  mayRing,
  questionPush,
  ringsFromThisServer,
  unrungQuestions
} from "../../../apps/web/server/utils/pushnews";

import type { JobQuestion } from "../../../apps/web/shared/types";
import { OWNER_ID as OWNER } from "../../support/ids";

// What the bot's news turns into, and what it never turns into. A notification is a line the
// owner reads on a locked screen: it carries what they asked for and where to go for the rest,
// and nothing of this machine.

function question(over: Partial<JobQuestion> = {}): JobQuestion {
  return {
    id: 7,
    todoId: 90,
    question: "what should be the default",
    options: ["first", "second"],
    recommended: 0,
    recommendation: null,
    why: "it is a matter of taste",
    askedAt: 1_756_800_000,
    dueAt: 1_756_800_600,
    chosen: null,
    answer: null,
    pausedLeft: null,
    settledAt: null,
    settledBy: null,
    ...over
  };
}

describe("which news is worth ringing about", () => {
  test("an open question nobody has been told about", () => {
    expect(unrungQuestions([question()], new Set()).map((one) => one.id)).toEqual([7]);
  });

  test("a question already settled is not news, however lately it arrived", () => {
    expect(unrungQuestions([question({ settledAt: 1_756_800_100 })], new Set())).toHaveLength(0);
  });

  test("a question already rung about does not ring twice", () => {
    expect(unrungQuestions([question()], new Set([7]))).toHaveLength(0);
  });

  // A job's report is written to the chat agent, and reaches the owner only as its own answer in their room,
  // which rings as a room message; an item closing rings nothing of its own, and a device that
  // refused the kind it once was hears exactly what it heard before.
  test("a job's end is no kind of notification of its own", () => {
    expect(PUSH_KIND_LIST.map((kind) => kind.id)).toEqual(["question", "room", "mail"]);
    expect(readKinds("report,room")).toEqual(["room"]);
  });

  test("only what moves the queue or files words in a room is read for at all", () => {
    expect(mayRing("todo")).toBe(true);
    expect(mayRing("sent")).toBe(true);
    expect(mayRing("message")).toBe(true);
    // A run's own progress moves nothing anybody is told about, and it arrives constantly.
    expect(mayRing("run-progress")).toBe(false);
    expect(mayRing("live")).toBe(false);
  });
});

describe("what one notification says", () => {
  test("a question names its item and goes to that item's own row", () => {
    const push = questionPush("/bmo/", question(), OWNER);

    expect(push.kind).toBe("question");
    expect(push.title).toContain("#90");
    expect(push.body).toBe("what should be the default");
    expect(push.url).toBe(`/bmo/rooms/${OWNER}?todo=90`);
    // One question is one thing, so a second push about it replaces the first.
    expect(push.tag).toBe("question:7");
  });

  test("a console that does not know their room opens the home page rather than guessing one", () => {
    expect(questionPush("/bmo/", question(), null).url).toBe("/bmo/?todo=90");
  });

  test("the item it opens stands under the base path the console is configured with", () => {
    expect(questionPush("/console/", question(), OWNER).url).toBe(`/console/rooms/${OWNER}?todo=90`);
    expect(questionPush("/console/", question(), null).url).toBe("/console/?todo=90");
  });
});

describe("the line a notification carries", () => {
  test("reads as one line however many the report had", () => {
    expect(clipBody("first line\n\nsecond line\tthird")).toBe("first line second line third");
  });

  test("is cut where a platform would cut it anyway", () => {
    const long = clipBody("x".repeat(PUSH_BODY_LIMIT * 2));

    expect(long).toHaveLength(PUSH_BODY_LIMIT);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("a subscription a push service has given up on", () => {
  test("is one it says is gone, and nothing else", () => {
    expect(isGone(404)).toBe(true);
    expect(isGone(410)).toBe(true);
    // A service having a bad minute is not a device to forget.
    expect(isGone(429)).toBe(false);
    expect(isGone(500)).toBe(false);
    expect(isGone(201)).toBe(false);
  });
});

describe("the kinds a device asked for", () => {
  test("are read back as they were stored", () => {
    expect(readKinds("question,room")).toEqual(["question", "room"]);
  });

  test("drop a kind this console no longer knows rather than sending to nobody", () => {
    expect(readKinds("question,weather,room")).toEqual(["question", "room"]);
  });

  test("a device that asked for nothing hears nothing", () => {
    expect(readKinds("")).toEqual([]);
  });
});

// The ringing is a plugin, so it is one per console server, and every console server up reads the
// same one stream from the bot. Two of them ring twice for one event, and a second one is the
// ordinary case rather than a rare one: the deployed console is always up and anybody working on
// the console has one of their own beside it.
describe("which console server rings", () => {
  test("a console served from a build rings, which is the deployed one", () => {
    expect(ringsFromThisServer(false, undefined)).toBe(true);
  });

  test("and one served from source does not, which is the one somebody is working in", () => {
    expect(ringsFromThisServer(true, undefined)).toBe(false);
    expect(ringsFromThisServer(true, "")).toBe(false);
    expect(ringsFromThisServer(true, "0")).toBe(false);
    expect(ringsFromThisServer(true, "no")).toBe(false);
  });

  // Nothing a developer does can quieten the deployed console: it is not asked, and the flag is
  // read only after the answer to the first question was a plain yes.
  test("the deployed one rings whatever is said to it", () => {
    expect(ringsFromThisServer(false, "0")).toBe(true);
    expect(ringsFromThisServer(false, "")).toBe(true);
    expect(ringsFromThisServer(false, "1")).toBe(true);
  });

  // Only a plain yes to "is this a development server" stops the ringing. A runtime that does not
  // answer the question at all rings, because a console gone quiet says nothing about having gone
  // quiet and hearing a thing twice is the smaller trouble.
  test("an answer the runtime does not give rings rather than falling silent", () => {
    expect(ringsFromThisServer(undefined, undefined)).toBe(true);
    expect(ringsFromThisServer(null, undefined)).toBe(true);
    expect(ringsFromThisServer("true", undefined)).toBe(true);
    expect(ringsFromThisServer(1, undefined)).toBe(true);
  });

  test("and a developer who wants to watch it ring says so on the line", () => {
    expect(ringsFromThisServer(true, "1")).toBe(true);
    expect(ringsFromThisServer(true, "true")).toBe(true);
    expect(ringsFromThisServer(true, "TRUE")).toBe(true);
    expect(ringsFromThisServer(true, " yes ")).toBe(true);
  });
});

// The decision above is worth nothing unless the plugin actually asks it before it opens its ear.
// The plugin is Nitro's to load and cannot be called here, so what is held is that the asking is
// the first thing in it.
const plugin = await Bun.file(new URL("../../../apps/web/server/plugins/push.ts", import.meta.url)).text();

describe("the ear the plugin holds open", () => {
  test("there is a plugin to read at all", () => {
    expect(plugin).toContain("defineNitroPlugin");
  });

  test("asks which console it is before it opens anything, and stops there when it is not the one", () => {
    const opening = plugin.slice(plugin.indexOf("defineNitroPlugin"), plugin.indexOf("const rungQuestions"));

    expect(opening).toContain("ringsFromThisServer(import.meta.dev, process.env.BMO_PUSH_IN_DEV)");
    expect(opening).toContain("return;");
  });
});
