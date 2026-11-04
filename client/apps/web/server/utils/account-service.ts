// The account service as the console reaches it (docs/accounts.md; docs/boundary.md, 「What the server
// serves」): every route the console asks the server on, over HTTP with the server's token, and sumida's
// session routes under `/sumida`, which take the session cookie instead. The service holds the decisions;
// this module only asks, through the client generated from the service's OpenAPI document.

import {
  accountServiceClient,
  type AccountServiceClient,
  type People as WirePeople,
  type Person as WirePerson,
  type SectionRow,
  type Sections,
  type Session as WireSession,
  type SessionError,
  type UserList,
  type UserProfile as WireProfile,
  type WireError
} from "@web/server-client";

import type { PersonView } from "#shared/people";
import type { KeptSecret } from "#shared/types";

/** The server's base address; `WEB_SERVER_ADDRESS` where none is given. */
export interface ServiceOptions {
  address?: string;
  token?: string;
}

/** A user as the server names them: the id it gives, a string handed on as it stands. */
export type UserId = string;

/** The service did not answer at all: nothing listens at its address, or the connection broke. */
export class AccountServiceDown extends Error {
  constructor(readonly address: string, why: string) {
    super(`bmo-web-server does not answer at ${address}: ${why}`);
  }
}

/** The service answered and refused, with its status, its code and its sentence. */
export class AccountRefusal extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail: string
  ) {
    super(detail);
  }
}

type RefusalBody = WireError | SessionError;

/** What one route answered: its body where it has one, its refusal body where it refused, and the answer. */
interface Reply<T> {
  data?: T;
  error?: RefusalBody;
  response: Response;
}

function addressOf(options: ServiceOptions): string {
  return (options.address ?? process.env.WEB_SERVER_ADDRESS ?? "").replace(/\/+$/, "");
}

function clientOf(options: ServiceOptions): AccountServiceClient {
  const address = addressOf(options);

  if (address === "") throw new AccountServiceDown("(no address)", "no address is set for the server");

  return accountServiceClient(address, options.token ?? process.env.WEB_SERVER_TOKEN ?? "");
}

// sumida's own session routes take the session cookie, and a bearer sent there is read as a token and refused
// before the cookie, so they are asked without the service's token.
function sumidaClientOf(options: ServiceOptions): AccountServiceClient {
  const address = addressOf(options);

  if (address === "") throw new AccountServiceDown("(no address)", "no address is set for the server");

  return accountServiceClient(address, "");
}

// A call nothing answered is the service down; a call it answered is read by its status.
async function sent<T>(options: ServiceOptions, asked: Promise<Reply<T>>): Promise<Reply<T>> {
  try {
    return await asked;
  } catch (error) {
    throw new AccountServiceDown(addressOf(options), error instanceof Error ? error.message : "the call did not carry");
  }
}

// The server's own refusal is `{ code, error }`; sumida's session routes answer `{ code, statusCode, reason? }`.
function refusalOf(response: Response, body: RefusalBody | undefined): AccountRefusal {
  if (body === undefined) return new AccountRefusal(response.status, "failed", `the account service answered ${response.status}`);

  return "statusCode" in body
    ? new AccountRefusal(response.status, body.code, body.reason ?? body.code)
    : new AccountRefusal(response.status, body.code, body.error);
}

function answered<T>(reply: Reply<T>): T {
  if (!reply.response.ok) throw refusalOf(reply.response, reply.error);

  if (reply.data === undefined) {
    throw new AccountRefusal(reply.response.status, "failed", "the account service answered with nothing");
  }

  return reply.data;
}

/** Report the rooms the console has open now, for the receiver's start. */
export async function reportWatching(rooms: number[], options: ServiceOptions = {}): Promise<void> {
  const client = clientOf(options);

  await sent(
    options,
    client.PUT("/watching", {
      body: { rooms }
    })
  );
}

/** Whether the model is in force, and why not where it is not. */
export interface ModelState {
  inForce: boolean;
  reason?: string;
}

