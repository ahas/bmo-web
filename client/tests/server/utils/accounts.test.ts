import { afterAll, describe, expect, test } from "bun:test";
import { createApp, eventHandler, toWebHandler } from "h3";

import { signIn } from "../../../apps/web/server/utils/account-service";
import { browserAddress, proxiedAddress, sealState, signedInOf } from "../../../apps/web/server/utils/accounts";
import { standInAccountService } from "../../support/account-service";

// What the console hands the account service of a browser, and whether a seal's login stands (docs/accounts.md,
// 「sumida's own routes」; docs/web.md, 「Access」). What they are held to: the address is the one the reverse proxy
// named in `X-Real-IP`, never one the browser wrote into `X-Forwarded-For`; a seal past its span is gone; a seal
// holding a sumida session stands while the service says so; and a seal holding none stands only while the model is
// not in force.

const service = standInAccountService({ users: [{ id: 2, name: "member-a", password: "a password" }] });

process.env.WEB_SERVER_ADDRESS = service.address;
process.env.WEB_SERVER_TOKEN = service.token;

afterAll(() => {
  service.stop();
  delete process.env.WEB_SERVER_ADDRESS;
  delete process.env.WEB_SERVER_TOKEN;
});

// The address the console reads off a request with these headers.
async function addressOf(headers: Record<string, string>): Promise<string> {
  const app = createApp();

  app.use(eventHandler((event) => browserAddress(event)));

  return await (await toWebHandler(app)(new Request("http://localhost/", { headers }))).text();
}

describe("the browser's address", () => {
  test("is the one the proxy named in X-Real-IP", async () => {
    expect(await addressOf({ "x-real-ip": "203.0.113.7" })).toBe("203.0.113.7");
  });

  test("is never one the browser wrote into X-Forwarded-For", async () => {
    expect(await addressOf({ "x-forwarded-for": "198.51.100.1, 203.0.113.7", "x-real-ip": "203.0.113.7" })).toBe("203.0.113.7");
    expect(await addressOf({ "x-forwarded-for": "198.51.100.1" })).toBe("127.0.0.1");
  });

  test("is the loopback one where the proxy named none", () => {
    expect(proxiedAddress(undefined)).toBe("127.0.0.1");
    expect(proxiedAddress(null)).toBe("127.0.0.1");
    expect(proxiedAddress("  ")).toBe("127.0.0.1");
    expect(proxiedAddress(" 203.0.113.7 ")).toBe("203.0.113.7");
  });
});

describe("whether a seal's login stands", () => {
  // Each reading a window apart, so where the model stands is asked afresh every time.
  let now = Date.now();
  const later = (): number => (now += 20_000);
  const user = { name: "member-a" };

  test("a seal past its span is gone, whatever it holds", async () => {
    const at = later();

    expect(await sealState({ remember: false, loggedInAt: at - 13 * 60 * 60 * 1000 }, "127.0.0.1", at)).toBe("gone");
    expect(await sealState({ remember: false }, "127.0.0.1", at)).toBe("gone");
  });

  test("a seal holding a sumida session stands while the service says it does", async () => {
    const sid = (await signIn("member-a", "a password", "127.0.0.1"))!;
    const at = later();

    expect(await sealState({ sid, remember: false, loggedInAt: at }, "127.0.0.1", at)).toBe("stands");
    expect(await sealState({ sid: "bmo.sid=gone", remember: false, loggedInAt: at }, "127.0.0.1", at)).toBe("gone");
  });

  test("a seal holding no sumida session is gone once the model is in force", async () => {
    service.state.inForce = true;
    const at = later();

    expect(await sealState({ remember: false, loggedInAt: at }, "127.0.0.1", at)).toBe("gone");
  });

  test("a seal holding no sumida session stands as the administrator's before the model", async () => {
    service.state.inForce = false;
    const at = later();

    try {
      expect(await sealState({ remember: false, loggedInAt: at }, "127.0.0.1", at)).toBe("stands");
      expect(await signedInOf({ user })).toEqual({ name: "member-a", id: null, administrator: true });
    } finally {
      service.state.inForce = true;
    }
  });

  test("a seal holding no sumida session has no answer where the service does not say where the model stands", async () => {
    process.env.WEB_SERVER_ADDRESS = "";
    const at = later();

    try {
      expect(await sealState({ remember: false, loggedInAt: at }, "127.0.0.1", at)).toBe("unanswered");
    } finally {
      process.env.WEB_SERVER_ADDRESS = service.address;
      later();
    }
  });
});
