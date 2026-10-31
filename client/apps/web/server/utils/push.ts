import webpush from "web-push";

import { isPushKind, newDevicePushKinds, PUSH_BODY_LIMIT, PUSH_KIND_LIST } from "#shared/config";

import { useWebSql } from "./db";

import type { PushKind } from "#shared/config";
import type { PushDevice, PushPayload } from "#shared/types";

// Ringing the owner's own devices. The console holds the subscriptions and does the sending
// itself rather than asking the bot to: a subscription belongs to a console login, and the bot
// knows nothing about console logins. What the bot supplies is the news, which reaches here on
// the same event stream every screen reads.
//
// The encryption is web-push's. A push payload is sealed to keys the browser generated so the
// push service carrying it cannot read it, which means ECDH on P-256, HKDF and AES-128-GCM to
// an exact wire format, with a signed VAPID header besides. That is a specification to
// implement rather than a piece of logic to write, and getting it subtly wrong fails as
// silently as delivering nothing.

export interface DeviceRow {
  endpoint: string;
  user: string;
  p256dh: string;
  auth: string;
  refused: string;
  createdAt: number;
  lastSentAt: number | null;
}

// Which keys this machine signs with. They are this server's identity to the push services and
// the private half never leaves it, so they live in the environment beside the control token
// rather than in the repository. Without them the console says plainly that it cannot ring.
function vapid(): { subject: string; publicKey: string; privateKey: string } | null {
  const publicKey = process.env.BMO_VAPID_PUBLIC_KEY ?? "";
  const privateKey = process.env.BMO_VAPID_PRIVATE_KEY ?? "";
  const subject = process.env.BMO_VAPID_SUBJECT ?? "mailto:bmo@localhost";

  return publicKey === "" || privateKey === "" ? null : { subject, publicKey, privateKey };
}

export function pushPublicKey(): string | null {
  return vapid()?.publicKey ?? null;
}

// A list of kinds as it is stored: comma-separated, filtered to the ones this console knows, so a
// kind that has been retired is simply no longer named.
export function readKinds(stored: string): PushKind[] {
  return stored
    .split(",")
    .map((kind) => kind.trim())
    .filter(isPushKind);
}

// What a device hears: every kind but the ones it refused. A device stores its refusals rather
// than its choices, so a kind added after it subscribed reaches it without anyone switching it on.
export function receivedKinds(refused: readonly PushKind[]): PushKind[] {
  return PUSH_KIND_LIST.map((kind) => kind.id).filter((kind) => !refused.includes(kind));
}

// The refusals that leave a device hearing exactly the kinds it chose.
export function refusedKinds(chosen: readonly PushKind[]): PushKind[] {
  return PUSH_KIND_LIST.map((kind) => kind.id).filter((kind) => !chosen.includes(kind));
}

// What a caller asked to be rung about. Anything that is not one of the kinds is dropped rather
// than refused, and asking for none of them is asking for nothing, which is a device the owner
// has silenced rather than one to delete.
export function askedKinds(value: unknown): PushKind[] {
  if (!Array.isArray(value)) {
    return newDevicePushKinds();
  }

  return [...new Set(value.filter(isPushKind))];
}

export async function devicesOf(user: string): Promise<PushDevice[]> {
  const rows = await useWebSql().all(`SELECT endpoint, p256dh, auth, refused, created_at AS "createdAt", last_sent_at AS "lastSentAt"
       FROM web_push_devices WHERE user_name = $1 ORDER BY created_at`, user) as DeviceRow[];

  return rows.map((row) => ({
    endpoint: row.endpoint,
    kinds: receivedKinds(readKinds(row.refused)),
    createdAt: row.createdAt,
    lastSentAt: row.lastSentAt
  }));
}

// The names a push service never stands under: this machine's own, and the suffixes a home or a cloud network
// keeps for itself.
const LOCAL_NAMES = ["localhost"];
const LOCAL_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

// Whether a dotted IPv4 address is one the open internet does not route to anybody: unspecified, private, shared,
// loopback, link-local, multicast or reserved.
function closedIpv4(address: string): boolean {
  const [a = 0, b = 0] = address.split(".").map(Number);

  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b < 128) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168);
}

// The eight groups of an IPv6 address as the address parser writes it, its `::` spelled out.
function ipv6Groups(address: string): number[] {
  const [head = "", tail] = address.split("::");
  const groups = (part: string) => (part === "" ? [] : part.split(":").map((group) => Number.parseInt(group, 16)));
  const front = groups(head);
  const back = tail === undefined ? [] : groups(tail);

  return [...front, ...Array<number>(8 - front.length - back.length).fill(0), ...back];
}

