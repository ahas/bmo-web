// A stand-in for the account service, for the tests of its callers (docs/accounts.md): the routes
// `docs/boundary.md` states, on a loopback port of a test's own and behind a token of its own, answering
// out of what the test seeds rather than out of sumida, so a console test needs neither the server's binary
// nor Valkey. What it decides follows the rules the server's own tests hold sumida to: the administrator
// passes every check; a sender is checked as their linked user and the room's members; a standing rule
// opens its room; an expired grant is none.

import type { SecretKind } from "../../apps/web/shared/secret-kinds";

export interface StandInUser {
  id: number;
  name: string;
  password?: string;
  administrator?: boolean;
  senders?: number[];
  // The machine the account is bound to, whether the hub holds it now, and when it was last proven.
  node?: { agent: string; attached: boolean; provenAt?: number };
}

export interface StandInGrant {
  kind?: string;
  object: string;
  relation: string;
  // `user:<id>` or `bmo_member:<room>`.
  subject: string;
  expiresAt?: number;
  words?: string;
}

export interface StandInSeed {
  inForce?: boolean;
  users?: StandInUser[];
  grants?: StandInGrant[];
  // A user's console sections; a user named in none is given the defaults.
  sections?: StandInSection[];
  // The machines the hub holds beside those the seeded users are bound to and attached.
  hub?: string[];
  // The messages a check on a message reads: room, message, sender.
  messages?: [number, number, number | null][];
}

/** One section's permission as the stand-in keeps it, by the user's id. */
export interface StandInSection {
  user: number;
  section: string;
  read: boolean;
  write: boolean;
}

// What the data move was handed, as the stand-in kept it.
export interface StandInMove {
  ownerSenders?: number[];
  rooms?: number[];
  roomRules?: { room: number; id: string; subject: number; words: string }[];
}

// The message a grant is made on.
interface StandInOn {
  room: number;
  id: number;
}

// A body any route of the stand-in reads. A route reads the fields it names; the rest stand unused.
interface StandInBody {
  // The machine an account is bound to.
  agent?: string;
  username?: string;
  password?: string;
  current?: string;
  next?: string;
  name?: string;
  room?: number;
  sender?: number;
  // A message check names the message's number; a grant names the message and its room.
  message?: number | StandInOn;
  relation?: string;
  kind?: string;
  object?: string;
  user?: string;
  to?: { user?: string; sender?: number; members?: boolean };
  expiresAt?: number;
  words?: string;
  key?: string;
  token?: string;
  // A secret's value, whether it replaces the one its name holds, and how the value carries its bytes.
  value?: unknown;
  replace?: boolean;
  encoding?: unknown;
  // A user's profile.
  jobTitle?: string;
  landline?: string;
  mobile?: string;
  email?: string;
  // A user's console sections, written whole.
  sections?: { section?: string; read?: boolean; write?: boolean }[];
}

/** A user's job title and contact details, as the stand-in keeps them. */
export interface StandInProfile {
  jobTitle: string;
  landline: string;
  mobile: string;
  email: string;
}

// A secret the stand-in's store holds: the value a test reads back to see it arrived, and when it was written.
// A kind as a body carries it, read whole; the kind's own rules are the server's tests'.
function kindOf(body: unknown): SecretKind {
  const raw = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;

  return {
    key: String(raw.key ?? ""),
    name: String(raw.name ?? ""),
    description: String(raw.description ?? ""),
    fields: Array.isArray(raw.fields) ? (raw.fields as SecretKind["fields"]) : []
  };
}

export interface StandInSecret {
  // The bytes written, as the server writes them: a text value's own, a base64 value's decoded.
  bytes: Buffer;
  changedAt: number;
  // The kind the server's list would read off the file, where a test sets one; the stand-in reads none itself.
  kind?: string;
}

/** A desktop pairing as the stand-in keeps it, by its id. */
export interface StandInPairing {
  code: string;
  state: "waiting" | "approved" | "refused";
  // The approver and the machine approved.
  user?: number;
  machine?: string;
}