/** What the service says of the model, or null where it does not answer. */
export async function modelState(options: ServiceOptions = {}): Promise<ModelState | null> {
  try {
    const client = clientOf(options);
    const reply = await sent(options, client.GET("/accounts/model"));
    const state = answered(reply);

    return state.inForce ? { inForce: true } : { inForce: false, reason: state.why ?? undefined };
  } catch (error) {
    if (error instanceof AccountServiceDown) return null;

    throw error;
  }
}

// The headers sumida's own routes are asked with: the browser's address, which a ban reads, and the
// session's cookie where there is one.
function signedHeaders(address: string, cookie?: string): Record<string, string> {
  return cookie === undefined ? { "x-real-ip": address } : { "x-real-ip": address, cookie };
}

/**
 * A sign-in with a name and a password: the session's cookie, as `name=value`, or null where the
 * service refuses the credentials. `address` is the browser's.
 */
export async function signIn(
  name: string,
  password: string,
  address: string,
  options: ServiceOptions = {}
): Promise<string | null> {
  const client = sumidaClientOf(options);
  const reply = await sent(
    options,
    client.POST("/sumida/auth/session", {
      body: { username: name, password, rememberMe: false },
      headers: signedHeaders(address)
    })
  );

  if (reply.response.status === 401 || reply.response.status === 403) return null;
  if (!reply.response.ok) throw refusalOf(reply.response, reply.error);

  const cookie = reply.response.headers.get("set-cookie")?.split(";")[0]?.trim();

  if (cookie === undefined || cookie === "") {
    throw new AccountRefusal(reply.response.status, "failed", "the sign-in answered with no session");
  }

  return cookie;
}

/** Who a session is, or null where it is no live session. */
export async function sessionUser(
  cookie: string,
  address: string,
  options: ServiceOptions = {}
): Promise<{ id: UserId; name: string } | null> {
  const client = sumidaClientOf(options);
  const reply = await sent(
    options,
    client.GET("/sumida/me", { headers: signedHeaders(address, cookie) })
  );

  if (reply.response.status === 401 || reply.response.status === 403) return null;
  if (!reply.response.ok) throw refusalOf(reply.response, reply.error);

  const session: WireSession | undefined = reply.data;

  return session === undefined ? null : { id: String(session.id), name: session.username };
}

/** A session ended; one already gone is ended too. */
export async function signOut(cookie: string, address: string, options: ServiceOptions = {}): Promise<void> {
  const client = sumidaClientOf(options);

  await sent(
    options,
    client.DELETE("/sumida/auth/session", { headers: signedHeaders(address, cookie) })
  );
}

/** A user as the console reads them. */
export interface ServiceUser {
  id: UserId;
  name: string;
  administrator: boolean;
  senders: number[];
}

const userPath = (user: UserId | number) => String(user);

/** A user, or null where none has that id. */
export async function userOf(id: UserId | number, options: ServiceOptions = {}): Promise<ServiceUser | null> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.GET("/users/{user}", { params: { path: { user: userPath(id) } } })
  );

  if (reply.response.status === 404) return null;

  const said = answered(reply);

  return { id: said.user, name: said.name, administrator: said.administrator, senders: said.senders };
}

/** A user's password changed on the strength of their current one; false where that does not match. */
export async function changeUserPassword(
  id: UserId | number,
  current: string,
  next: string,
  options: ServiceOptions = {}
): Promise<boolean> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.POST("/users/{user}/password", {
      params: { path: { user: userPath(id) } },
      body: { current, next }
    })
  );

  if (reply.response.ok) return true;
  if (reply.error?.code === "wrong-password") return false;

  throw refusalOf(reply.response, reply.error);
}

/** A user given another name; false where another user holds it. */
export async function renameUser(
  id: UserId | number,
  name: string,
  options: ServiceOptions = {}
): Promise<boolean> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.POST("/users/{user}/name", {
      params: { path: { user: userPath(id) } },
      body: { name }
    })
  );

  if (reply.response.ok) return true;
  if (reply.error?.code === "name-taken") return false;

  throw refusalOf(reply.response, reply.error);
}