// Whether an IPv6 address is one the open internet does not route to anybody: unspecified, loopback, an IPv4
// address carried inside one, unique-local, link-local or multicast.
function closedIpv6(address: string): boolean {
  const groups = ipv6Groups(address);
  const first = groups[0] ?? 0;
  const zeroes = groups.slice(0, 5).every((group) => group === 0);

  return (zeroes && (groups[5] === 0 || groups[5] === 0xffff)) || (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00;
}

/**
 * Whether an endpoint is one the console may send to (docs/web.md, 「Notifications」): an `https:` address naming no
 * user, on a host that is a dotted name outside the local ones or an address on the open internet. The console
 * sends wherever a subscription points, so an endpoint is held to where a push service can stand.
 */
export function pushEndpointAllowed(endpoint: string): boolean {
  let url: URL;

  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }

  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return false;

  const host = url.hostname.replace(/\.$/, "");

  if (host.startsWith("[")) return !closedIpv6(host.slice(1, -1));
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return !closedIpv4(host);

  return host.includes(".") && !LOCAL_NAMES.includes(host) && !LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

// A device subscribing, or the same device saying it wants different news. The endpoint is the
// browser's own name for it, so subscribing twice from one browser moves the one row rather
// than leaving a stale twin behind to be rung for ever. A row stays with the account that made
// it: an endpoint another account holds is left as it stands, and the answer is false.
export async function saveDevice(input: {
  user: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  kinds: PushKind[];
  now: number;
}): Promise<boolean> {
  const written = await useWebSql().run(`INSERT INTO web_push_devices (endpoint, user_name, p256dh, auth, kinds, refused, created_at)
       VALUES ($1, $2, $3, $4, '', $5, $6)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, refused = excluded.refused
         WHERE web_push_devices.user_name = excluded.user_name`, input.endpoint, input.user, input.p256dh, input.auth, refusedKinds(input.kinds).join(","), input.now);

  return written.changes > 0;
}

export async function forgetDevice(user: string, endpoint: string): Promise<void> {
  await useWebSql().run("DELETE FROM web_push_devices WHERE user_name = $1 AND endpoint = $2", user, endpoint);
}

// A push service saying this endpoint is gone. The browser that made it has been cleared, the
// app uninstalled, or the subscription replaced; nothing about it will ever work again, so the
// row goes rather than being retried for ever.
export function isGone(status: number): boolean {
  return status === 404 || status === 410;
}

// One line as a notification carries it: whitespace flattened so a report's paragraphs read as
// a sentence, and cut where a platform would cut it anyway.
export function clipBody(text: string, limit: number = PUSH_BODY_LIMIT): string {
  const flat = text.replace(/\s+/g, " ").trim();

  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}…`;
}

// Whether a device hears a notification: one of the kinds it has not refused. The test ring is no
// kind at all, and every device of the account hears it.
export function deviceHears(refused: string, payload: Pick<PushPayload, "kind">): boolean {
  return payload.kind === "test" || !readKinds(refused).includes(payload.kind);
}

const DEVICE_COLUMNS = `endpoint, user_name AS user, p256dh, auth, refused, created_at AS "createdAt", last_sent_at AS "lastSentAt"`;

// The devices a notification goes to: for a kind, every device that has not refused it; for the
// account screen's test, every device of that one account, whatever each has switched off.
export async function devicesToRing(payload: Pick<PushPayload, "kind">, user?: string): Promise<DeviceRow[]> {
  const sql = useWebSql();

  if (payload.kind === "test") {
    return await sql.all(`SELECT ${DEVICE_COLUMNS} FROM web_push_devices WHERE user_name = $1`, user ?? "") as DeviceRow[];
  }

  return (await sql.all(`SELECT ${DEVICE_COLUMNS} FROM web_push_devices`) as DeviceRow[]).filter((row) => deviceHears(row.refused, payload));
}

// Rings every device that has not refused this kind of news, save those of the accounts named as
// already looking at what it is about.
export async function ring(payload: PushPayload, looking: ReadonlySet<string> = new Set()): Promise<{ sent: number; gone: number }> {
  return await deliver((await devicesToRing(payload)).filter((row) => !looking.has(row.user)), payload);
}

// Rings every device of one account with the test notification.
export async function ringAccount(user: string, payload: PushPayload): Promise<{ sent: number; gone: number }> {
  return await deliver(await devicesToRing({ kind: "test" }, user), payload);
}

// Sends the notification to each device. A device whose subscription is gone is forgotten as it is
// found, and any other failure is left alone: a push service having a bad minute is not a reason to
// stop ringing that device for good.
async function deliver(rows: DeviceRow[], payload: PushPayload): Promise<{ sent: number; gone: number }> {
  const keys = vapid();

  if (keys === null) {
    return { sent: 0, gone: 0 };
  }

  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);

  const body = JSON.stringify(payload);
  const now = Math.floor(Date.now() / 1000);

  let sent = 0;
  let gone = 0;

  for (const row of rows) {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        body
      );
      await useWebSql().run("UPDATE web_push_devices SET last_sent_at = $1 WHERE endpoint = $2", now, row.endpoint);
      sent += 1;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode ?? 0;

      if (isGone(status)) {
        await useWebSql().run("DELETE FROM web_push_devices WHERE endpoint = $1", row.endpoint);
        gone += 1;
        continue;
      }

      // The endpoint stays: a service having a bad minute is not a device to forget. What it
      // said is worth writing down, since a push that never arrives leaves no other trace.
      console.error(
        `push to a device failed${status === 0 ? "" : ` with ${status}`}:`,
        (error as { body?: string; message?: string }).body ?? (error as Error).message
      );
    }
  }

  return { sent, gone };
}
