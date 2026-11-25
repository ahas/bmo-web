import { describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../../support/globals";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { PersonView } from "../../../apps/web/shared/people";

// The people a reader may let into a room (docs/accounts.md, 「A room's callers」; docs/web.md, the room screen's
// section on opening a room and letting people in): the console asks the account service the room's own road, so
// the set is the entry check's rule and not the reader's directory at large. No words answer the whole set, from
// the members list named for the room; words search it, from the search named for the room. A reader who may let
// in nobody is answered nobody by the service, and the road stands empty.

const ROOM = -7;

// The signed-in login is a platform administrator's own: user 1 of the model, its sumida session standing.
const globals = globalThis as Record<string, unknown>;

globalsRestoredAfter(["requireUserSession"]);
globals.requireUserSession = async () => ({ sid: "bmo.sid=tester", user: { name: "tester", id: 1 }, administrator: true });

const receiver = standIn("RECEIVER", (one) => {
  if (/^\/rooms\/-?\d+$/.test(one.path.split("?")[0] ?? "")) return answer({ id: ROOM, title: null, privateOf: null, sealed: false });

  return answer({ code: "failed", error: "Not served here." }, 500);
});

// The account service answers for the signed-in reader (user 1): its members list named for the room stands the
// three people of the room's company, its search named for the room narrows them by the words.
const server = standIn("WEB_SERVER", (one) => {
  const path = one.path.split("?")[0] ?? "";

  // Whether the signed-in user is a platform administrator is the service's own word, read before the road asks.
  if (/^\/users\/\d+$/.test(path)) return answer({ user: "1", name: "tester", fullName: "", administrator: true, senders: [] });

  if (path === "/users/members") {
    return answer({
      members: [
        { user: "12", name: "person-twelve" },
        { user: "7", name: "person-seven" }
      ]
    });
  }

  if (path === "/users/search") {
    return answer({
      people: [{ user: "12", name: "person-twelve", organization: "team-a", jobTitle: "", rank: "", duty: "" }]
    });
  }

  return answer({ code: "failed", error: "Not served here." }, 500);
});

const read = await routeOf<PersonView[]>("../../apps/web/server/api/rooms/[chatId]/let-in.get");

describe("the people a reader may let into a room", () => {
  test("opened, the road answers the whole set from the members list named for the room", async () => {
    server.asked.length = 0;

    const { status, answer: said } = await asked(read, { params: { chatId: String(ROOM) }, query: { q: "" } });

    expect(status).toBe(200);
    expect(said).toEqual([
      { user: "12", name: "person-twelve", organization: "", jobTitle: "" },
      { user: "7", name: "person-seven", organization: "", jobTitle: "" }
    ]);
    expect(server.asked.map((one) => one.path).filter((path) => path.startsWith("/users/members"))).toEqual([
      "/users/members?room=-7"
    ]);
  });

  test("typed, the road searches the set from the search named for the room", async () => {
    server.asked.length = 0;

    const { status, answer: said } = await asked(read, {
      params: { chatId: String(ROOM) },
      query: { q: "person-twelve" }
    });

    expect(status).toBe(200);
    expect(said).toEqual([
      { user: "12", name: "person-twelve", organization: "team-a", jobTitle: "", rank: "", duty: "" }
    ]);
    expect(server.asked.map((one) => one.path).filter((path) => path.startsWith("/users/search"))).toEqual([
      "/users/search?q=person-twelve&room=-7"
    ]);
  });
});
