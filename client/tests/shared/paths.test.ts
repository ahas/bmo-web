import { describe, expect, test } from "bun:test";

import { consoleBase, messagePath, ownerRoomPath, roomPath, routeOf, todoOfQuery, todoPath } from "../../apps/web/shared/paths";

// Every address a notification or a message link opens stands under the base path its caller reads
// from the console's configuration, and a window takes that same base off again for its router.
describe("the addresses a notification opens", () => {
  for (const base of ["/bmo/", "/console/"]) {
    test(`stand under ${base}`, () => {
      expect(roomPath(base, 42)).toBe(`${base}rooms/42`);
      expect(ownerRoomPath(base, 42)).toBe(`${base}rooms/42`);
      expect(ownerRoomPath(base, null)).toBe(base);
      expect(todoPath(base, 42, 90)).toBe(`${base}rooms/42?todo=90`);
      expect(todoPath(base, null, 90)).toBe(`${base}?todo=90`);
      expect(messagePath(base, -7, "3")).toBe(`${base}rooms/-7?at=3`);
    });

    test(`under ${base} become the router's route again, and an address outside it stays as it is`, () => {
      expect(routeOf(base, `${base}rooms/42?todo=90`)).toBe("/rooms/42?todo=90");
      expect(routeOf(base, base)).toBe("/");
      expect(routeOf(base, "/elsewhere/rooms/1")).toBe("/elsewhere/rooms/1");
    });
  }

  test("a base at the root, or written without its slashes, is still one base", () => {
    expect(consoleBase("/")).toBe("/");
    expect(consoleBase("console")).toBe("/console/");
    expect(roomPath("/", 1)).toBe("/rooms/1");
    expect(roomPath("/console", 1)).toBe("/console/rooms/1");
  });
});

describe("the item an address names", () => {
  test("reads only an exact safe positive query id", () => {
    expect(todoOfQuery("363")).toBe(363);
    expect(todoOfQuery("0")).toBeNull();
    expect(todoOfQuery("-1")).toBeNull();
    expect(todoOfQuery("12tail")).toBeNull();
    expect(todoOfQuery(" 12")).toBeNull();
    expect(todoOfQuery(["12", "13"])).toBeNull();
    expect(todoOfQuery(String(Number.MAX_SAFE_INTEGER + 1))).toBeNull();
  });
});
