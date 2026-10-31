import { expect, test } from "bun:test";

import { scratchWebDatabase } from "../../support/web-database";

// Which devices a notification reaches (docs/web.md, 「Notifications」): a device stores the kinds it
// refused, so a kind added after it subscribed reaches it; the account screen's test reaches every device
// of that account whatever it switched off.

await scratchWebDatabase();

const { useWebSql } = await import("../../../apps/web/server/utils/db");
const { askedKinds, deviceHears, devicesOf, devicesToRing, pushEndpointAllowed, receivedKinds, refusedKinds, saveDevice } = await import("../../../apps/web/server/utils/push");
const { newDevicePushKinds } = await import("../../../apps/web/shared/config");

(globalThis as Record<string, unknown>).useWebSql = useWebSql;

// Four devices, each with the kinds it refused: one refusing two kinds, one refusing nothing, one refusing
// every kind it was offered when it subscribed, and another account's.
for (const [endpoint, user, refused, at] of [
  ["https://push/phone", "owner", "report,mother", 1],
  ["https://push/desk", "owner", "", 2],
  ["https://push/quiet", "owner", "question,report,mother", 3],
  ["https://push/other", "guest", "question,report", 4]
] as const) {
  await useWebSql().run(
    "INSERT INTO web_push_devices (endpoint, user_name, p256dh, auth, kinds, refused, created_at) VALUES ($1, $2, 'k', 'a', '', $3, $4)",
    endpoint,
    user,
    refused,
    at
  );
}

const endpoints = (rows: { endpoint: string }[]) => rows.map((row) => row.endpoint).sort();

test("a device hears every kind it has not refused, a kind added since it subscribed among them", async () => {
  // A refusal of a kind since retired is no longer named, and the room kind came after all of them.
  expect((await devicesOf("owner")).map((device) => device.kinds)).toEqual([["question", "room", "mail"], ["question", "room", "mail"], ["room", "mail"]]);
});

test("a kind reaches every device that has not refused it", async () => {
  expect(endpoints(await devicesToRing({ kind: "mail" }))).toEqual(["https://push/desk", "https://push/other", "https://push/phone", "https://push/quiet"]);
  expect(endpoints(await devicesToRing({ kind: "question" }))).toEqual(["https://push/desk", "https://push/phone"]);
  expect(deviceHears("mail,report", { kind: "mail" })).toBe(false);
  expect(deviceHears("mail,weather", { kind: "question" })).toBe(true);
});

test("the test ring reaches every device of the account and no other, whatever they refused", async () => {
  expect(endpoints(await devicesToRing({ kind: "test" }, "owner"))).toEqual(["https://push/desk", "https://push/phone", "https://push/quiet"]);
  expect(await devicesToRing({ kind: "test" })).toEqual([]);
  expect(deviceHears("question,report,room,mail", { kind: "test" })).toBe(true);
});

test("a device saying what it wants is stored as what it refuses", async () => {
  await saveDevice({ user: "owner", endpoint: "https://push/phone", p256dh: "k", auth: "a", kinds: ["mail", "room"], now: 5 });

  expect(await useWebSql().get("SELECT refused FROM web_push_devices WHERE endpoint = $1", "https://push/phone")).toEqual({ refused: "question" });
  expect((await devicesOf("owner"))[0]!.kinds).toEqual(["room", "mail"]);
});

test("a subscription another account holds is not moved to the one asking, and stays as it was", async () => {
  expect(await saveDevice({ user: "owner", endpoint: "https://push/other", p256dh: "k2", auth: "a2", kinds: [], now: 6 })).toBe(false);

  expect(await useWebSql().get("SELECT user_name AS user, p256dh, refused FROM web_push_devices WHERE endpoint = $1", "https://push/other")).toEqual({ user: "guest", p256dh: "k", refused: "question,report" });
  expect(await saveDevice({ user: "guest", endpoint: "https://push/other", p256dh: "k3", auth: "a3", kinds: ["mail"], now: 7 })).toBe(true);
  expect(await saveDevice({ user: "owner", endpoint: "https://push/new", p256dh: "k", auth: "a", kinds: ["mail"], now: 8 })).toBe(true);
});

test("an endpoint is a push service's address on the open internet", () => {
  for (const endpoint of [
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/abc",
    "https://8.8.8.8/push",
    "https://[2001:4860:4860::8888]/push"
  ]) {
    expect(pushEndpointAllowed(endpoint)).toBe(true);
  }

  for (const endpoint of [
    "http://fcm.googleapis.com/fcm/send/abc",
    "ftp://fcm.googleapis.com/x",
    "not an address",
    "https://user:secret@fcm.googleapis.com/x",
    "https://localhost/x",
    "https://localhost./x",
    "https://printer.localhost/x",
    "https://nas.local/x",
    "https://metadata.google.internal/x",
    "https://router.home.arpa/x",
    "https://intranet/x",
    "https://127.0.0.1:3000/x",
    "https://0x7f.1/x",
    "https://10.1.2.3/x",
    "https://172.16.0.1/x",
    "https://172.31.255.255/x",
    "https://192.168.0.101/x",
    "https://169.254.169.254/latest/meta-data",
    "https://100.64.0.1/x",
    "https://0.0.0.0/x",
    "https://224.0.0.1/x",
    "https://[::1]/x",
    "https://[::]/x",
    "https://[fd00::1]/x",
    "https://[fe80::1]/x",
    "https://[::ffff:127.0.0.1]/x",
    "https://[ff02::1]/x"
  ]) {
    expect(pushEndpointAllowed(endpoint)).toBe(false);
  }

  expect(pushEndpointAllowed("https://172.32.0.1/x")).toBe(true);
});

test("the kinds asked for, heard and refused", () => {
  expect(askedKinds(undefined)).toEqual(newDevicePushKinds());
  expect(newDevicePushKinds()).toEqual(["question", "room", "mail"]);
  expect(askedKinds(["mail", "weather", "mail"])).toEqual(["mail"]);
  expect(receivedKinds(["question", "mail"])).toEqual(["room"]);
  expect(refusedKinds(["question", "mail"])).toEqual(["room"]);
});
