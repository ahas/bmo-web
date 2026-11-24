import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { AttachmentHolder, Attachments } from "../../../apps/web/shared/attachments";
import type { CatalogueApp, CatalogueConnection } from "../../../apps/web/shared/app-catalogue";
import type { PersonalSkills, SkillForm } from "../../../apps/web/shared/personal-skills";

// The console's routes of the store's kinds (docs/web.md, 「App catalogue」, 「Settings」 and the agents tab at the reader's own node;
// docs/boundary.md): the reader's skills read, written from their form into `SKILL.md` and deleted through the agency's
// personal-skills routes; what each of the reader's agents is given, read and written through its attachments routes,
// a line taking none of a kind said by that kind's sentence; how a shared MCP item connects, read off its `mcp.toml`;
// a skill shared by its kind and the reader's language; and the fill of an item's other languages.

const SKILL_FILE = ["---", "name: notes", "description: Keep notes of a meeting.", "title:", "  en: Notes", "language: en", "---", "", "Write the notes as a list.", ""].join("\n");

// The agency's skills, attachments and catalogue as a test of these routes needs them; the reader is account 1.
const skills: Record<string, { origin: string; files: Record<string, string> }> = {
  notes: { origin: "own", files: { "SKILL.md": SKILL_FILE, "references/format.md": "One line a point." } },
  "review-steps": { origin: "installed", files: { "SKILL.md": "---\nname: review-steps\ndescription: Steps.\n---\nRead.\n" } }
};
const holder = { kind: "agent", name: "agent-a", label: null, role: "worker", line: "worker", takes: { skills: true, mcp: false }, skills: [], mcp: [] };
const sources: Record<string, Record<string, string>> = {
  "1-tickets": { "mcp.toml": '[server]\nname = "tickets"\ntitle = "Tickets"\ndescription = "Reads tickets."\ntransport = "remote"\nurl = "https://tickets.example.org/mcp"\nauth = "header"\nheader = "X-Api-Key"\nsecret = "tickets-key"\n' },
  "1-lint": { "mcp.toml": '[server]\nname = "lint"\ntitle = "Lint"\ndescription = "Lints."\ntransport = "local"\ncommand = ["node", "server.js"]\n' },
  "1-broken": { "mcp.toml": "[server\nname = " }
};

const agency = standIn("AGENCY", (call) => {
  const path = call.path.replace(/\?.*$/, "");
  const skill = /^\/personal-skills\/1\/([^/]+)$/.exec(path)?.[1];

  if (call.method === "GET" && path === "/personal-skills/1") {
    return answer({ skills: [{ name: "notes", description: "Keep notes of a meeting.", title: "Notes", titles: { en: "Notes", ko: 7 }, origin: "own", version: "v1", attachedTo: ["agent-a"] }, { name: "review-steps", origin: "installed", app: "2-review-steps", version: "v2" }] });
  }

  if (skill !== undefined && call.method === "GET") {
    const held = skills[skill];

    return held === undefined ? answer({ code: "not-found", error: "no such skill" }, 404) : answer({ name: skill, version: "v1", ...held });
  }

  if (skill !== undefined && call.method === "PUT") {
    if (skills[skill]?.origin === "installed") return answer({ code: "name-taken", error: "an installed copy holds the name" }, 409);

    skills[skill] = { origin: "own", files: (call.body?.files ?? {}) as Record<string, string> };

    return answer({ name: skill, version: "v2" });
  }

  if (skill !== undefined && call.method === "DELETE") return answer({ ok: true });

  if (call.method === "GET" && path === "/attachments/1") {
    return answer({ holders: [holder, { kind: "supervisor", name: "agent-b", takes: { skills: true, mcp: true }, skills: ["notes"] }], skills: [{ name: "notes", title: "Notes", origin: "own" }], mcp: [] });
  }

  if (call.method === "PUT" && path.startsWith("/attachments/1/")) {
    const mcp = (call.body?.mcp ?? []) as string[];

    if (mcp.length > 0) return answer({ code: "line-takes-none", error: "the line carries no attached mcp", kind: "mcp" }, 409);

    return answer({ ...holder, skills: call.body?.skills });
  }

  const source = /^\/catalogue\/1\/apps\/([^/]+)\/source$/.exec(path)?.[1];

  if (source !== undefined) return answer({ version: "v1", sourceHash: "ab", files: sources[source] ?? {} });

  if (call.method === "POST" && /^\/catalogue\/1\/apps(?:\/[^/]+\/translate)?$/.test(path)) {
    return answer({ id: "1-notes", key: "shared-3-1-notes", kind: call.body?.kind ?? "skill", name: "notes", title: "Notes", description: "", titles: { ja: "Notes in ja" }, machine: ["ja"], may: { install: false } });
  }

  return answer({ code: "not-found", error: "no route" }, 404);
});

