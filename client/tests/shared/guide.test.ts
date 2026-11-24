import { describe, expect, test } from "bun:test";

import {
  completionsAddress,
  guideFlowFor,
  guideLeavable,
  guideOpens,
  guideProgress,
  guideRoads,
  guideSteps,
  needOf,
  platformWorks,
  stepAt,
  supplyNeedOf
} from "../../apps/web/shared/guide";

import type { GuideKept, GuideProvider } from "../../apps/web/shared/guide";

// The start guide's choice of flow and steps by what the chain and the platform hold (docs/web.md, 「The start guide」).

const member = { administrator: false, account: true };
const administrator = { administrator: true, account: true };
const kept = (over: Partial<GuideKept>): GuideKept => ({ flow: "member", step: "welcome", need: null, supplyLater: false, road: null, finished: false, left: false, ...over });
const facts = { supplyLater: false, machineAttached: true, organisations: true };

describe("a member's supply step by their chain", () => {
  test("stands as no step where the organisation or the platform supplies everything", () => {
    expect(supplyNeedOf({ personal: false, personalOnly: false, ownSupply: false })).toBe("supplied");
    expect(guideSteps("member", { ...facts, need: "supplied" })).toEqual(["welcome", "talk"]);
  });

  test("stands as no step where one of their own is on already", () => {
    expect(supplyNeedOf({ personal: true, personalOnly: true, ownSupply: true })).toBe("supplied");
  });

  test("is optional where their own may stand beside what is supplied, and put off it passes the setup over", () => {
    expect(supplyNeedOf({ personal: true, personalOnly: false, ownSupply: false })).toBe("optional");
    expect(guideSteps("member", { ...facts, need: "optional" })).toEqual(["welcome", "supply", "provider", "connect", "test", "talk"]);
    expect(guideSteps("member", { ...facts, need: "optional", supplyLater: true })).toEqual(["welcome", "supply", "talk"]);
  });

  test("is required where their own is all there is, and putting it off does not pass it over", () => {
    expect(supplyNeedOf({ personal: true, personalOnly: true, ownSupply: false })).toBe("required");
    expect(guideSteps("member", { ...facts, need: "required", supplyLater: true })).toEqual(["welcome", "supply", "provider", "connect", "test", "talk"]);
  });

  test("asks nothing where the agency did not answer", () => {
    expect(supplyNeedOf(null)).toBe("supplied");
  });

  test("keeps the need read as the flow began, unless their own is required now", () => {
    expect(needOf(kept({ need: "optional" }), "supplied")).toBe("optional");
    expect(needOf(kept({ need: "optional" }), "required")).toBe("required");
    expect(needOf(null, "optional")).toBe("optional");
  });

  test("leads to the machine step only while no machine is attached", () => {
    expect(guideSteps("member", { ...facts, need: "supplied", machineAttached: false })).toEqual(["welcome", "machine", "talk"]);
  });
});

describe("whether the guide opens and may be left", () => {
  test("a member is held to it while their own is required and none is on, and may leave it otherwise", () => {
    expect(guideOpens("member", null, true)).toBe(true);
    expect(guideLeavable("member", true)).toBe(false);
    expect(guideOpens("member", kept({}), false)).toBe(false);
    expect(guideLeavable("member", false)).toBe(true);
  });

  test("the administrator is led to it until the flow is finished or put aside", () => {
    expect(guideOpens("platform", null, false)).toBe(true);
    expect(guideOpens("platform", kept({ flow: "platform", left: true }), false)).toBe(false);
    expect(guideOpens("platform", kept({ flow: "platform", finished: true }), false)).toBe(false);
    expect(guideLeavable("platform", false)).toBe(true);
  });
});

const provider = (name: string, over: Partial<GuideProvider> = {}): GuideProvider => ({ name, enabled: true, gateway: false, registered: false, reasonCode: null, keyFile: null, ...over });

