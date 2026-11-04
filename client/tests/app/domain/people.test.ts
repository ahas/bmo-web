import { describe, expect, test } from "bun:test";

import { peopleGroup } from "../../../apps/web/app/domain/people";

// The people of the reader's organisation in the console search (docs/web.md, 「Sidebar」; docs/accounts.md,
// 「The people directory」): a result opens the person's page, the organisation stands beside the name, and the
// fields the account service did not hand this reader are not matched.

const t = (key: string) => key;

describe("the people group of the console search", () => {
  test("a person opens their page, with the organisation beside the name", () => {
    const group = peopleGroup(t, [
      { user: "7", name: "member-a", organization: "bmo", jobTitle: "Engineer", landline: "02-1", mobile: "010-1", email: "a@example.com" }
    ]);

    expect(group.id).toBe("people");
    expect(group.label).toBe("app.label.search_people");
    expect(group.entries).toHaveLength(1);
    expect(group.entries[0]?.to).toBe("/people/7");
    expect(group.entries[0]?.label).toBe("member-a");
    expect(group.entries[0]?.prefix).toBe("bmo");
    expect(group.entries[0]?.hidden.map((one) => one.text)).toEqual(["Engineer", "02-1", "010-1", "a@example.com"]);
  });

  test("a person whose contact details the reader may not see carries only the fields that stand", () => {
    const group = peopleGroup(t, [{ user: "8", name: "member-b", organization: "bmo", jobTitle: "Designer" }]);

    expect(group.entries[0]?.hidden.map((one) => one.text)).toEqual(["Designer"]);
  });
});