const listSkills = await routeOf<PersonalSkills>("../../apps/web/server/api/account/personal-skills.get");
const readSkill = await routeOf<SkillForm>("../../apps/web/server/api/account/personal-skills/[name].get");
const writeSkill = await routeOf<SkillForm>("../../apps/web/server/api/account/personal-skills/[name].put");
const removeSkill = await routeOf<null>("../../apps/web/server/api/account/personal-skills/[name].delete");
const readAttachments = await routeOf<Attachments>("../../apps/web/server/api/account/attachments.get");
const writeAttachments = await routeOf<AttachmentHolder>("../../apps/web/server/api/account/attachments/[kind]/[name].put");
const connection = await routeOf<CatalogueConnection | null>("../../apps/web/server/api/account/app-catalogue/[id]/connection.get");
const share = await routeOf<CatalogueApp>("../../apps/web/server/api/account/app-catalogue.post");
const translate = await routeOf<CatalogueApp>("../../apps/web/server/api/account/app-catalogue/[id]/translate.post");

describe("the reader's skills", () => {
  test("are listed by name, own and installed, every field read as its type", async () => {
    const got = (await asked(listSkills, {})).answer!;

    expect(got.skills.map((skill) => [skill.name, skill.origin, skill.app])).toEqual([
      ["notes", "own", null],
      ["review-steps", "installed", "2-review-steps"]
    ]);
    expect(got.skills[0]!.titles).toEqual({ en: "Notes" });
    expect(got.skills[0]!.attachedTo).toEqual(["agent-a"]);
    expect(got.skills[1]!.description).toBe("");
  });

  test("read into the form: the front matter's description, the body under it, and the reference files", async () => {
    const got = (await asked(readSkill, { params: { name: "notes" } })).answer!;

    expect(got).toEqual({
      name: "notes",
      version: "v1",
      origin: "own",
      description: "Keep notes of a meeting.",
      body: "Write the notes as a list.\n",
      references: [{ path: "references/format.md", text: "One line a point." }]
    });
  });

  test("written from the form into SKILL.md, the front matter's other keys and the reference files kept", async () => {
    const got = await asked(writeSkill, { params: { name: "notes" }, body: { description: "Keep short notes.", body: "List each point.\n\nNothing else." } });
    const put = agency.asked.findLast((call) => call.method === "PUT")!;
    const files = put.body?.files as Record<string, string>;

    expect(got.status).toBe(200);
    expect(put.path).toBe("/personal-skills/1/notes");
    expect(files["references/format.md"]).toBe("One line a point.");
    expect(files["SKILL.md"]!.startsWith("---\n")).toBe(true);
    expect(files["SKILL.md"]).toContain("name: notes\n");
    expect(files["SKILL.md"]).toContain("description: Keep short notes.\n");
    expect(files["SKILL.md"]).toContain("language: en\n");
    expect(files["SKILL.md"]).toContain("  en: Notes\n");
    expect(files["SKILL.md"]!.endsWith("---\n\nList each point.\n\nNothing else.\n")).toBe(true);
    expect(got.answer?.description).toBe("Keep short notes.");
  });

  test("made where none of the name stands, with SKILL.md alone", async () => {
    const got = await asked(writeSkill, { params: { name: "fresh-one" }, body: { description: "A new skill.", body: "Do the thing." } });
    const put = agency.asked.findLast((call) => call.method === "PUT")!;

    expect(got.status).toBe(200);
    expect(Object.keys(put.body?.files as object)).toEqual(["SKILL.md"]);
    expect((put.body?.files as Record<string, string>)["SKILL.md"]).toBe("---\nname: fresh-one\ndescription: A new skill.\n---\n\nDo the thing.\n");
  });

  test("refuse a name off the alphabet and an empty description before asking, and say the agency's refusal", async () => {
    const before = agency.asked.length;

    for (const name of ["Notes", "1notes", "notes_a", "a".repeat(65)]) {
      expect((await asked(writeSkill, { params: { name }, body: { description: "x", body: "" } })).status).toBe(400);
    }

    const empty = await asked(writeSkill, { params: { name: "notes" }, body: { description: "  ", body: "" } });

    expect(empty.message).toBe(wording("skills.error.description_empty"));
    expect(agency.asked.length).toBe(before);

    const taken = await asked(writeSkill, { params: { name: "review-steps" }, body: { description: "Mine.", body: "" } });

    expect(taken.status).toBe(409);
    expect(taken.message).toBe(wording("skills.error.name_taken"));
  });

  test("deleted by name", async () => {
    expect((await asked(removeSkill, { params: { name: "notes" } })).status).toBe(200);
    expect(agency.asked.at(-1)).toMatchObject({ method: "DELETE", path: "/personal-skills/1/notes" });
  });
});

