import { afterEach, describe, expect, test } from "bun:test";
import { computed, ref } from "vue";

import { wording } from "../../../apps/web/shared/wording";

import { accountName, accountNames, filteredNodes, machineOwnerText, ownershipFilterOf, ownershipText, stateWord, toneDot, useOwnerNames } from "../../../apps/web/app/domain/nodes";

import type { MonitorNode } from "../../../apps/web/shared/types";
import type { Ref } from "vue";

// The node list's reading (docs/web.md, 「The node list」): whose a personal node is, by the name its account goes by,
// the filter by ownership, and the tone a state's dot stands in.

function node(name: string, ownership: MonitorNode["ownership"], account: string | null = null): MonitorNode {
  return { name, label: name, kind: "hub", thisMachine: false, connected: true, state: "connected", tone: "good", ownership, account, monitored: ownership === "shared" };
}

const NAMES = accountNames([
  { user: "2", name: "tester", fullName: "Test Person", administrator: false },
  { user: "3", name: "qa-admin", fullName: "", administrator: true }
]);

describe("a personal node's account", () => {
  test("goes by its person's name, the login where none stands, and its id where no user holds it", () => {
    expect(accountName(wording, NAMES, "2")).toBe("Test Person");
    expect(accountName(wording, NAMES, "3")).toBe("qa-admin");
    expect(accountName(wording, NAMES, "99")).toBe(wording("hardware.label.unknown_account", { id: "99" }));
    expect(accountName(wording, NAMES, null)).toBeNull();
  });

  test("stands after a personal node's word, and a shared node or one naming no account stands alone", () => {
    expect(ownershipText(wording, NAMES, node("own-a", "personal", "2"))).toBe(wording("hardware.label.ownership_personal_of", { name: "Test Person" }));
    expect(ownershipText(wording, NAMES, node("own-b", "personal"))).toBe(wording("hardware.label.ownership_personal_node"));
    expect(ownershipText(wording, NAMES, node("pc-a", "shared"))).toBe(wording("hardware.label.ownership_shared_node"));
  });

  // docs/web.md, 「Monitor screen」: a monitored personal node's tile names its owner where the names are read.
  test("names a monitored machine's owner where the names are read, the personal node's word alone where they are not", () => {
    expect(machineOwnerText(wording, NAMES, "2")).toBe(wording("hardware.label.ownership_personal_of", { name: "Test Person" }));
    expect(machineOwnerText(wording, null, "2")).toBe(wording("hardware.label.ownership_personal_node"));
    expect(machineOwnerText(wording, NAMES, null)).toBeNull();
  });
});

describe("the ownership filter", () => {
  test("reads the address's word, every node where it names neither, and keeps the list's order", () => {
    const nodes = [node("pc-a", "shared"), node("own-a", "personal", "2"), node("pc-b", "shared")];

    expect(ownershipFilterOf("personal")).toBe("personal");
    expect(ownershipFilterOf("everyone")).toBe("all");
    expect(ownershipFilterOf(undefined)).toBe("all");
    expect(filteredNodes(nodes, "shared").map((one) => one.name)).toEqual(["pc-a", "pc-b"]);
    expect(filteredNodes(nodes, "all").map((one) => one.name)).toEqual(["pc-a", "own-a", "pc-b"]);
  });
});

describe("a node's state", () => {
  test("stands its unknown tone apart from a failure's, and reads a state the console does not know as unchecked", () => {
    expect(new Set([toneDot("good"), toneDot("bad"), toneDot("unknown")]).size).toBe(3);
    expect(toneDot("unknown")).not.toContain("error");
    expect(stateWord(wording, "later-state" as MonitorNode["state"])).toBe(wording("hardware.label.state_unknown"));
  });
});

// docs/web.md, 「Monitor screen」: the names a personal node's owner is told by, the administrator's read alone.
describe("the owner's names", () => {
  const USERS = [{ user: "2", name: "tester", fullName: "Test Person", administrator: false }];
  const STUBS = ["computed", "useUserSession", "useFetch"] as const;

  // The session says whether the reader is the administrator; the users' read is answered as the test sets it.
  function reader(administrator: boolean): { status: Ref<string>; data: Ref<unknown>; error: Ref<unknown>; asked: string[] } {
    const read = { status: ref("pending"), data: ref<unknown>([]), error: ref<unknown>(null), asked: [] as string[] };

    Object.assign(globalThis, {
      computed,
      useUserSession: () => ({ session: ref({ administrator }) }),
      useFetch: (url: string) => {
        read.asked.push(url);

        return { data: read.data, status: read.status, error: read.error };
      }
    });

    return read;
  }

  afterEach(() => {
    for (const name of STUBS) Reflect.deleteProperty(globalThis, name);
  });

  test("gives the administrator the names once the list arrives, waiting until then", () => {
    const read = reader(true);
    const owner = useOwnerNames();

    expect([owner.names.value, owner.waiting.value, owner.error.value]).toEqual([null, true, null]);
    read.data.value = USERS;
    read.status.value = "success";
    expect(owner.names.value?.get("2")).toBe("Test Person");
    expect([owner.waiting.value, owner.error.value]).toEqual([false, null]);
  });

  test("gives anyone else no names, no wait and no read of the users", () => {
    const read = reader(false);
    const owner = useOwnerNames();

    expect([owner.names.value, owner.waiting.value, owner.error.value]).toEqual([null, false, null]);
    expect(read.asked).toEqual([]);
  });

  test("gives a failed read no names and no wait, and what it met", () => {
    const read = reader(true);
    const owner = useOwnerNames();
    const met = new Error("users down");

    read.error.value = met;
    read.status.value = "error";
    expect([owner.names.value, owner.waiting.value, owner.error.value]).toEqual([null, false, met]);
  });
});