/** The login a profile is kept for, as the console hands it on: its user id written as a decimal and its role. */
export interface ProfileCaller {
  key: string;
  role: "administrator" | "member";
}

// A person as the console reads them: a contact detail the account service left out is no value rather than a
// null one.
function personView(person: WirePerson): PersonView {
  return {
    ...person,
    landline: person.landline ?? undefined,
    mobile: person.mobile ?? undefined,
    email: person.email ?? undefined
  };
}

/** The people of the reader's organisation whose name, organisation, job title or permitted contact holds the words. */
export async function searchPeople(
  q: string,
  caller: ProfileCaller,
  options: ServiceOptions = {}
): Promise<PersonView[]> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.GET("/users/search", {
      params: { query: { q }, header: { "Owner-Key": caller.key, "Owner-Role": caller.role } }
    })
  );

  return answered<WirePeople>(reply).people.map(personView);
}

/** One person of the reader's organisation, or null where none stands there or in another organisation. */
export async function personOf(
  id: UserId | number,
  caller: ProfileCaller,
  options: ServiceOptions = {}
): Promise<PersonView | null> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.GET("/users/{user}/person", {
      params: { path: { user: userPath(id) }, header: { "Owner-Key": caller.key, "Owner-Role": caller.role } }
    })
  );

  if (reply.response.status === 404) return null;

  return personView(answered<WirePerson>(reply));
}

/** Every user, for the administrator's screen that sets one person's sections. */
export async function listUsers(caller: ProfileCaller, options: ServiceOptions = {}): Promise<UserList["users"]> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.GET("/users", { params: { header: { "Owner-Key": caller.key, "Owner-Role": caller.role } } })
  );

  return answered<UserList>(reply).users;
}

/** One user's console sections, read as the login `caller` acts for. */
export async function sectionsOf(
  id: UserId | number,
  caller: ProfileCaller,
  options: ServiceOptions = {}
): Promise<SectionRow[]> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.GET("/users/{user}/sections", {
      params: { path: { user: userPath(id) }, header: { "Owner-Key": caller.key, "Owner-Role": caller.role } }
    })
  );

  return answered<Sections>(reply).sections;
}

/** One user's console sections written whole, answered as they now stand. */
export async function setSections(
  id: UserId | number,
  sections: SectionRow[],
  caller: ProfileCaller,
  options: ServiceOptions = {}
): Promise<SectionRow[]> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.PUT("/users/{user}/sections", {
      params: { path: { user: userPath(id) }, header: { "Owner-Key": caller.key, "Owner-Role": caller.role } },
      body: { sections }
    })
  );

  return answered<Sections>(reply).sections;
}

/** A user's job title and contact details, empty where the account keeps none. */
export async function profileOf(
  id: UserId | number,
  caller: ProfileCaller,
  options: ServiceOptions = {}
): Promise<WireProfile> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.GET("/users/{user}/profile", {
      params: { path: { user: userPath(id) }, header: { "Owner-Key": caller.key, "Owner-Role": caller.role } }
    })
  );

  return answered(reply);
}

/** A user's job title and contact details written whole, answered as they now stand. */
export async function setProfile(
  id: UserId | number,
  profile: WireProfile,
  caller: ProfileCaller,
  options: ServiceOptions = {}
): Promise<WireProfile> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.POST("/users/{user}/profile", {
      params: { path: { user: userPath(id) }, header: { "Owner-Key": caller.key, "Owner-Role": caller.role } },
      body: profile
    })
  );

  return answered(reply);
}

/** A phone's new key, handed out once, and the hash it is kept by. */
export async function makePhoneKey(
  id: UserId | number,
  options: ServiceOptions = {}
): Promise<{ key: string; hash: string }> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.POST("/phones", { body: { user: userPath(id) } })
  );
  const made = answered(reply);

  return { key: made.key, hash: made.hash };
}

/** A token issued before the model carried onto a key of the same text; its hash. */
export async function adoptPhone(
  token: string,
  id: UserId | number,
  options: ServiceOptions = {}
): Promise<string> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.POST("/phones/adopt", { body: { token, user: userPath(id) } })
  );

  return answered(reply).hash;
}

