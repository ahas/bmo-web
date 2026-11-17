import { describe, expect, test } from "bun:test";

import { CompanyPeople } from "../../../apps/web/server/utils/company-people";

// The people of an open stream's reader's company, whose presence it hands by account (docs/web.md, 「Presence and
// typing」): nobody before a read lands, a person who joins heard from the next read, a read that fails keeping what
// stood, and one who leaves ending the stream.

function people(answers: (readonly number[] | null | Error)[]): CompanyPeople {
  return new CompanyPeople(async () => {
    const answer = answers.shift() ?? null;

    if (answer instanceof Error) throw answer;

    return answer;
  });
}

describe("a stream's company people", () => {
  test("are nobody until read, and a person who joins is heard from the next read", async () => {
    const company = people([[4], [4, 5]]);
    let lost = 0;

    company.follow(() => (lost += 1), 3_600_000)();
    expect(company.has(4)).toBe(false);

    await company.read();
    expect(company.has(4)).toBe(true);
    expect(company.has(5)).toBe(false);

    await company.read();
    expect(company.has(5)).toBe(true);
    expect(lost).toBe(0);
  });

  test("keep what stood when a read fails, and lose the stream once somebody leaves", async () => {
    const company = people([[4, 5], new Error("account service down"), [4]]);
    let lost = 0;
    const stop = company.follow(() => (lost += 1), 3_600_000);

    await company.read();
    await company.read();
    expect(company.has(5)).toBe(true);
    expect(lost).toBe(0);

    await company.read();
    expect(company.has(5)).toBe(false);
    expect(lost).toBe(1);
    stop();
  });

  test("of a login in no company are nobody", async () => {
    const company = people([null]);

    await company.read();
    expect(company.has(4)).toBe(false);
  });
});
