import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { jumpGroups, markedHtml, screenGroup } from "../../../apps/web/app/domain/jump";
import { SCREENS, screensWithBundles, sectionItems, sidebarOrder } from "../../../apps/web/app/domain/screens";

import type { JumpGroup } from "../../../apps/web/app/domain/jump";
import KO from "../../fixtures/app/domain/jump.test.ko.json";

const agents: JumpGroup = {
  id: "agents-worker",
  label: KO.line_12,
  entries: [
    { id: "agent-worker", label: KO.line_14, to: "/agents/worker", hidden: [{ label: KO.line_14_2, text: "worker" }] },
    { id: "agent-agent-a", label: KO.line_15, to: "/agents/job%3Aagent-a", hidden: [{ label: KO.line_15_2, text: "job:agent-a" }] }
  ]
};

const rooms: JumpGroup = {
  id: "rooms",
  label: KO.line_21,
  entries: [{ id: "room-1", label: "Machine Room", to: "/rooms/-1004", hidden: [{ label: KO.line_22, text: "-1004" }] }]
};

describe("the console search", () => {
  test("lists every entry of every group while nothing is typed", () => {
    const groups = jumpGroups(wording, [screenGroup(wording), rooms, agents], "  ");

    expect(groups.map((group) => group.id)).toEqual(["screens", "rooms", "agents-worker"]);
    expect(groups.every((group) => group.ignoreFilter === true)).toBe(true);
    expect(groups[2]?.items?.map((item) => item.to)).toEqual(["/agents/worker", "/agents/job%3Aagent-a"]);
    expect(groups[0]?.items?.every((item) => item.labelHtml === undefined)).toBe(true);
  });

  test("keeps only the matching entries and drops a group left empty", () => {
    const groups = jumpGroups(wording, [screenGroup(wording), rooms, agents], "machine");

    expect(groups.map((group) => group.id)).toEqual(["rooms"]);
    expect(groups[0]?.items?.[0]?.labelHtml).toBe("<mark>Machine</mark> Room");
    expect(groups[0]?.items?.[0]?.descriptionHtml).toBeUndefined();
  });

  test("shows a hit only in hidden data as one line under the row", () => {
    const groups = jumpGroups(wording, [rooms, agents], "job:");
    const item = groups[0]?.items?.[0];

    expect(item?.to).toBe("/agents/job%3Aagent-a");
    expect(item?.labelHtml).toBe(KO.line_48);
    expect(item?.description).toBe(KO.line_49);
    expect(item?.descriptionHtml).toBe(KO.line_50);
  });

  test("finds a whole group by its name", () => {
    const groups = jumpGroups(wording, [rooms, agents], KO.line_54);

    expect(groups[0]?.items?.length).toBe(2);
  });


  test("escapes what it marks", () => {
    expect(markedHtml("a<b>&b", "b")).toBe("a&lt;<mark>b</mark>&gt;&amp;<mark>b</mark>");
  });
});

describe("the console's screens", () => {
  test("the sidebar and the search read the same list, in the sidebar's order", () => {
    const listed = screenGroup(wording).entries.filter((entry) => entry.prefix === undefined).map((entry) => entry.to);

    expect(listed).toEqual(sidebarOrder(wording, SCREENS).map((screen) => screen.to));
    expect(sectionItems(wording, "/").flatMap((menu) => menu.items.filter((item) => item.type !== "label")).map((item) => item.to)).toEqual(listed);
  });

  test("the screens of the user menu are found after the sidebar's", () => {
    const bundle = { name: "voc", title: "screens.label.mail", icon: "i-material-symbols-circle", role: "member" as const, module: "/m.js", stylesheet: null, words: {}, counted: false };
    const screens = screensWithBundles([{ ...bundle, screenPath: "/voc", sidebarSection: "account" }]);
    const listed = screenGroup(wording, screens).entries.filter((entry) => entry.prefix === undefined).map((entry) => entry.to);

    expect(listed).toEqual([...sidebarOrder(wording, SCREENS).map((screen) => screen.to), "/voc"]);
  });
});
