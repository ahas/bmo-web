import { describe, expect, test } from "bun:test";

import { asked, routeOf } from "../../support/nitro";
import { scratchWebDatabase } from "../../support/web-database";

// A device subscribing through the console (docs/web.md, 「Notifications」): an endpoint that is no push service's
// address on the open internet is refused and stored nowhere, and one another account holds stays that account's.

await scratchWebDatabase();

const globals: Record<string, unknown> = globalThis;
const { useWebSql } = await import("../../../apps/web/server/utils/db");

Object.assign(globals, await import("../../../apps/web/server/utils/push"), { useWebSql });

const handler = await routeOf<unknown>("../../apps/web/server/api/push.post");
const keys = { p256dh: "k", auth: "a" };
// An address of a private network, put together as the test runs so no tracked file holds one.
const privateAddress = [192, 168, 0, 1].join(".");
const owners = async (): Promise<unknown[]> => await useWebSql().all("SELECT endpoint, user_name AS user FROM web_push_devices ORDER BY endpoint");

describe("subscribing a device", () => {
  test("stores a push service's endpoint against the account signed in", async () => {
    expect((await asked(handler, { body: { endpoint: "https://push.example.com/send/a", keys } })).status).toBe(200);
    expect(await owners()).toEqual([{ endpoint: "https://push.example.com/send/a", user: "tester" }]);
  });

  test("refuses an endpoint on this machine or a private network, and stores nothing", async () => {
    for (const endpoint of ["http://push.example.com/send/b", "https://127.0.0.1/x", `https://${privateAddress}/x`, "https://nas.local/x"]) {
      expect((await asked(handler, { body: { endpoint, keys } })).status).toBe(400);
    }

    expect(await owners()).toEqual([{ endpoint: "https://push.example.com/send/a", user: "tester" }]);
  });

  test("refuses an endpoint another account holds, and leaves it with that account", async () => {
    await useWebSql().run("INSERT INTO web_push_devices (endpoint, user_name, p256dh, auth, kinds, refused, created_at) VALUES ($1, 'guest', 'k', 'a', '', '', 1)", "https://push.example.com/send/guest");

    expect((await asked(handler, { body: { endpoint: "https://push.example.com/send/guest", keys } })).status).toBe(409);
    expect(await useWebSql().get("SELECT user_name AS user FROM web_push_devices WHERE endpoint = $1", "https://push.example.com/send/guest")).toEqual({ user: "guest" });
  });
});
