import { consoleManifest, LAYER_BOUND, LAYER_VERSION, onThisLayer } from "bmo-ui/shared/console-manifest";

import { agencyRoute } from "./agency";
import { ownerKeyOf } from "./owner-key";

import type { SignedIn } from "./accounts";
import type { ConsoleManifest, ConsoleWords } from "bmo-ui/shared/console-manifest";

// A reader's own screens (docs/web.md, 「A reader's own screens」; bmo-ui's `docs/console-bundles.md`, 「A bundle that
// differs per reader」): the screens of the signed-in person's personal apps, read on the tool host's app face under a
// screen session the agency issues for their account (bmo-pocket's `docs/api.md`, 「Personal screens」), each attached
// for that reader alone under the namespace `my`, and relayed for them alone.

/** The prefix every reader's own screen's name and service name stands under, and the path its screen stands under. */
export const PERSONAL_PREFIX = "my-";
export const PERSONAL_PATH = "/my";

/** Whether a name or a path is the readers' own screens', which no unit's manifest may take. */
export function personalName(name: string): boolean {
  return name.startsWith(PERSONAL_PREFIX);
}

export function personalPath(path: string): boolean {
  return path === PERSONAL_PATH || path.startsWith(`${PERSONAL_PATH}/`);
}

/** One of a reader's own screens: the manifest the console assembled for it, its words, its tool and whether the
 * reader's PC answered. */
export interface PersonalBundle {
  manifest: ConsoleManifest;
  words: ConsoleWords;
  tool: string;
  reached: boolean;
}

// One screen as the app face answers it.
interface Faced {
  tool?: unknown;
  name?: unknown;
  screenPath?: unknown;
  title?: unknown;
  icon?: unknown;
  layer?: unknown;
  words?: unknown;
  digest?: unknown;
  stylesheet?: unknown;
}

/** The manifest a reader's own screen reads as, from what the app face answers: its files relayed under `files/` and
 * its digest, its calls under `tools/`, for a member holding a key. */
export function assembledManifest(faced: Faced): unknown {
  const digest = String(faced.digest ?? "");

  return {
    name: faced.name,
    title: faced.title,
    icon: faced.icon,
    screenPath: faced.screenPath,
    serviceName: faced.name,
    layer: faced.layer,
    bundle: `/files/${digest}/module.js`,
    ...(typeof faced.stylesheet === "string" ? { stylesheet: `/files/${digest}/style.css` } : {}),
    words: "/words",
    apiPrefix: "/tools",
    role: "member",
    ownerKey: true
  };
}

/** A screen the app face answered, as the console attaches it, or why it is left out: a manifest that does not read,
 * a name outside the readers' own namespace, or a layer outside the console's range. */
export function personalBundle(faced: Faced, reached: boolean): PersonalBundle | string {
  let manifest: ConsoleManifest;

  try {
    manifest = consoleManifest(assembledManifest(faced));
  } catch (error) {
    return (error as Error).message;
  }

  if (!personalName(manifest.name) || !personalPath(manifest.screenPath)) return `${manifest.name} stands outside the readers' own screens`;

  if (!onThisLayer(manifest)) {
    return `it is built on bmo-ui ${manifest.layer}, and the console runs bmo-ui ${LAYER_VERSION}, which attaches bundles built on bmo-ui ${LAYER_BOUND} up to its own`;
  }

  const words = typeof faced.words === "object" && faced.words !== null && !Array.isArray(faced.words) ? (faced.words as ConsoleWords) : {};

  return { manifest, words, tool: String(faced.tool ?? ""), reached };
}

// The screen session each account's screens are read under, kept until a minute before it lapses.
const SESSION_MARGIN_MS = 60_000;
const sessions = new Map<string, { token: string; expiresAt: number }>();

async function sessionToken(account: string, again: boolean): Promise<string | null> {
  const kept = sessions.get(account);

  if (!again && kept !== undefined && kept.expiresAt - SESSION_MARGIN_MS > Date.now()) return kept.token;

  sessions.delete(account);

  const issued = await agencyRoute<{ token?: unknown; expiresAt?: unknown }>("POST", `/personal-apps/${account}/screen-session`).catch(() => null);

  if (issued === null || typeof issued.token !== "string" || typeof issued.expiresAt !== "number") return null;

  sessions.set(account, { token: issued.token, expiresAt: issued.expiresAt });

  return issued.token;
}

/** The tool host's control socket the settings name; null where they name none. */
export function toolHostSocket(env: NodeJS.ProcessEnv = process.env): string | null {
  const socket = env.BMO_MCP_HOST_SOCKET?.trim() ?? "";

  return socket === "" ? null : socket;
}

/** One request of the app face under the account's screen session; a token the host no longer takes is asked for
 * again once. Null where there is no session or no socket, or the host cannot be reached. */
