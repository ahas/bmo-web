import { expect, test } from "bun:test";

import { fieldOf, filled, memberOf, noticeOf } from "../../../apps/web/server/utils/bundle-notices";
import { manifestOf } from "../../support/console-manifest";

// A bundle's notice as it rings (docs/web.md, 「Notifications」): the words its pack gives the kind, filled from the
// member the stream's event carries, a separator never left standing beside an empty field, the bundle's own screen
// title where the kind's title comes out empty, and the place the manifest names for the kind as its address.

// The mail manifest as its unit answers it, naming the conversation a new mail's notice opens.
const bundle = manifestOf("mail", {
  title: "mail.title.screen",
  events: true,
  pushKinds: ["message.created"],
  pushPlaces: { "message.created": "/mail/{accountName}/inbox/{threadId}" }
});

// The same manifest with no place named, which leaves every notice of it opening the screen.
const bare = manifestOf("mail", { title: "mail.title.screen", events: true, pushKinds: ["message.created"] });

// The words a mail bundle gives its screen and its new-mail notice.
function wordsOf(notice: { title: string; body: string }) {
  return { mail: { title: { screen: "Mail" }, notice: { message: { created: notice } } } };
}

// An event as the stream's `data` carries it: the platform's event around the message, without its bodies.
function mailEvent(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: 274,
    kind: "message.created",
    at: 1_795_267_064_956,
    data: {
      id: "inbox:1:4211",
      accountName: "work",
      threadId: "thread-1",
      folderName: "INBOX",
      internetMessageId: "a@example.com",
      inReplyTo: null,
      references: [],
      subject: "Quarterly report",
      from: { name: "Tester", address: "tester@example.com" },
      to: [{ name: null, address: "qa@example.com" }],
      cc: [],
      flags: [],
      snippet: "",
      text: null,
      html: null,
      ...over
    }
  });
}

test("a new mail rings in its words, opening the conversation its manifest names, under its thread's tag", () => {
  const words = wordsOf({ title: "{subject}", body: "{from}" });

  expect(noticeOf(bundle, "message.created", mailEvent(), words, "/console/")).toEqual({
    kind: "mail" as never,
    title: "Quarterly report",
    body: "Tester",
    url: "/console/mail/work/inbox/thread-1",
    tag: "mail:thread-1"
  });
});

test("a notice of a kind the manifest names no place for opens the bundle's screen", () => {
  const words = wordsOf({ title: "{subject}", body: "{from}" });

  expect(noticeOf(bare, "message.created", mailEvent(), words, "/console/").url).toBe("/console/mail");
});

test("a place with no member field to fill it opens the bundle's screen", () => {
  const words = wordsOf({ title: "{subject}", body: "{from}" });

  expect(noticeOf(bundle, "message.created", mailEvent({ threadId: "" }), words, "/console/").url).toBe("/console/mail");
  expect(noticeOf(bundle, "message.created", mailEvent({ accountName: undefined }), words, "/console/").url).toBe("/console/mail");
});

test("the fields are read from the member the event carries, not from the event around it", () => {
  const words = wordsOf({ title: "New mail", body: "{from}: {subject}" });
  const notice = noticeOf(bundle, "message.created", mailEvent(), words, "/");

  expect(notice.body).toBe("Tester: Quarterly report");
  expect(memberOf(mailEvent()).subject).toBe("Quarterly report");
  expect(memberOf("{\"id\":1,\"kind\":\"message.deleted\",\"at\":1,\"data\":\"x\"}")).toEqual({});
  expect(memberOf("not json")).toEqual({});
});

test("a mail with an empty subject rings under the screen's title, with no separator left standing", () => {
  const empty = mailEvent({ subject: "" });

  expect(noticeOf(bundle, "message.created", empty, wordsOf({ title: "{subject}", body: "{from}" }), "/").title).toBe("Mail");
  expect(noticeOf(bundle, "message.created", empty, wordsOf({ title: "New mail", body: "{from}: {subject}" }), "/").body).toBe("Tester");
});

test("an empty field takes the separators beside it, and a word beside it stands", () => {
  const fields = { from: "Tester", subject: "", count: "" };

  expect(filled("{from}: {subject}", fields)).toBe("Tester");
  expect(filled("{subject}: {from}", fields)).toBe("Tester");
  expect(filled("{from}: {subject}", {})).toBe("");
  expect(filled("{from} ({count})", fields)).toBe("Tester");
  expect(filled("From {from} ({count})", { from: "Tester", count: "3" })).toBe("From Tester (3)");
  expect(filled("New mail {subject}", fields)).toBe("New mail");
  expect(filled(undefined, fields)).toBe("");
});

test("a named field is said by its name, by its address where the name is empty", () => {
  expect(fieldOf({ from: { name: "Tester", address: "tester@example.com" } }, "from")).toBe("Tester");
  expect(fieldOf({ from: { name: "", address: "tester@example.com" } }, "from")).toBe("tester@example.com");
  expect(fieldOf({ from: { name: null, address: "tester@example.com" } }, "from")).toBe("tester@example.com");
  expect(fieldOf({ from: null }, "from")).toBe("");
  expect(fieldOf({ size: 3 }, "size")).toBe("3");
});

test("an event that carries no member rings under the screen's title and the kind's tag", () => {
  const notice = noticeOf(bundle, "message.created", "not json", wordsOf({ title: "{subject}", body: "{from}" }), "/");

  expect(notice).toMatchObject({ title: "Mail", body: "", tag: "mail:message.created" });
});
