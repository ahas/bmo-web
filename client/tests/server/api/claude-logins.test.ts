import { expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

// A Claude account signed in from the console (docs/web.md, 「System and organisation」; the agency's docs/cache-fallback.md,
// 「Signing an account in from the console」): the start names an account there or a new one's name, never both, or
// neither, for a new login the agency names past every account's names; the
// code is handed to the sign-in the agency holds and nothing else is answered of it; giving up ends the sign-in; and
// the agency's own codes are said in the pack's words.

const LOGIN = "4b0f6a3e-sign-in";

const agency = standIn("AGENCY", (one) => {
  if (one.method === "POST" && one.path === "/claude-logins") {
    if (one.body?.name === "taken") return answer({ code: "directory-taken", error: "taken" }, 409);
    if (one.body?.name === "claude-01") return answer({ code: "name-taken", error: "held", field: "name" }, 409);
    if (one.body?.account === "gone") return answer({ code: "unknown-account", error: "There is no account gone." }, 404);

    return answer({ login: LOGIN, url: "https://example.com/authorize?state=x", name: typeof one.body?.name === "string" ? one.body.name : "claude-04" }, 201);
  }

  if (one.method === "POST" && one.path === `/claude-logins/${LOGIN}/code`) {
    return one.body?.code === "wrong" ? answer({ code: "sign-in-refused", error: "refused" }, 422) : answer({ ok: true, accounts: [] });
  }

  if (one.method === "DELETE" && one.path === `/claude-logins/${LOGIN}`) return new Response(null, { status: 204 });

  return answer({ code: "no-sign-in", error: "none" }, 404);
});
const sent = agency.asked;

const start = await routeOf<{ login: string; url: string; name: string }>("../../apps/web/server/api/claude-logins.post");
const code = await routeOf<{ ok: true }>("../../apps/web/server/api/claude-logins/[login]/code.post");
const giveUp = await routeOf<{ ok: true }>("../../apps/web/server/api/claude-logins/[login].delete");

test("a sign-in starts for an account there or a new one, never both, and names none for the agency to name", async () => {
  sent.length = 0;

  expect((await asked(start, { body: { name: " claude-03 " } })).answer).toEqual({ login: LOGIN, url: "https://example.com/authorize?state=x", name: "claude-03" });
  expect(sent.at(-1)).toMatchObject({ method: "POST", path: "/claude-logins", body: { name: "claude-03" } });
  expect((await asked(start, { body: { account: "main" } })).status).toBe(200);
  expect(sent.at(-1)?.body).toEqual({ account: "main" });

  // Naming neither, a blank name among it, leaves the name to the agency, and its name comes back.
  for (const body of [{}, { name: "  " }]) {
    expect((await asked(start, { body })).answer).toMatchObject({ name: "claude-04" });
    expect(sent.at(-1)?.body).toEqual({});
  }

  sent.length = 0;
  expect(await asked(start, { body: { account: "main", name: "claude-03" } })).toMatchObject({ status: 400, message: wording("agents.error.login_which") });
  expect(sent).toHaveLength(0);

  expect(await asked(start, { body: { name: "taken" } })).toMatchObject({ status: 409, message: wording("agents.error.login_directory_taken") });
  expect(await asked(start, { body: { name: "claude-01" } })).toMatchObject({ status: 409, message: wording("agents.error.login_name_taken") });
  expect(await asked(start, { body: { account: "gone" } })).toMatchObject({ status: 404, message: wording("agents.error.login_unknown") });
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
