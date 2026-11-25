import { expect, test } from "bun:test";

import { globalsRestoredAfter } from "../../support/globals";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import { wording } from "../../../apps/web/shared/wording";

import type { RouteEvent } from "../../support/nitro";

// A person's own Claude sign-in through the supply relay (docs/web.md, 「Organisation」, the supply tab at the
// reader's own node): a new
// login's start names no name, so the agency names it past every account's names, which the person cannot see;
// and every refusal on the way is said in its own sentence, under the field it names where it names one, never as
// the one sentence for a refused value.

const LOGIN = "5c1d-sign-in";

globalsRestoredAfter(["useRuntimeConfig"]);
(globalThis as Record<string, unknown>).useRuntimeConfig = () => ({ app: { baseURL: "/" } });

const agency = standIn("AGENCY", (one) => {
  if (one.method === "POST" && one.path === "/claude-logins") {
    if (one.body?.name === "claude-01") return answer({ code: "name-taken", error: 'There is already an account named "claude-01".', field: "name" }, 409);
    if (one.body?.name === "x".repeat(41)) return answer({ code: "bad-request", error: "too long", field: "name" }, 400);
    if (one.body?.name === "silent") return answer({ code: "no-link", error: "The sign-in gave no address to approve it at: the CLI said nothing" }, 422);
    if (one.body?.name === "early") return answer({ code: "node-not-ready", error: "u63 has no ready workplace to sign in on yet." }, 409);
    if (one.body?.account === "elsewhere") return answer({ code: "login-elsewhere", error: "claude-02 was signed in on u9, not on the PC you sign in on now." }, 409);
    if (one.body?.account === "theirs") return answer({ code: "unknown-account", error: "There is no account theirs." }, 404);
    if (one.body?.account === "mine") return answer({ login: LOGIN, url: "https://example.com/authorize?state=x", name: "claude-02" }, 201);

    return answer({ login: LOGIN, url: "https://example.com/authorize?state=x", name: typeof one.body?.name === "string" ? one.body.name : "claude-03" }, 201);
  }

  if (one.method === "POST" && one.path === `/claude-logins/${LOGIN}/code`) {
    if (typeof one.body?.code !== "string" || one.body.code === "") return answer({ code: "bad-request", error: "Paste the code the sign-in page shows.", field: "code" }, 400);

    return one.body.code === "wrong" ? answer({ code: "sign-in-refused", error: "refused" }, 422) : answer({ ok: true, accounts: [] });
  }

  return answer({ code: "no-sign-in", error: "none" }, 404);
});
const sent = agency.asked;

const post = await routeOf<unknown>("../../apps/web/server/api/supply/[...path].post");

const call = (path: string, body: unknown) => asked(post, { method: "POST", path: `/api/supply/${path}`, body } as RouteEvent);

test("a new login's start names no name, and the agency's name comes back", async () => {
  sent.length = 0;

  expect((await call("signin", {})).answer).toEqual({ login: LOGIN, url: "https://example.com/authorize?state=x", name: "claude-03" });
  expect(sent.at(-1)).toMatchObject({ method: "POST", path: "/claude-logins", body: {} });

  expect(await call("signin", { account: "main", name: "claude-03" })).toMatchObject({ status: 400, message: wording("agents.error.login_which") });
});

test("the reader's own login is signed in again by its id, and its refusals are each said as what they are", async () => {
  sent.length = 0;

  expect((await call("signin", { account: "mine" })).answer).toMatchObject({ login: LOGIN, name: "claude-02" });
  expect(sent.at(-1)).toMatchObject({ method: "POST", path: "/claude-logins", body: { account: "mine" } });

  expect(await call("signin", { account: "elsewhere" })).toMatchObject({ status: 409, message: wording("agents.error.login_elsewhere") });
  expect(await call("signin", { account: "theirs" })).toMatchObject({ status: 404, message: wording("agents.error.login_unknown") });
  expect(await call("signin", { name: "early" })).toMatchObject({ status: 409, message: wording("supply.error.node_setting_up") });
});

test("a name another account holds, one that is no name and a sign-in with no address are each said as what they are", async () => {
  expect(await call("signin", { name: "claude-01" })).toMatchObject({ status: 409, message: wording("agents.error.login_name_taken") });
  expect(await call("signin", { name: "x".repeat(41) })).toMatchObject({ status: 400, message: wording("agents.error.login_name_refused"), data: { field: "name" } });
  expect(await call("signin", { name: "silent" })).toMatchObject({ message: wording("agents.error.login_no_link") });
});

test("the code reaches the sign-in whole, and every refusal of it is said in its own sentence", async () => {
  sent.length = 0;

  expect((await call(`signin/${LOGIN}/code`, { code: " abc#state " })).answer).toBeNull();
  expect(sent.at(-1)).toMatchObject({ method: "POST", path: `/claude-logins/${LOGIN}/code`, body: { code: "abc#state" } });

  expect(await call(`signin/${LOGIN}/code`, { code: "wrong" })).toMatchObject({ message: wording("agents.error.login_refused") });
  // A sign-in the agency no longer holds, ended, past its time or lost to a restart, is said as expired.
  expect(await call("signin/gone/code", { code: "abc" })).toMatchObject({ status: 404, message: wording("agents.error.login_gone") });

  sent.length = 0;
  expect(await call(`signin/${LOGIN}/code`, { code: "  " })).toMatchObject({ status: 400, message: wording("agents.error.login_code_needed"), data: { field: "code" } });
  expect(sent).toHaveLength(0);
});

test("no refusal on the way is said as the one sentence for a refused value", async () => {
  for (const [path, body] of [["signin", { name: "claude-01" }], ["signin", { name: "x".repeat(41) }], ["signin", { account: "elsewhere" }], ["signin", { account: "theirs" }], ["signin", { name: "early" }], [`signin/${LOGIN}/code`, { code: "" }], ["signin/gone/code", { code: "abc" }]] as const) {
    expect((await call(path, body)).message).not.toBe(wording("agents.error.field_refused"));
  }
});
