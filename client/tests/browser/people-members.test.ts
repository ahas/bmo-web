import { beforeAll, describe, expect, test } from "bun:test";

// The members of the reader's company, the service the console answers itself under the name `people`
// (docs/web.md, 「Screens a unit brings」), asked of a running console end to end: the account service's own list read
// through the console's sign-in and its page check. The harness's first screen names `people` under
// `calls` and its second names nothing (tests/support/browser-console.ts). It drives the console given in
// BMO_CONSOLE_TEST_URL; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const READER = { name: "people-reader", password: "fixture-password-2801" };

let reader = "";

async function signIn(account: { name: string; password: string }): Promise<string> {
  const login = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(account)
  });

  expect(login.ok).toBe(true);

  return login.headers.get("set-cookie")!.split(";")[0]!;
}

// The members asked with a login's cookie, where one is given, from a page, where one is named.
function members(cookie: string | null, page?: string): Promise<Response> {
  const headers: Record<string, string> = {};

  if (cookie !== null) headers.cookie = cookie;
  if (page !== undefined) headers.referer = `${origin}${page}`;

  return fetch(`${origin}/api/people/members`, { headers });
}

beforeAll(async () => {
  if (!origin) return;

  reader = await signIn(READER);
});

describe.skipIf(!origin)("the members of the reader's company", () => {
  test("are answered to a member signed in, each by key and name alone, the reader among them", async () => {
    const answer = await members(reader);

    expect(answer.status).toBe(200);

    const said = (await answer.json()) as { members: Record<string, unknown>[] };

    expect(said.members.some((one) => one.name === READER.name)).toBe(true);
    for (const one of said.members) expect(Object.keys(one).sort()).toEqual(["name", "user"]);
  });

  test("are refused to a request with no session", async () => {
    expect((await members(null)).status).toBe(401);
  });

  test("reach a bundle's page whose manifest names `people` under `calls`, and no other bundle's page", async () => {
    expect((await members(reader, "/screen-a")).status).toBe(200);
    expect((await members(reader, "/screen-b/one")).status).toBe(403);
  });
});