/** Whose a phone's key is, or null where it is no live key. */
export async function phoneHolder(
  key: string,
  options: ServiceOptions = {}
): Promise<{ user: UserId; name: string; hash: string } | null> {
  const client = clientOf(options);
  const reply = await sent(options, client.POST("/phones/who", { body: { key } }));

  if (reply.response.status === 401) return null;

  return answered(reply);
}

/** A phone's key taken away by its hash; one already gone is taken away too. */
export async function deletePhoneKey(hash: string, options: ServiceOptions = {}): Promise<void> {
  const client = clientOf(options);

  await sent(
    options,
    client.DELETE("/phones/{hash}", { params: { path: { hash } } })
  );
}

/** What a check answered: whether it opens, the grant it asked for, and the user it was made for. */
export interface CheckAnswer {
  allowed: boolean;
  grant: string;
  user: UserId | null;
}

/** Whether a sender holds a room relation in a room; a null sender is the room's members alone. */
export async function checkRoom(
  room: number,
  sender: number | null,
  relation: string,
  options: ServiceOptions = {}
): Promise<CheckAnswer> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.POST("/checks/room", { body: { room, sender, relation } })
  );
  const said = answered(reply);

  return { allowed: said.allowed, grant: said.grant, user: said.user ?? null };
}

/** Whether a user holds a relation on a worker, a repository or a tool capability. */
export async function checkObject(
  kind: string,
  object: string,
  relation: string,
  id: UserId | number,
  options: ServiceOptions = {}
): Promise<CheckAnswer> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.POST("/checks/object", {
      body: { kind, object, relation, user: userPath(id) }
    })
  );
  const said = answered(reply);

  return { allowed: said.allowed, grant: said.grant, user: userPath(id) };
}

/** What the data move is handed: what only the other units hold (docs/accounts.md, 「The data move」). */
export interface MoveRequest {
  ownerSenders: number[];
  rooms: number[];
  roomRules: { room: number; id: string; subject: number; words: string }[];
}

/** The data move, run once; a second call answers that it is done. */
export async function runMove(
  request: MoveRequest,
  options: ServiceOptions = {}
): Promise<{ done: boolean; written: boolean; administrator: UserId | null }> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.POST("/accounts/move", {
      body: { ownerSenders: request.ownerSenders, rooms: request.rooms, roomRules: request.roomRules }
    })
  );
  const said = answered(reply);

  return { done: said.done, written: said.written, administrator: said.administrator ?? null };
}

/** The role a login acts in, as the console hands it on in `Owner-Role` (docs/boundary.md, 「Calls the console makes」). */
export type OwnerRole = "administrator" | "member";

/** Every secret the store holds, in the order of their names, asked in the login's role. */
export async function listSecrets(role: OwnerRole, options: ServiceOptions = {}): Promise<KeptSecret[]> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.GET("/secrets", { params: { header: { "Owner-Role": role } } })
  );

  return answered(reply).secrets.map(({ name, bytes, changedAt }) => ({ name, bytes, changedAt }));
}

/**
 * A value written under a name, replacing the one the name holds only where `replace` says so; the name, its
 * size and its time, never the value. A refusal is the server's code, which never carries the value either.
 */
export async function keepSecret(
  name: string,
  value: string,
  replace: boolean,
  role: OwnerRole,
  options: ServiceOptions = {}
): Promise<KeptSecret> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.PUT("/secrets/{name}", {
      params: { path: { name }, header: { "Owner-Role": role } },
      body: { value, replace }
    })
  );
  const kept = answered(reply);

  return { name: kept.name, bytes: kept.bytes, changedAt: kept.changedAt };
}

/** The secret under a name moved aside to `<name>.previous`. */
export async function dropSecret(name: string, role: OwnerRole, options: ServiceOptions = {}): Promise<void> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.DELETE("/secrets/{name}", {
      params: { path: { name }, header: { "Owner-Role": role } }
    })
  );

  if (!reply.response.ok) throw refusalOf(reply.response, reply.error);
}
