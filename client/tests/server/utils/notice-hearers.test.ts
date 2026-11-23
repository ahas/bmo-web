import { expect, test } from "bun:test";

import { noticeReaders } from "bmo-ui/shared/console-manifest";

import { NoticeHearers, noticeHeard } from "../../../apps/web/server/utils/notice-hearers";
import { manifestOf } from "../../support/console-manifest";

// Whose devices a bundle's notice rings (docs/web.md, 「Notifications」): the readers the manifest names for its kind,
// read login by login as the account service names each account, and every account the manifest's role allows where
// it names none.

const ADMINISTRATOR = { name: "agent-a", id: 1, administrator: true };
const MEMBER = { name: "agent-b", id: 2, administrator: false };
const OTHER = { name: "agent-c", id: 3, administrator: false };

// A report box whose new report rings the platform administrators and whose maker's reply rings the report's sender.
const manifest = manifestOf("box", {
  events: true,
  pushKinds: ["report.created", "reply.created", "report.changed"],
  pushReaders: { "report.created": { role: "administrator" }, "reply.created": { field: "senderUser" } }
});

function ringing(kind: string, member: Record<string, unknown> = {}): string[] {
  const readers = noticeReaders(manifest, kind, member);

  return [ADMINISTRATOR, MEMBER, OTHER].filter((account) => noticeHeard(account, readers)).map((account) => account.name);
}

test("readers holding the administrator's role are the platform administrators alone", () => {
  expect(ringing("report.created")).toEqual(["agent-a"]);
});

test("readers holding the member's role are every account, an administrator holding every role a member holds", () => {
  expect([ADMINISTRATOR, MEMBER].map((account) => noticeHeard(account, { role: "member" }))).toEqual([true, true]);
});

test("one account a member's field names rings that account alone, and a field holding no key rings nobody", () => {
  expect(ringing("reply.created", { senderUser: "2" })).toEqual(["agent-b"]);
  expect(ringing("reply.created", { senderUser: 3 })).toEqual(["agent-c"]);
  expect(ringing("reply.created", {})).toEqual([]);
  expect(ringing("reply.created", { senderUser: "agent-b" })).toEqual([]);
});

test("a kind naming no readers rings every account the manifest's role allows", () => {
  expect(ringing("report.changed")).toEqual(["agent-a", "agent-b", "agent-c"]);
  expect([ADMINISTRATOR, MEMBER].map((account) => noticeHeard(account, { allowed: "administrator" }))).toEqual([true, false]);
});

test("each login is read as the account the account service names, and a login it does not name as the administrator's", async () => {
  let reads = 0;
  const hearers = new NoticeHearers({
    users: async () => {
      reads += 1;

      return [ADMINISTRATOR, MEMBER].map((account) => ({ user: String(account.id), name: account.name, administrator: account.administrator }));
    },
    now: () => 0,
    holdMs: 60_000
  });
  const administrators = { role: "administrator" } as const;

  expect(await hearers.hears("agent-a", administrators)).toBe(true);
  expect(await hearers.hears("agent-b", administrators)).toBe(false);
  expect(await hearers.hears("agent-b", { account: "2" })).toBe(true);
  expect(await hearers.hears("agent-a", { account: null })).toBe(false);
  expect(reads).toBe(1);
  expect(await hearers.hears("console-login", administrators)).toBe(true);
  expect(reads).toBe(2);
});

test("a login the held answer does not name has the service asked again, so an account made since is read as itself", async () => {
  let users = [ADMINISTRATOR];
  let reads = 0;
  const hearers = new NoticeHearers({
    users: async () => {
      reads += 1;

      return users.map((account) => ({ user: String(account.id), name: account.name, administrator: account.administrator }));
    },
    now: () => 0,
    holdMs: 60_000
  });

  expect(await hearers.hears("agent-a", { role: "administrator" })).toBe(true);
  users = [ADMINISTRATOR, MEMBER];

  expect(await hearers.hears("agent-b", { role: "administrator" })).toBe(false);
  expect(reads).toBe(2);
});

test("a notice for members rings every login with no read of the account service, which may be away", async () => {
  const hearers = new NoticeHearers({
    users: async () => {
      throw new Error("the account service is away");
    },
    now: () => 0,
    holdMs: 60_000
  });

  expect(await hearers.hears("agent-b", { allowed: "member" })).toBe(true);
  expect(await hearers.hears("agent-b", { role: "member" })).toBe(true);
});
