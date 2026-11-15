import { expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

// A Claude account signed in from the console (docs/web.md, 「Administration」; the agency's docs/cache-fallback.md,
// 「Signing an account in from the console」): the start names an account there or a new one's name, never both; the
// code is handed to the sign-in the agency holds and nothing else is answered of it; giving up ends the sign-in; and
// the agency's own codes are said in the pack's words.

const LOGIN = "4b0f6a3e-sign-in";

const agency = standIn("AGENCY", (one) => {
  if (one.method === "POST" && one.path === "/claude-logins") {
    return one.body?.name === "taken" ? answer({ code: "directory-taken", error: "taken" }, 409) : answer({ login: LOGIN, url: "https://example.com/authorize?state=x" }, 201);
  }

  if (one.method === "POST" && one.path === `/claude-logins/${LOGIN}/code`) {
    return one.body?.code === "wrong" ? answer({ code: "sign-in-refused", error: "refused" }, 422) : answer({ ok: true, accounts: [] });
  }

  if (one.method === "DELETE" && one.path === `/claude-logins/${LOGIN}`) return new Response(null, { status: 204 });

  return answer({ code: "no-sign-in", error: "none" }, 404);
});
const sent = agency.asked;

const start = await routeOf<{ login: string; url: string }>("../../apps/web/server/api/claude-logins.post");
const code = await routeOf<{ ok: true }>("../../apps/web/server/api/claude-logins/[login]/code.post");
const giveUp = await routeOf<{ ok: true }>("../../apps/web/server/api/claude-logins/[login].delete");

test("a sign-in starts for an account there or a new one, never both or neither", async () => {
  sent.length = 0;

  expect((await asked(start, { body: { name: " claude-03 " } })).answer).toEqual({ login: LOGIN, url: "https://example.com/authorize?state=x" });
  expect(sent.at(-1)).toMatchObject({ method: "POST", path: "/claude-logins", body: { name: "claude-03" } });
  expect((await asked(start, { body: { account: "main" } })).status).toBe(200);
  expect(sent.at(-1)?.body).toEqual({ account: "main" });

  sent.length = 0;
  for (const body of [{}, { account: "main", name: "claude-03" }, { name: "  " }, { account: 7 }]) {
    expect(await asked(start, { body })).toMatchObject({ status: 400, message: wording("agents.error.login_which") });
  }
  expect(sent).toHaveLength(0);

  expect(await asked(start, { body: { name: "taken" } })).toMatchObject({ status: 409, message: wording("agents.error.login_directory_taken") });
});

test("the code is handed to the sign-in, and a refusal and a sign-in that is gone are said in the pack's words", async () => {
  sent.length = 0;

  expect((await asked(code, { params: { login: LOGIN }, body: { code: " abc " } })).answer).toEqual({ ok: true });
  expect(sent.at(-1)).toMatchObject({ method: "POST", path: `/claude-logins/${LOGIN}/code`, body: { code: "abc" } });

  expect(await asked(code, { params: { login: LOGIN }, body: { code: "wrong" } })).toMatchObject({ status: 502, message: wording("agents.error.login_refused") });
  expect(await asked(code, { params: { login: "gone" }, body: { code: "abc" } })).toMatchObject({ status: 404, message: wording("agents.error.login_gone") });

  sent.length = 0;
  expect(await asked(code, { params: { login: LOGIN }, body: { code: " " } })).toMatchObject({ status: 400, message: wording("agents.error.login_code_needed") });
  expect(sent).toHaveLength(0);
});

test("giving a sign-in up ends it at the agency", async () => {
  expect((await asked(giveUp, { params: { login: LOGIN } })).answer).toEqual({ ok: true });
  expect(sent.at(-1)).toMatchObject({ method: "DELETE", path: `/claude-logins/${LOGIN}` });
});