export interface StandIn {
  address: string;
  token: string;
  // The desktop pairings, by their id, and the address each ask named.
  pairings: Map<string, StandInPairing>;
  pairingAddresses: string[];
  users: StandInUser[];
  grants: StandInGrant[];
  // Each user's sections, by the user's id and the section's name.
  sections: Map<number, Map<string, { read: boolean; write: boolean }>>;
  keys: Map<string, { user: number; key: string }>;
  moves: StandInMove[];
  state: { inForce: boolean };
  // The secret store's files by their address under `env/`, the administrator's by name and anyone else's as
  // `users/<user>/<name>`, and the user each call on the store was made by.
  secrets: Map<string, StandInSecret>;
  secretKeys: (string | null)[];
  // The secret kinds by key, in the order they were added.
  kinds: Map<string, SecretKind>;
  // Each user's profile, by the user's id.
  profiles: Map<number, StandInProfile>;
  // The machines the hub holds beside those the seeded users are bound to and attached.
  hub: Set<string>;
  stop(): void;
}

const ROOM = "bmo_room";
const TOKEN = "a stand-in token";

function hashOf(key: string): string {
  return new Bun.CryptoHasher("sha256").update(`stand-in:${key}`).digest("hex");
}

/** The stand-in, listening on a loopback port of its own until it is stopped. */
export function standInAccountService(seed: StandInSeed = {}): StandIn {
  const users = [...(seed.users ?? [])];
  const grants = [...(seed.grants ?? [])];
  const sections = new Map<number, Map<string, { read: boolean; write: boolean }>>();

  for (const one of seed.sections ?? []) {
    const held = sections.get(one.user) ?? new Map<string, { read: boolean; write: boolean }>();

    held.set(one.section, { read: one.read, write: one.write });
    sections.set(one.user, held);
  }

  // The sections a user made without a word is given: their rooms and their own account.
  const SECTIONS = [
    "live", "mail", "siren", "db", "files", "artifact", "documents", "code", "supervisors", "roles", "repositories",
    "models", "model-files", "research", "monitor", "remote", "brain", "rooms", "account"
  ];
  const sectionsOf = (user: StandInUser): Map<string, { read: boolean; write: boolean }> => {
    const kept = sections.get(user.id);

    if (kept !== undefined) return kept;
    if (user.administrator === true) return new Map(SECTIONS.map((section) => [section, { read: true, write: true }]));

    return new Map([
      ["mail", { read: true, write: false }],
      ["files", { read: true, write: false }],
      ["artifact", { read: true, write: false }],
      ["code", { read: true, write: false }],
      ["remote", { read: true, write: false }],
      ["brain", { read: true, write: false }],
      ["rooms", { read: true, write: false }],
      ["account", { read: true, write: true }]
    ]);
  };
  const messages = new Map((seed.messages ?? []).map(([room, message, sender]) => [`${room}:${message}`, sender]));
  const sessions = new Map<string, number>();
  const keys = new Map<string, { user: number; key: string }>();
  const moves: StandInMove[] = [];
  const state = { inForce: seed.inForce ?? true };
  const secrets = new Map<string, StandInSecret>();
  const secretKeys: (string | null)[] = [];
  const kinds = new Map<string, SecretKind>();
  const profiles = new Map<number, StandInProfile>();
  const hub = new Set(seed.hub ?? []);
  const pairings = new Map<string, StandInPairing>();
  const pairingAddresses: string[] = [];
  const userOfSender = (sender: number | null): StandInUser | undefined =>
    sender === null ? undefined : users.find((user) => (user.senders ?? []).includes(sender));
  const holds = (kind: string, object: string, relation: string, subjects: string[]): boolean =>
    grants.some(
      (one) =>
        (one.kind ?? ROOM) === kind &&
        one.object === object &&
        (one.relation === relation || (kind === ROOM && one.relation === "rule")) &&
        subjects.includes(one.subject) &&
        (one.expiresAt === undefined || one.expiresAt > Date.now())
    );
  const checkRoom = (room: number, sender: number | null, relation: string) => {
    const user = userOfSender(sender);
    const subjects = [`bmo_member:${room}`, ...(user === undefined ? [] : [`user:${user.id}`])];

    return {
      allowed: user?.administrator === true || holds(ROOM, String(room), relation, subjects),
      grant: `${ROOM}:${room}#${relation}`,
      user: user === undefined ? null : String(user.id)
    };
  };
  const json = (body: object, status = 200, headers: Record<string, string> = {}): Response =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  const refused = (status: number, code: string, error: string): Response => json({ code, error }, status);
  const done = (): Response => new Response(null, { status: 204 });
  const cookieOf = (request: Request): string | undefined => request.headers.get("cookie")?.split(";")[0]?.trim();
  const userNamed = (id: string | number): StandInUser | undefined => users.find((one) => String(one.id) === String(id));

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      const body =
        request.method === "GET" || request.method === "HEAD"
          ? null
          : ((await request.json().catch(() => null)) as StandInBody | null);

      // sumida's own session routes take the session cookie, not the token.
      if (path === "/sumida/auth/session" && request.method === "POST") {
        const user = users.find((one) => one.name === body?.username && one.password !== undefined && one.password === body?.password);

        if (user === undefined) return refused(401, "unauthorized", "no account answers to that name");

        const id = crypto.randomUUID();

        sessions.set(`bmo.sid=${id}`, user.id);

        return json({}, 200, { "set-cookie": `bmo.sid=${id}; HttpOnly; Path=/` });
      }
      if (path === "/sumida/auth/session" && request.method === "DELETE") {
        sessions.delete(cookieOf(request) ?? "");

        return json({});
      }
      if (path === "/sumida/me") {
        const user = users.find((one) => one.id === sessions.get(cookieOf(request) ?? ""));

        return user === undefined ? refused(401, "unauthorized", "no live session") : json({ id: user.id, username: user.name });
      }

      if (path === "/health") return json({ ok: true, version: "0.0.0", inForce: state.inForce });
      if (request.headers.get("authorization") !== `Bearer ${TOKEN}`) return refused(401, "unauthorized", "the token is missing or wrong");
      if (path === "/accounts/model") {
        return json(state.inForce ? { inForce: true } : { inForce: false, why: "the data move has not been written" });
      }
      if (path === "/accounts/move") {
        moves.push((body ?? {}) as StandInMove);

        const administrator = users.find((one) => one.administrator);

        return json({ done: true, written: moves.length === 1, administrator: administrator === undefined ? null : String(administrator.id) });
      }
      if (!state.inForce) return refused(503, "not-in-force", "the account model is not in force");
      if (path === "/users" && request.method === "GET") {
        if (request.headers.get("owner-role") !== "administrator") return refused(403, "forbidden", "the users are the administrator's");

        return json(users.map((user) => ({ user: String(user.id), name: user.name, administrator: user.administrator === true })));
      }

      // The desktop pairings: asked by an address, past the tenth from one address refused; read once approved; read,
      // approved and refused by their code for the person `Owner-Key` names.
      if (path === "/desktop/pairings" && request.method === "POST") {
        const address = request.headers.get("x-real-ip") ?? "";

        if (pairingAddresses.filter((one) => one === address).length >= 10) return refused(429, "too-many-pairings", "too many pairings");
        pairingAddresses.push(address);

        const pairing = (pairings.size + 1).toString(16).padStart(64, "0");
        const code = `ABCD-${String(pairings.size + 1).padStart(4, "0")}`;

        pairings.set(pairing, { code, state: "waiting" });

        return json({ pairing, code, expiresAt: 600_000, pollAfterSeconds: 3 }, 201);
      }

      const pairingRead = path.match(/^\/desktop\/pairings\/([0-9a-f]{64})$/);

      if (pairingRead !== null && request.method === "GET") {
        const pending = pairings.get(pairingRead[1]!);

        if (pending === undefined) return refused(404, "not-found", "no pairing has this id");
        if (pending.state === "refused") return refused(410, "pairing-closed", "the pairing is closed");
        if (pending.state === "waiting") return new Response(null, { status: 202 });

        pairings.delete(pairingRead[1]!);

        return json({ node: pending.machine, credential: `${pending.machine}.credential`, hubUrl: "wss://hub.invalid" });
      }

      const byCode = path.match(/^\/desktop\/pairings\/code\/([^/]+?)(\/approve|\/refuse)?$/);

      if (byCode !== null) {
        const reader = userNamed(request.headers.get("owner-key") ?? "");
        const pending = [...pairings.values()].find((one) => one.code === decodeURIComponent(byCode[1]!));

        if (reader === undefined) return refused(403, "forbidden", "the call names no user");
        if (pending === undefined) return refused(404, "not-found", "no pairing has this code");
        if (byCode[2] === undefined) {
          const machine = pending.state === "waiting" ? reader.node?.agent : pending.user === reader.id ? pending.machine : undefined;

          return json({ code: pending.code, expiresAt: 600_000, state: pending.state, ...(machine === undefined ? {} : { machine }) });
        }
        if (pending.state !== "waiting") return refused(410, "pairing-closed", "the pairing is closed");
        if (byCode[2] === "/refuse") {
          pending.state = "refused";

          return done();
        }

        reader.node ??= { agent: `u${reader.id}-fresh`, attached: false };
        Object.assign(pending, { state: "approved", user: reader.id, machine: reader.node.agent });

        return json({ machine: reader.node.agent });
      }

      // The machine a user is bound to; a user bound to none answers no agent.
      const nodeRoute = path.match(/^\/users\/([^/]+)\/node$/);

      if (nodeRoute !== null && request.method === "GET") {
        const user = userNamed(decodeURIComponent(nodeRoute[1]!));

        if (user === undefined) return refused(404, "not-found", "no such user");

        return json({ agent: user.node?.agent ?? null, attached: user.node?.attached ?? false, provenAt: user.node?.provenAt ?? null, left: false });
      }

      // The machine an account is bound to again or taken away, by the administrator alone, and proven once the hub
      // holds it.
      const bindRoute = path.match(/^\/users\/([^/]+)\/node(\/proof)?$/);

      if (bindRoute !== null) {
        const user = userNamed(decodeURIComponent(bindRoute[1]!));

        if (bindRoute[2] === undefined && request.headers.get("owner-role") !== "administrator") return refused(403, "forbidden", "a machine is bound by the administrator");
        if (user === undefined) return refused(404, "not-found", "no such user");

        if (bindRoute[2] !== undefined && request.method === "POST") {
          if (user.node !== undefined && (user.node.attached || hub.has(user.node.agent))) user.node = { ...user.node, attached: true, provenAt: Date.now() };

          return json({ agent: user.node?.agent ?? null, attached: user.node?.attached ?? false, provenAt: user.node?.provenAt ?? null, left: false });
        }
        if (request.method === "PUT") {
          const agent = body?.agent ?? `u${user.id}-fresh`;

          if (users.some((other) => other !== user && other.node?.agent === agent)) return refused(409, "node-taken", "another account is bound to it");

          const attached = hub.has(agent);

          user.node = { agent, attached, provenAt: attached ? Date.now() : undefined };

          return json({ agent, credential: `${agent}.credential`, hubUrl: "wss://hub.invalid", install: { linux: `install ${agent}`, windows: `install.ps1 ${agent}` }, attached });
        }
        if (request.method === "DELETE") {
          if (user.node === undefined) return refused(404, "not-found", "bound to no machine");
          user.node = undefined;

          return done();
        }
      }

      // A user's sections, read by their holder or the administrator and written by the administrator alone.
      const sectionsRoute = path.match(/^\/users\/([^/]+)\/sections$/);

      if (sectionsRoute !== null) {
        const user = userNamed(decodeURIComponent(sectionsRoute[1]!));

        if (user === undefined) return refused(404, "not-found", "no such user");

        const role = request.headers.get("owner-role");
        const key = request.headers.get("owner-key");

        if (request.method === "GET") {
          if (role !== "administrator" && key !== String(user.id)) return refused(403, "forbidden", "a user's sections are their own or an administrator's");

          const held = sectionsOf(user);
          const names = [...new Set([...SECTIONS, ...held.keys()])];

          return json({ sections: names.map((section) => ({ section, ...(held.get(section) ?? { read: false, write: false }) })) });
        }

        if (role !== "administrator") return refused(403, "forbidden", "the sections are an administrator's to set");

        const held = new Map<string, { read: boolean; write: boolean }>();

        for (const row of body?.sections ?? []) {
          if (typeof row.section !== "string") return refused(400, "bad-request", "a section is named");

          const write = row.write === true;

          held.set(row.section, { read: row.read === true || write, write });
        }

        sections.set(user.id, held);

        const names = [...new Set([...SECTIONS, ...held.keys()])];

        return json({ sections: names.map((section) => ({ section, ...(held.get(section) ?? { read: false, write: false }) })) });
      }

      const userRoute = path.match(/^\/users\/([^/]+)$/);

      if (userRoute !== null) {
        const user = userNamed(decodeURIComponent(userRoute[1]!));

        return user === undefined
          ? refused(404, "not-found", "no such user")
          : json({ user: String(user.id), name: user.name, administrator: user.administrator === true, senders: user.senders ?? [] });
      }

      const passwordRoute = path.match(/^\/users\/([^/]+)\/password$/);

      if (passwordRoute !== null) {
        const user = userNamed(decodeURIComponent(passwordRoute[1]!));

        if (user === undefined || user.password !== body?.current) return refused(401, "wrong-password", "the current password does not match");

        user.password = body?.next ?? "";

        return done();
      }

      const nameRoute = path.match(/^\/users\/([^/]+)\/name$/);

      if (nameRoute !== null) {
        const user = userNamed(decodeURIComponent(nameRoute[1]!));
        const name = body?.name ?? "";

        if (users.some((one) => one.name === name && one !== user)) return refused(409, "name-taken", "another user holds that name");
        if (user !== undefined) user.name = name;

        return done();
      }

      // A profile answers its account's holder or an administrator, as the login's user and role are handed on.
      const profileRoute = path.match(/^\/users\/([^/]+)\/profile$/);

      if (profileRoute !== null) {
        const user = userNamed(decodeURIComponent(profileRoute[1]!));

        if (user === undefined) return refused(404, "not-found", "no such user");

        const role = request.headers.get("owner-role");
        const key = request.headers.get("owner-key");

        if (role !== "administrator" && key !== String(user.id)) {
          return refused(403, "forbidden", "a profile is its account's holder's or an administrator's");
        }

        if (request.method === "GET") {
          return json(profiles.get(user.id) ?? { jobTitle: "", landline: "", mobile: "", email: "" });
        }

        const profile = {
          jobTitle: String(body?.jobTitle ?? ""),
          landline: String(body?.landline ?? ""),
          mobile: String(body?.mobile ?? ""),
          email: String(body?.email ?? "")
        };

        profiles.set(user.id, profile);

        return json(profile);
      }

      if (path === "/checks/room") {
        return json(checkRoom(body?.room ?? 0, body?.sender ?? null, body?.relation ?? ""));
      }
      if (path === "/checks/message") {
        const room = body?.room ?? 0;
        const message = typeof body?.message === "number" ? body.message : 0;
        const key = `${room}:${message}`;

        if (!messages.has(key)) return refused(404, "no-such-message", `no message ${message} stands in room ${room}`);

        const sender = messages.get(key) ?? null;

        return json({ ...checkRoom(room, sender, body?.relation ?? ""), sender });
      }
      if (path === "/checks/object") {
        const kind = body?.kind ?? "";
        const object = body?.object ?? "";
        const relation = body?.relation ?? "";
        const user = userNamed(body?.user ?? "");
        const held = user === undefined ? undefined : sectionsOf(user).get(object);
        const bySection = relation === "read" ? held?.read === true || held?.write === true : held?.write === true;

        return json({
          allowed: user?.administrator === true || (kind === "bmo_section" ? bySection : holds(kind, object, relation, [`user:${body?.user ?? ""}`])),
          grant: `${kind}:${object}#${relation}`
        });
      }
      if (path === "/grants" && request.method !== "GET") {
        const on = typeof body?.message === "number" ? null : body?.message;
        const granter = userOfSender(on === null || on === undefined ? null : (messages.get(`${on.room}:${on.id}`) ?? null));
        const kind = body?.room === undefined ? (body?.kind ?? "") : ROOM;
        const object = body?.room === undefined ? (body?.object ?? "") : String(body.room);
        const relation = body?.relation ?? "";

        if (granter?.administrator !== true) return refused(403, "forbidden", "the sender may not grant");

        let subject: string;
        let user: string | null = null;
        const to = body?.to ?? {};

        if (to.members === true) {
          subject = `bmo_member:${object}`;
        } else {
          let holder = to.user !== undefined ? userNamed(to.user) : userOfSender(to.sender ?? null);

          if (holder === undefined && to.sender !== undefined && request.method === "POST") {
            holder = { id: Math.max(0, ...users.map((one) => one.id)) + 1, name: `member-${to.sender}`, senders: [to.sender] };
            users.push(holder);
          }
          if (holder === undefined) return json({ grant: `${kind}:${object}#${relation}`, revoked: 0 });

          subject = `user:${holder.id}`;
          user = String(holder.id);
        }

        const same = (one: StandInGrant): boolean =>
          (one.kind ?? ROOM) === kind && one.object === object && one.relation === relation && one.subject === subject;

        if (request.method === "DELETE") {
          const before = grants.length;

          grants.splice(0, grants.length, ...grants.filter((one) => !same(one)));

          return json({ grant: `${kind}:${object}#${relation}`, revoked: before - grants.length });
        }

        grants.splice(0, grants.length, ...grants.filter((one) => !same(one)));
        grants.push({ kind, object, relation, subject, expiresAt: body?.expiresAt, words: body?.words });

        return json({ grant: `${kind}:${object}#${relation}`, subject, user });
      }
      if (path === "/phones" && request.method === "POST") {
        const key = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
        const hash = hashOf(key);

        keys.set(hash, { user: Number(body?.user), key });

        return json({ key, hash });
      }
      if (path === "/phones/adopt") {
        const token = body?.token ?? "";
        const hash = hashOf(token);

        keys.set(hash, { user: Number(body?.user), key: token });

        return json({ hash });
      }
      if (path === "/phones/who") {
        const hash = hashOf(body?.key ?? "");
        const held = keys.get(hash);
        const user = users.find((one) => one.id === held?.user);

        return held === undefined || user === undefined
          ? refused(401, "unauthorized", "no live key")
          : json({ user: String(user.id), name: user.name, hash });
      }

      // The secret store, as the server's own tests hold it: each space its own user's alone, the administrator's
      // the store's own folder, a plain name, and no value ever answered.
      const secret = path.match(/^\/users\/([^/]+)\/secrets(?:\/([^/]+))?$/);

      if (secret !== null) {
        const key = request.headers.get("owner-key");
        const owner = users.find((user) => String(user.id) === secret[1]);
        const name = secret[2] === undefined ? null : decodeURIComponent(secret[2]);
        const space = owner?.administrator === true ? "" : `users/${secret[1]}/`;
        const kept = (one: string) => {
          const held = secrets.get(space + one)!;

          return { name: one, bytes: held.bytes.length, changedAt: held.changedAt, ...(held.kind === undefined ? {} : { kind: held.kind }) };
        };

        secretKeys.push(key);

        if (key !== secret[1]) return refused(403, "forbidden", "a person's secrets are their own");
        if (owner === undefined) return refused(404, "not-found", "no such user");
        if (name === null) {
          const names = [...secrets.keys()].filter((one) => one.startsWith(space) && !one.slice(space.length).includes("/")).map((one) => one.slice(space.length));

          return json({ secrets: names.sort().map(kept) });
        }
        if (!/^[A-Za-z0-9._-]{1,200}$/.test(name) || name.startsWith(".") || name.endsWith(".previous")) {
          return refused(400, "bad-name", "the name is no secret's");
        }

        if (request.method === "PUT") {
          if (typeof body?.value !== "string") return refused(400, "bad-request", "the body does not read as a secret's");
          if (body.value === "") return refused(400, "empty-value", "the value is empty");

          const standing = secrets.has(space + name);

          if (standing && body.replace !== true) return refused(409, "secret-exists", "a secret stands under the name");

          secrets.set(space + name, { bytes: Buffer.from(body.value, body.encoding === "base64" ? "base64" : "utf8"), changedAt: Date.now() });

          return json(kept(name), standing ? 200 : 201);
        }

        if (!secrets.delete(space + name)) return refused(404, "not-found", "no secret stands under the name");

        return done();
      }

      // The secret kinds, read by any call and changed by the administrator alone; the kind's own rules are the
      // server's tests'.
      const kind = path.match(/^\/secret-kinds(?:\/([^/]+))?$/);

      if (kind !== null) {
        const key = kind[1] === undefined ? null : decodeURIComponent(kind[1]);

        if (key === null && request.method === "GET") return json({ kinds: [...kinds.values()] });
        if (request.headers.get("owner-role") !== "administrator") return refused(403, "forbidden", "the secret kinds are the administrator's");

        if (key === null) {
          const asked = kindOf(body);

          if (kinds.has(asked.key)) return refused(409, "kind-exists", "a kind stands under the key");
          if (asked.fields.length === 0) return refused(400, "bad-kind", "a kind holds one field or more");

          kinds.set(asked.key, asked);

          return json(asked, 201);
        }

        if (!kinds.has(key)) return refused(404, "not-found", "no kind stands under the key");

        if (request.method === "PUT") {
          const asked = kindOf(body);

          if (asked.key !== key) return refused(400, "bad-kind", "a kind's key does not change");

          kinds.set(key, asked);

          return json(asked);
        }

        kinds.delete(key);

        return done();
      }

      const phone = path.match(/^\/phones\/(.+)$/);

      if (phone !== null && request.method === "DELETE") {
        keys.delete(decodeURIComponent(phone[1]!));

        return done();
      }

      return refused(404, "not-found", `no route ${request.method} ${path}`);
    }
  });

  return {
    address: `http://127.0.0.1:${server.port}`,
    token: TOKEN,
    users,
    grants,
    sections,
    keys,
    moves,
    state,
    secrets,
    secretKeys,
    kinds,
    profiles,
    hub,
    pairings,
    pairingAddresses,
    stop() {
      server.stop(true);
    }
  };
}