describe("what the reader's agents are given", () => {
  test("is read with every field as its type, a line's takes off where the agency does not say it", async () => {
    const got = (await asked(readAttachments, {})).answer!;

    expect(got.holders[0]).toEqual(holder as AttachmentHolder);
    expect(got.holders[1]).toEqual({ kind: "supervisor", name: "agent-b", label: null, role: null, line: null, takes: { skills: true, mcp: true }, skills: ["notes"], mcp: [] });
    expect(got.skills).toEqual([{ name: "notes", title: "Notes", titles: {}, origin: "own" }]);
  });

  test("is written whole for one agent, answered as it then stands", async () => {
    const got = await asked(writeAttachments, { params: { kind: "agent", name: "agent-a" }, body: { skills: ["notes"], mcp: [] } });

    expect(got.answer?.skills).toEqual(["notes"]);
    expect(agency.asked.at(-1)).toMatchObject({ method: "PUT", path: "/attachments/1/agent/agent-a", body: { skills: ["notes"], mcp: [] } });
  });

  test("a line taking none of a kind is said by that kind's sentence", async () => {
    const got = await asked(writeAttachments, { params: { kind: "agent", name: "agent-a" }, body: { skills: [], mcp: ["tickets"] } });

    expect(got.status).toBe(409);
    expect(got.message).toBe(wording("attachments.error.takes_no_mcp"));
  });

  test("an unknown kind of holder and a body that is no lists are refused before asking", async () => {
    const before = agency.asked.length;

    expect((await asked(writeAttachments, { params: { kind: "room", name: "agent-a" }, body: { skills: [], mcp: [] } })).status).toBe(404);
    expect((await asked(writeAttachments, { params: { kind: "agent", name: "agent-a" }, body: { skills: "notes", mcp: [] } })).status).toBe(400);
    expect(agency.asked.length).toBe(before);
  });
});

describe("a shared item of the store", () => {
  test("an MCP item's connection is read off its mcp.toml, remote or local, and none where it does not read", async () => {
    expect((await asked(connection, { params: { id: "1-tickets" } })).answer).toEqual({
      transport: "remote",
      url: "https://tickets.example.org/mcp",
      auth: "header",
      header: "X-Api-Key",
      secret: "tickets-key"
    });
    expect((await asked(connection, { params: { id: "1-lint" } })).answer).toEqual({ transport: "local", command: ["node", "server.js"] });
    expect((await asked(connection, { params: { id: "1-broken" } })).answer).toBeNull();
    expect((await asked(connection, { params: { id: "1-none" } })).answer).toBeNull();
  });

  test("a skill is shared by its kind and the reader's language, the answer read with what it lacks filled", async () => {
    const got = (await asked(share, { body: { name: "notes", targets: [{ team: true }], kind: "skill", language: "ko" } })).answer!;

    expect(agency.asked.at(-1)).toMatchObject({ method: "POST", path: "/catalogue/1/apps", body: { name: "notes", targets: [{ team: true }], kind: "skill", language: "ko" } });
    expect(got.kind).toBe("skill");
    expect(got.descriptions).toEqual({});
    expect(got.language).toBeNull();
    expect(got.may.translate).toBe(false);

    // A personal app's name is held to its own alphabet, a language outside the console's left out.
    expect((await asked(share, { body: { name: "fresh-one", targets: [] } })).status).toBe(400);
    await asked(share, { body: { name: "weekly", targets: [], language: "xx" } });
    expect(agency.asked.at(-1)?.body).toEqual({ name: "weekly", targets: [], kind: "app" });
  });

  test("the fill of its other languages asks the agency's translate, answered as the item then stands", async () => {
    const got = (await asked(translate, { params: { id: "1-notes" }, body: {} })).answer!;

    expect(agency.asked.at(-1)).toMatchObject({ method: "POST", path: "/catalogue/1/apps/1-notes/translate" });
    expect(got.titles).toEqual({ ja: "Notes in ja" });
    expect(got.machine).toEqual(["ja"]);
  });
});
