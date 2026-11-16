import { describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../../support/globals";
import { answer, standIn } from "../../support/units";

import { callNamesOn, consoleMadeLabel, ownTitles, personaToWrite, standOwnBmo } from "../../../apps/web/server/utils/bmo-profile";
import { wording } from "../../../apps/web/shared/wording";

import type { OwnBmoView } from "../../../apps/web/shared/bmo-profile";

// A person's BMO profile applied to their own BMO (docs/web.md, 「A person's BMO profile on the agency and the
// receiver」): the name into the label made with the person's name, the call names and the persona onto the agency, and
// the picture onto the receiver, each only where it differs, a label chosen by hand left as it stands. The account
// service, the agency and the receiver are stood in for; what stands is the service's to decide, so these tests hand
// the profile in and read what the console wrote.

const globals = globalThis as Record<string, unknown>;

globalsRestoredAfter(["createError"]);
globals.createError = (options: { statusCode: number; message: string; data?: unknown }) => Object.assign(new Error(options.message), options);

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const deployment = { from: "deployment" as const };

// The profile the service answers for the person, as its wire carries it.
let profile: Record<string, unknown> = {};
let supervisors: Record<string, unknown>[] = [];
let persona: string | null = null;

const service = standIn("WEB_SERVER", (call) => {
  if (call.method === "GET" && call.path === "/users/12") return answer({ user: "12", name: "member-d", fullName: "Person D", administrator: false, senders: [] });
  if (call.method === "GET" && call.path === "/users/12/agent") return answer(profile);
  if (call.method === "GET" && call.path === "/users/12/agent/picture") return new Response(PNG, { headers: { "content-type": "image/png" } });

  return answer({ code: "not-found", error: "no route" }, 404);
});

const agency = standIn("AGENCY", (call) => {
  if (call.method === "GET" && call.path === "/supervisors") return answer({ items: supervisors, more: false });
  if (call.method === "GET" && call.path === "/supervisors/u12/settings") return answer({ agent: "u12", settings: { persona }, personaFile: "", system: {}, sessions: [] });
  if (call.method === "PATCH") return answer({ ...supervisors[0], ...call.body });

  return answer({ code: "no-route", error: "no route" }, 404);
});

const receiver = standIn("RECEIVER", (call) => {
  if (call.method === "GET" && call.path === "/default-answerer") return answer({ supervisor: "agent-a" });
  if (call.method === "GET" && call.path === "/supervisors/u12/rooms") return answer({ items: [{ id: 42, title: "Person D", named: false, alone: true }], more: false });
  if (call.path === "/avatars/agent/u12") return new Response(null, { status: 204 });

  return answer({ code: "no-route", error: "no route" }, 404);
});

process.env.WEB_SERVER_TOKEN = "token";

const own = (label: string, aliases: string | null = null) => ({ name: "u12", label, aliases, ownerAccount: 12, provider: "codex", model: "model-a" });
const standing = (over: Record<string, unknown> = {}) => ({
  personalize: false,
  company: { id: 1, name: "company-a" },
  name: { from: "company", name: "Dear" },
  callNames: { from: "company", callNames: ["Dear", "dear-b"] },
  persona: { from: "deployment" },
  picture: { from: "company" },
  own: { callNames: [], picture: false },
  ...over
});

function fresh(): void {
  service.asked.length = 0;
  agency.asked.length = 0;
  receiver.asked.length = 0;
}

const writes = (unit: { asked: { method: string; path: string; body: unknown }[] }) => unit.asked.filter((one) => one.method !== "GET").map((one) => [one.method, one.path, one.body]);

describe("a company's default applied to a person's BMO", () => {
  test("titles it with the person's name and the company's name, gives it the call names and wears the company's picture", async () => {
    fresh();
    supervisors = [own(ownTitles("Person D").label)];
    profile = standing();
    persona = null;

    await standOwnBmo(12, { profile: true });

    expect(writes(agency)).toEqual([
      ["PATCH", "/supervisors/u12", { label: ownTitles("Person D", "Dear").label }],
      ["PATCH", "/supervisors/u12", { aliases: "Dear,dear-b" }]
    ]);
    expect(ownTitles("Person D", "Dear").label).toBe(wording("account.label.own_bmo", { name: "Person D", agent: "Dear" }));
    expect(receiver.asked.filter((one) => one.path === "/avatars/agent/u12").map((one) => one.method)).toEqual(["PUT"]);
    // Nothing of a persona the person never set is written.
    expect(agency.asked.some((one) => one.method === "PATCH" && one.path.endsWith("/settings"))).toBe(false);
  });

  test("writes nothing again where the label and the call names already stand, and leaves the picture alone on a sign-in", async () => {
    fresh();
    supervisors = [own(ownTitles("Person D", "Dear").label, "Dear,dear-b")];
    profile = standing();

    await standOwnBmo(12);

    expect(writes(agency)).toEqual([]);
    expect(receiver.asked.some((one) => one.path === "/avatars/agent/u12")).toBe(false);
  });

  test("leaves a label someone chose by hand, and drops the picture where the deployment's stands", async () => {
    fresh();
    supervisors = [own("Doctor D")];
    profile = standing({ name: { from: "deployment" }, callNames: { from: "deployment", callNames: [] }, picture: deployment });

    await standOwnBmo(12, { profile: true });

    expect(writes(agency)).toEqual([]);
    expect(receiver.asked.filter((one) => one.path === "/avatars/agent/u12").map((one) => one.method)).toEqual(["DELETE"]);
  });

  test("puts the person's own persona on the agency, and takes it back once it no longer stands", async () => {
    fresh();
    supervisors = [own(ownTitles("Person D", "Dear").label, "Dear,dear-b")];
    profile = standing({ personalize: true, persona: { from: "own", persona: "Speaks briefly." }, own: { callNames: [], persona: "Speaks briefly.", picture: false } });
    persona = null;

    await standOwnBmo(12, { profile: true });

    expect(writes(agency)).toEqual([["PATCH", "/supervisors/u12/settings", { by: "console", persona: "Speaks briefly." }]]);

    fresh();
    profile = standing({ persona: deployment, own: { callNames: [], persona: "Speaks briefly.", picture: false } });
    persona = "Speaks briefly.";

    await standOwnBmo(12, { profile: true });

    expect(writes(agency)).toEqual([["PATCH", "/supervisors/u12/settings", { by: "console", persona: null }]]);
  });

  test("touches no supervisor of no account", async () => {
    fresh();
    supervisors = [{ ...own("Agent A"), name: "agent-a", ownerAccount: null }];
    profile = standing();

    await standOwnBmo(12, { profile: true });

    expect(writes(agency)).toEqual([]);
    expect(writes(receiver)).toEqual([]);
  });
});

describe("the parts of the apply", () => {
  test("a label is the console's where it is the key, the login or made from a name the person had with any profile's name", () => {
    expect(consoleMadeLabel("u12", 12, "member-d", [])).toBe(true);
    expect(consoleMadeLabel("member-d", 12, "member-d", [])).toBe(true);
    expect(consoleMadeLabel(ownTitles("Old name", "Dear").label, 12, "member-d", ["Old name"])).toBe(true);
    expect(consoleMadeLabel(ownTitles("Person D").label, 12, "member-d", ["Person D"])).toBe(true);
    expect(consoleMadeLabel("Doctor D", 12, "member-d", ["Person D"])).toBe(false);
    expect(consoleMadeLabel(ownTitles("Someone else", "Dear").label, 12, "member-d", ["Person D"])).toBe(false);
  });

  test("a persona someone set on the agency by hand stays where the person set none", () => {
    const none: Pick<OwnBmoView, "persona" | "own"> = { persona: { value: null, from: "deployment" }, own: { name: null, callNames: [], persona: null, picture: false } };

    expect(personaToWrite(none, "Set by hand.")).toBeUndefined();
    expect(personaToWrite({ ...none, persona: { value: "Mine.", from: "own" } }, "Mine.")).toBeUndefined();
  });

  test("the agency's call names are read off its comma-separated text", () => {
    expect(callNamesOn("Dear, dear-b ,")).toEqual(["Dear", "dear-b"]);
    expect(callNamesOn(null)).toEqual([]);
  });
});