describe("the administrator's flow", () => {
  test("stands where the platform has no working source", () => {
    const providers = [provider("claude-code"), provider("deepseek", { gateway: true, reasonCode: "deepseek-key-unset", keyFile: "deepseek.key" })];

    expect(platformWorks(providers, [], 7)).toBe(false);
    expect(guideFlowFor(administrator, null, false)).toBe("platform");
    expect(guideSteps("platform", { ...facts, need: "supplied" })).toEqual(["provider", "connect", "test", "model", "company", "talk"]);
  });

  test("is never begun where a working source stands", () => {
    expect(platformWorks([provider("claude-code"), provider("registered", { registered: true, gateway: true })], [], 7)).toBe(true);
    expect(platformWorks([provider("claude-code")], [{ enabled: true, login: "standing", userId: null }], 7)).toBe(true);
    expect(platformWorks([provider("claude-code")], [{ enabled: true, login: "standing", userId: 7 }], 7)).toBe(true);
    expect(guideFlowFor(administrator, null, true)).toBe(null);
  });

  test("passes over a login that is off, gone, or another person's", () => {
    expect(platformWorks([provider("claude-code")], [{ enabled: false, login: "standing", userId: null }], 7)).toBe(false);
    expect(platformWorks([provider("claude-code")], [{ enabled: true, login: "gone", userId: null }], 7)).toBe(false);
    expect(platformWorks([provider("claude-code")], [{ enabled: true, login: "standing", userId: 9 }], 7)).toBe(false);
    expect(platformWorks([provider("claude-code", { enabled: false })], [{ enabled: true, login: "standing", userId: null }], 7)).toBe(false);
  });

  test("goes on to its end once begun, and is gone once finished on a working platform", () => {
    expect(guideFlowFor(administrator, kept({ flow: "platform", step: "model" }), true)).toBe("platform");
    expect(guideFlowFor(administrator, kept({ flow: "platform", finished: true }), true)).toBe(null);
    expect(guideFlowFor(administrator, null, null)).toBe(null);
  });

  test("leaves out the company where the deployment holds no organisation", () => {
    expect(guideSteps("platform", { ...facts, need: "supplied", organisations: false })).toEqual(["provider", "connect", "test", "model", "talk"]);
  });
});

describe("the flow chosen for a reader", () => {
  test("is a member's for everyone with a user who is not the administrator, and none without a user", () => {
    expect(guideFlowFor(member, null, false)).toBe("member");
    expect(guideFlowFor({ administrator: true, account: false }, null, false)).toBe(null);
  });
});

describe("the roads offered", () => {
  const providers = [
    provider("claude-code"),
    provider("codex", { gateway: true, keyFile: "openai.key" }),
    provider("deepseek", { gateway: true, keyFile: "deepseek.key" }),
    provider("openrouter", { gateway: true, enabled: false, keyFile: "openrouter.key" }),
    provider("registered", { gateway: true, registered: true })
  ];

  test("to a member: Claude and the keys of switched-on roads the gateway holds members of", () => {
    expect(guideRoads("member", providers, new Set(["deepseek", "openrouter"]))).toEqual([
      { road: "claude-code", kind: "login", keyFile: null },
      { road: "deepseek", kind: "key", keyFile: null }
    ]);
  });

  test("to the administrator: Claude, the keys read from a file, and a local AI", () => {
    expect(guideRoads("platform", providers, new Set())).toEqual([
      { road: "claude-code", kind: "login", keyFile: null },
      { road: "codex", kind: "key", keyFile: "openai.key" },
      { road: "deepseek", kind: "key", keyFile: "deepseek.key" },
      { road: "registered", kind: "local", keyFile: null }
    ]);
  });
});

describe("where the guide stands", () => {
  test("opens at the step kept, or the first standing after it", () => {
    expect(stepAt(["welcome", "supply", "talk"], "supply")).toBe("supply");
    expect(stepAt(["welcome", "talk"], "machine")).toBe("talk");
    expect(stepAt(["welcome", "talk"], null)).toBe("welcome");
  });

  test("counts its place as a count and a share", () => {
    expect(guideProgress(["welcome", "supply", "talk"], "supply")).toEqual({ at: 2, of: 3, share: 67 });
  });

  test("reads a local AI's base address as its chat completions address", () => {
    expect(completionsAddress("http://engine.example:8000/v1/")).toBe("http://engine.example:8000/v1/chat/completions");
    expect(completionsAddress("http://engine.example:8000/v1/chat/completions")).toBe("http://engine.example:8000/v1/chat/completions");
  });
});
