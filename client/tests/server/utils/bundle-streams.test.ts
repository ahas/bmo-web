import { expect, test } from "bun:test";

import { dutyOf } from "../../../apps/web/server/utils/bundle-streams";
import { manifestOf } from "../../support/console-manifest";

// What the console's server follows a bundle's event stream for (docs/web.md, 「Notifications」 and 「Sidebar」): the
// kinds it rings where this server rings and the bundle gives words, and whether its events move the sidebar counts.

const words = { mail: {} };
const counted = { sidebarUnread: { path: "/summary", field: "unreadCount" } };

test("a stream is followed for its notice kinds and for its sidebar count", () => {
  const duty = dutyOf(manifestOf("mail", { events: true, pushKinds: ["message.created"], ...counted }), words, true);

  expect(duty).toEqual({ rings: new Set(["message.created"]), counts: true });
});

test("a console that does not ring still follows a counted stream, for the count alone", () => {
  expect(dutyOf(manifestOf("mail", { events: true, pushKinds: ["message.created"], ...counted }), words, false)).toEqual({ rings: new Set(), counts: true });
  expect(dutyOf(manifestOf("mail", { events: true, pushKinds: ["message.created"], ...counted }), undefined, true)).toEqual({ rings: new Set(), counts: true });
});

test("a stream asked for neither, or a manifest that names no stream, is not followed", () => {
  expect(dutyOf(manifestOf("drive", { events: true }), words, true)).toBeNull();
  expect(dutyOf(manifestOf("mail", { events: true, pushKinds: ["message.created"] }), words, false)).toBeNull();
  expect(dutyOf(manifestOf("mail", { events: false, pushKinds: ["message.created"], ...counted }), words, true)).toBeNull();
});
