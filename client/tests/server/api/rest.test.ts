import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { NoticeSwitchesView, RestEndView, RestView } from "../../../apps/web/shared/rest";

// The rest as the agents' tables and the providers tab ask it (docs/web.md, 「What each agent is doing now」 and
// 「System and organisation」; the agency's docs/api.md, 「accounts, rest and usage」; the receiver's docs/api.md, 「Notices」):
// whether the deployment rests and which agents of the reader's lists it closes, read only while it rests; the rest
// ended by hand through the agency; and the owner's private chat's notice switches read and set through the receiver.

Object.assign(globalThis, await import("../../../apps/web/server/utils/rest"));

const UNTIL = 1_800_000_000;
const ROAD = { provider: "claude-code", model: "claude-opus-5-5", effort: "high", thinking: null, answerTokens: null, advisor: null };
const SUPERVISOR = {
  name: "agent-a", label: null, ownerAccount: null, aliases: null, icon: null, sessionScope: "agent", turnShape: "window", brainFolder: null,
  repository: null, ...ROAD, warming: {}, foldRatio: 0.8, gates: null, voice: null, sampling: null, seeded: false, resetPoint: null
};
// A supervisor on another provider, which answers through the rest, and one filed under another account.
const OTHER_ROAD = { ...SUPERVISOR, name: "agent-b", provider: "deepseek", model: "deepseek-v4-pro" };
const ANOTHERS = { ...SUPERVISOR, name: "agent-c", ownerAccount: 7 };
const AGENT = {
  name: "worker-01", role: "worker", ...ROAD, enabled: true, keepsCache: false, sessions: "keep", foldRatio: null, prompt: null, bundles: null,
  skills: null, followsSupervisor: false, carries: false
};
// A role agent on another provider, one following its asker with no road, and one on Claude Code filed under the reader.
const AGENTS = [
  AGENT,
  { ...AGENT, name: "worker-02", provider: "codex", model: "gpt-5" },
  { ...AGENT, name: "worker-03", provider: null, model: null, effort: null, followsSupervisor: true },
  { ...AGENT, name: "worker-04", ownerAccount: "1" }
];
const ROLE = { name: "worker", code: "worker", label: "Worker", prompt: null, description: null, bundles: [], line: "worker", agents: AGENTS, maxConcurrent: 2, followsSupervisor: false, running: 0, waiting: 0, provider: "claude-code", waitingFor: null, providerPrompts: {} };

const rest: { resting: boolean; until: number | null; kind: string | null } = { resting: false, until: null, kind: null };
// What the agency answers once the rest is ended by hand: by default the rest is gone, else a login read full again.
let restsAgain = false;

const agency = standIn("AGENCY", (call) => {
  if (call.path === "/rest" && call.method === "GET") return answer(rest);
  if (call.path === "/rest" && call.method === "DELETE") {
    const was = rest.resting;

    Object.assign(rest, restsAgain ? { resting: true, until: UNTIL + 600, kind: "limit" } : { resting: false, until: null, kind: null });

    return answer({ ...rest, ended: was });
  }
  if (call.path === "/supervisors") return answer({ items: [SUPERVISOR, OTHER_ROAD, ANOTHERS], more: false });
  if (call.path.startsWith("/supervisors/") && call.path.endsWith("/road")) {
    const name = decodeURIComponent(call.path.split("/")[2] ?? "");
    const answers = name === "agent-b" || !rest.resting;

    return answer({ supervisor: name, ...ROAD, answers, reason: answers ? null : "Claude Code rests." });
  }
  if (call.path === "/roles") return answer({ roles: [ROLE], bundles: [], skills: [], lines: ["worker"] });

  return answer({ code: "not-found", error: "no such route" }, 404);
});

const switches: NoticeSwitchesView = { restart: true, rest: true };