export async function appFace(account: string, path: string, init: { method?: string; body?: string } = {}): Promise<Response | null> {
  const socket = toolHostSocket();

  if (socket === null) return null;

  for (const again of [false, true]) {
    const token = await sessionToken(account, again);

    if (token === null) return null;

    // The host name is never resolved: the request goes to the socket, which answers every name.
    const response = await fetch(`http://tool-host${path}`, {
      unix: socket,
      method: init.method ?? "GET",
      headers: { authorization: `Bearer ${token}`, ...(init.body === undefined ? {} : { "content-type": "application/json" }) },
      body: init.body
    } as RequestInit).catch(() => null);

    if (response === null) return null;
    if (response.status !== 401 || again) return response;
  }

  return null;
}

// What the console last said of a reader's screen it left out, so a reason is said once while it stands.
const written = new Map<string, string>();

// Each account's screens as last read, a little while, so the relay finds a screen without asking the PC each time.
const LISTED_FOR_MS = 30_000;
const listed = new Map<string, { at: number; bundles: PersonalBundle[] }>();

/** The signed-in reader's own screens; none for a login with no user, or where the agency or the tool host do not
 * answer. `fresh` reads them again rather than taking the list read a moment ago. */
export async function readerScreens(signed: SignedIn, fresh = false): Promise<PersonalBundle[]> {
  const account = ownerKeyOf(signed);

  if (account === null) return [];

  const kept = listed.get(account);

  if (!fresh && kept !== undefined && Date.now() - kept.at < LISTED_FOR_MS) return kept.bundles;

  const response = await appFace(account, "/screens");
  const page = response?.ok === true ? ((await response.json().catch(() => null)) as { items?: Faced[]; reached?: unknown } | null) : null;
  const bundles: PersonalBundle[] = [];

  for (const faced of page?.items ?? []) {
    const read = personalBundle(faced, page?.reached === true);
    const subject = `account ${account}'s screen ${String(faced.name)}`;

    if (typeof read === "string") {
      if (written.get(subject) !== read) console.error(`console bundles: ${subject} is left out: ${read}`);

      written.set(subject, read);
      continue;
    }

    written.delete(subject);
    bundles.push(read);
  }

  listed.set(account, { at: Date.now(), bundles });

  return bundles;
}

/** The signed-in reader's own screen relayed under a service name, or null where none of theirs bears it. */
export async function readerScreen(signed: SignedIn, serviceName: string): Promise<PersonalBundle | null> {
  return (await readerScreens(signed)).find((bundle) => bundle.manifest.serviceName === serviceName) ?? null;
}

/** The service name of the reader's own screen a page address stands under, read from the console's base path, or
 * null where it stands under none of the readers' own screens' path. */
export function personalPageService(baseURL: string, page: string | undefined): string | null {
  if (page === undefined || page === "") return null;

  let path: string;

  try {
    path = new URL(page, "http://console.invalid").pathname;
  } catch {
    return null;
  }

  const base = baseURL.replace(/\/+$/, "");

  if (base !== "" && path.startsWith(`${base}/`)) path = path.slice(base.length);

  const first = path.split("/").filter((part) => part !== "");

  return first[0] === PERSONAL_PATH.slice(1) && first[1] !== undefined ? `${PERSONAL_PREFIX}${first[1]}` : null;
}

// The answer's headers the relay hands on.
const ANSWERED = ["content-type", "content-length", "cache-control"];

/** A reader's own screen's relayed call (docs/web.md, 「A reader's own screens」): a `GET` of `files/<digest>/<path>`
 * is the app face's file, kept for good by the reader's browser; a `POST` of `tools/<entry>` a call of the screen's
 * own tool's entry, its body the arguments. Null for anything else, which is absent. */
export async function relayPersonal(signed: SignedIn, bundle: PersonalBundle, method: string, rest: string[], body: () => Promise<string>): Promise<Response | null> {
  const account = ownerKeyOf(signed);

  if (account === null) return null;

  const [kind, ...below] = rest;
  let response: Response | null;

  if ((method === "GET" || method === "HEAD") && kind === "files" && below.length >= 2) {
    response = await appFace(account, `/screens/${bundle.tool}/${below.join("/")}`);

    // A file under a digest the host no longer names is a new version put since the list was read.
    if (response?.status === 404) await readerScreens(signed, true);
  } else if (method === "POST" && kind === "tools" && below.length === 1) {
    const text = await body();
    let input: unknown;

    try {
      input = text.trim() === "" ? {} : JSON.parse(text);
    } catch {
      return Response.json({ code: "bad-request", error: "the arguments do not read as JSON" }, { status: 400 });
    }

    response = await appFace(account, `/screens/${bundle.tool}/calls`, { method: "POST", body: JSON.stringify({ name: below[0], input }) });
  } else {
    return null;
  }

  if (response === null) return Response.json({ code: "runner-unreached", error: "the tool host could not be reached" }, { status: 502 });

  const headers = new Headers();

  for (const name of ANSWERED) {
    const value = response.headers.get(name);

    if (value !== null) headers.set(name, value);
  }

  return new Response(method === "HEAD" ? null : response.body, { status: response.status, headers });
}