const receiver = standIn("RECEIVER", (call) => {
  if (call.path === "/default-answerer") return answer({ supervisor: "" });
  if (call.path === "/owner") return answer({ room: -1, senderId: 900 });
  if (call.path === "/notice-switches") return answer(switches);
  if (call.path.startsWith("/notice-switches/") && call.method === "PUT") {
    const kind = call.path.split("/")[2] as keyof NoticeSwitchesView;

    switches[kind] = call.body?.on === true;

    return answer(switches);
  }

  return answer({ code: "not-found", error: "no such route" }, 404);
});
standIn("WEB_SERVER", () => answer({ links: [] }));

const read = await routeOf<RestView>("../../apps/web/server/api/rest/index.get");
const end = await routeOf<RestEndView>("../../apps/web/server/api/rest/index.delete");
const readSwitches = await routeOf<NoticeSwitchesView>("../../apps/web/server/api/notice-switches/index.get");
const setSwitch = await routeOf<NoticeSwitchesView>("../../apps/web/server/api/notice-switches/[kind].put");

// The agency's calls beside the rest itself.
const roadReads = () => agency.asked.filter((call) => call.path.endsWith("/road") || call.path === "/roles");

describe("the rest", () => {
  test("reads as not resting, asking no road, while the deployment does not rest", async () => {
    Object.assign(rest, { resting: false, until: null, kind: null });
    const before = roadReads().length;

    expect((await asked(read, {})).answer).toEqual({ resting: false, until: null, kind: null, supervisors: [], agents: [], mayEnd: true });
    expect(roadReads().length).toBe(before);
  });

  test("names, while it rests, the supervisors whose road takes no turn and the platform's role agents on Claude Code", async () => {
    Object.assign(rest, { resting: true, until: UNTIL, kind: "limit" });

    expect((await asked(read, {})).answer).toEqual({ resting: true, until: UNTIL, kind: "limit", supervisors: ["agent-a"], agents: ["worker-01"], mayEnd: true });
  });

  test("reads a rest kept to no known moment, and a kind it does not know, as none", async () => {
    Object.assign(rest, { resting: true, until: null, kind: "something" });

    expect((await asked(read, {})).answer).toMatchObject({ resting: true, until: null, kind: null });
  });

  test("ends by hand through the agency, answering the deployment as it then stands", async () => {
    Object.assign(rest, { resting: true, until: UNTIL, kind: "outage" });
    restsAgain = false;

    expect((await asked(end, {})).answer).toEqual({ resting: false, until: null, kind: null, supervisors: [], agents: [], mayEnd: true, ended: true });
    expect(agency.asked.at(-1)).toMatchObject({ method: "DELETE", path: "/rest" });
  });

  test("ended while a login reads full again still rests, and says so", async () => {
    Object.assign(rest, { resting: true, until: UNTIL, kind: "limit" });
    restsAgain = true;

    expect((await asked(end, {})).answer).toMatchObject({ resting: true, until: UNTIL + 600, kind: "limit", supervisors: ["agent-a"], ended: true });
    restsAgain = false;
  });
});

describe("the notice switches", () => {
  test("are read from the receiver", async () => {
    expect((await asked(readSwitches, {})).answer).toEqual({ restart: true, rest: true });
  });

  test("are set one at a time, answering both", async () => {
    const got = await asked(setSwitch, { params: { kind: "rest" }, body: { on: false } });

    expect(got.answer).toEqual({ restart: true, rest: false });
    expect(receiver.asked.at(-1)).toMatchObject({ method: "PUT", path: "/notice-switches/rest", body: { on: false } });
  });

  test("refuse a kind that is no switch, and a body with no boolean, before asking the receiver", async () => {
    const before = receiver.asked.length;

    for (const event of [{ params: { kind: "other" }, body: { on: true } }, { params: { kind: "restart" }, body: { on: "yes" } }]) {
      const got = await asked(setSwitch, event);

      expect(got.status).toBe(400);
      expect(got.message).toBe(wording("common.error.bad_action"));
    }

    expect(receiver.asked.length).toBe(before);
  });
});
