// The account service as the console reaches it (docs/accounts.md; docs/boundary.md, 「What the server
// serves」): every route the console asks the server on, over HTTP with the server's token, and sumida's
// session routes under `/sumida`, which take the session cookie instead. The service holds the decisions;
// this module only asks, through the client generated from the service's OpenAPI document.

import {
  accountServiceClient,
  type AccountServiceClient,
  type Member,
  type Members,
  type PersonMove,
  type People as WirePeople,
  type Person as WirePerson,
  type SectionRow,
  type Sections,
  type Session as WireSession,
  type SessionError,
  type Accepted,
  type Invite,
  type InviteUnit,
  type InviteView,
  type Proof,
  type RoomCallers,
  type SenderLink,
  type Unit,
  type Rebound,
  type PairingApproved,
  type PairingCredential,
  type PairingMade,
  type PairingView,
  type UserNode,
  type UnitRow,
  type UserUnit,
  type UserList,
  type UserProfile as WireProfile,
  type WireError
} from "@web/server-client";

import type { PersonView } from "#shared/people";
import type { SecretFile, SecretKind } from "#shared/secret-kinds";
import type { KeptSecret } from "#shared/types";
import type { CompanyBmoView, OwnBmoParts, OwnBmoView, PermissionSetting, PermissionTree } from "#shared/bmo-profile";

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
): Promise<{ id: UserId; name: string; fullName: string } | null> {
  const client = sumidaClientOf(options);
  const reply = await sent(
    options,
    client.GET("/sumida/me", { headers: signedHeaders(address, cookie) })
  );

  if (reply.response.status === 401 || reply.response.status === 403) return null;
  if (!reply.response.ok) throw refusalOf(reply.response, reply.error);

  const session: WireSession | undefined = reply.data;

  return session === undefined ? null : { id: String(session.id), name: session.username, fullName: session.fullName?.trim() ?? "" };
}

/** A session ended; one already gone is ended too. */
export async function signOut(cookie: string, address: string, options: ServiceOptions = {}): Promise<void> {
  const client = sumidaClientOf(options);

  await sent(
    options,
    client.DELETE("/sumida/auth/session", { headers: signedHeaders(address, cookie) })
  );
}

/** A user as the console reads them: `name` is the login, `fullName` the person's name, empty where none stands
 * (docs/accounts.md, 「Users and senders」). */
export interface ServiceUser {
  id: UserId;
  name: string;
  fullName: string;
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

  return { id: said.user, name: said.name, fullName: said.fullName ?? "", administrator: said.administrator, senders: said.senders };
}

/** The senders among `senders` linked to a user, each with that user and whether they may sign in; a sender linked
 * to none is absent. */
export async function senderLinks(senders: readonly number[], options: ServiceOptions = {}): Promise<SenderLink[]> {
  if (senders.length === 0) return [];

  const client = clientOf(options);
  const reply = await sent(options, client.POST("/senders/users", { body: { senders: [...senders] } }));

  return answered(reply).links;
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

/** Every member of the reader's company, each by account key and name alone, in the directory's order. */
export async function companyMembers(caller: ProfileCaller, options: ServiceOptions = {}): Promise<Member[]> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.GET("/users/members", { params: { header: { "Owner-Key": caller.key, "Owner-Role": caller.role } } })
  );

  return answered<Members>(reply).members;
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

/** A user's person's name, job title and contact details, empty where the account keeps none. */
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

/** A user's person's name, job title and contact details written whole, answered as they now stand. */
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

/**
 * Every secret a person's own space holds, in the order of their names, asked by that person: `user` is the login's
 * user, handed on in `Owner-Key` and named in the path alike, so no call reaches another person's space.
 */
export async function listSecrets(user: string, options: ServiceOptions = {}): Promise<KeptSecret[]> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.GET("/users/{user}/secrets", { params: { path: { user }, header: { "Owner-Key": user } } })
  );

  return answered(reply).secrets.map(({ name, bytes, changedAt, kind }) => ({ name, bytes, changedAt, ...(kind ? { kind } : {}) }));
}

/**
 * A value written under a name in the login's own space, replacing the one the name holds only where `replace` says
 * so; the name, its size and its time, never the value. A refusal is the server's code, which never carries the
 * value either.
 */
export async function keepSecret(
  name: string,
  file: SecretFile,
  replace: boolean,
  user: string,
  options: ServiceOptions = {}
): Promise<KeptSecret> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.PUT("/users/{user}/secrets/{name}", {
      params: { path: { user, name }, header: { "Owner-Key": user } },
      body: { value: file.value, encoding: file.encoding, replace }
    })
  );
  const kept = answered(reply);

  return { name: kept.name, bytes: kept.bytes, changedAt: kept.changedAt };
}

/** The secret under a name in the login's own space moved aside to `<name>.previous`. */
export async function dropSecret(name: string, user: string, options: ServiceOptions = {}): Promise<void> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.DELETE("/users/{user}/secrets/{name}", {
      params: { path: { user, name }, header: { "Owner-Key": user } }
    })
  );

  if (!reply.response.ok) throw refusalOf(reply.response, reply.error);
}

/** A kind as the console reads it, from the server's wire shape. */
function kindOf(kind: SecretKind): SecretKind {
  return {
    key: kind.key,
    name: kind.name,
    description: kind.description,
    fields: kind.fields.map(({ key, label, masked, input, required }) => ({ key, label, masked, input, required }))
  };
}

/** Every secret kind, in the order they were added (docs/boundary.md, 「Secret kinds」), the deployment's for any login. */
export async function listSecretKinds(options: ServiceOptions = {}): Promise<SecretKind[]> {
  const client = clientOf(options);
  const reply = await sent(options, client.GET("/secret-kinds", {}));

  return answered(reply).kinds.map(kindOf);
}

/** A kind added, as the server keeps it. */
export async function addSecretKind(kind: SecretKind, role: OwnerRole, options: ServiceOptions = {}): Promise<SecretKind> {
  const client = clientOf(options);
  const reply = await sent(options, client.POST("/secret-kinds", { params: { header: { "Owner-Role": role } }, body: kind }));

  return kindOf(answered(reply));
}

/** A kind changed whole under its key, as the server keeps it. */
export async function putSecretKind(kind: SecretKind, role: OwnerRole, options: ServiceOptions = {}): Promise<SecretKind> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.PUT("/secret-kinds/{key}", { params: { path: { key: kind.key }, header: { "Owner-Role": role } }, body: kind })
  );

  return kindOf(answered(reply));
}

/** A kind removed; no secret stored is touched. */
export async function dropSecretKind(key: string, role: OwnerRole, options: ServiceOptions = {}): Promise<void> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.DELETE("/secret-kinds/{key}", { params: { path: { key }, header: { "Owner-Role": role } } })
  );

  if (!reply.response.ok) throw refusalOf(reply.response, reply.error);
}

/** Every unit, companies first and each unit after its parent, for the administrator's organisation section. */
export async function listUnits(caller: ProfileCaller, options: ServiceOptions = {}): Promise<UnitRow[]> {
  const client = clientOf(options);
  const reply = await sent(options, client.GET("/units", { params: { header: { "Owner-Key": caller.key, "Owner-Role": caller.role } } }));

  return answered(reply).units;
}

/** A unit made under a parent, or a new company where none is named. */
export async function makeUnit(name: string, parent: number | null, caller: ProfileCaller, options: ServiceOptions = {}): Promise<Unit> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.POST("/units", {
      params: { header: { "Owner-Key": caller.key, "Owner-Role": caller.role } },
      body: parent === null ? { name } : { name, parent }
    })
  );

  return answered(reply);
}

/** A unit renamed, or moved under another parent of its company. */
export async function changeUnit(
  unit: number,
  change: { name?: string; parent?: number },
  caller: ProfileCaller,
  options: ServiceOptions = {}
): Promise<Unit> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.PATCH("/units/{unit}", { params: { path: { unit }, header: { "Owner-Key": caller.key, "Owner-Role": caller.role } }, body: change })
  );

  return answered(reply);
}

/** A user granted head of a unit, or the grant taken away. */
export async function setHead(unit: number, user: UserId, head: boolean, caller: ProfileCaller, options: ServiceOptions = {}): Promise<void> {
  const client = clientOf(options);
  const params = { path: { unit, user }, header: { "Owner-Key": caller.key, "Owner-Role": caller.role } };
  const reply = await sent(options, head ? client.PUT("/units/{unit}/heads/{user}", { params }) : client.DELETE("/units/{unit}/heads/{user}", { params }));

  if (!reply.response.ok) throw refusalOf(reply.response, reply.error);
}

/** A room's callers, and whether the login may change them, asked as the login `key` acts for. */
export async function roomCallers(room: number, key: string, options: ServiceOptions = {}): Promise<RoomCallers> {
  const client = clientOf(options);
  const reply = await sent(options, client.GET("/rooms/{chat}/callers", { params: { path: { chat: room }, header: { "Owner-Key": key } } }));

  return answered(reply);
}

/** Whether the user `actor` may let `user` into a room or take them out (docs/accounts.md, 「A room's callers」). */
export async function checkEntry(room: number, actor: UserId | number, user: UserId | number, options: ServiceOptions = {}): Promise<CheckAnswer> {
  const client = clientOf(options);
  const reply = await sent(options, client.POST("/checks/entry", { body: { room, actor: userPath(actor), user: userPath(user) } }));
  const said = answered(reply);

  return { allowed: said.allowed, grant: said.grant, user: userPath(user) };
}

/** A sender linked to a user where it is linked to none, asked as the administrator (docs/accounts.md, 「Users and
 * senders」); a link already standing answers as made. */
export async function linkSender(user: UserId | number, sender: number, options: ServiceOptions = {}): Promise<void> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.PUT("/users/{user}/senders/{sender}", { params: { path: { user: userPath(user), sender }, header: { "Owner-Role": "administrator" } } })
  );

  if (!reply.response.ok) throw refusalOf(reply.response, reply.error);
}

/** A user made a caller of a room, or no longer one, asked as the login `key` acts for. */
export async function setRoomCaller(room: number, user: UserId, caller: boolean, key: string, options: ServiceOptions = {}): Promise<void> {
  const client = clientOf(options);
  const params = { path: { chat: room, user }, header: { "Owner-Key": key } };
  const reply = await sent(options, caller ? client.PUT("/rooms/{chat}/callers/{user}", { params }) : client.DELETE("/rooms/{chat}/callers/{user}", { params }));

  if (!reply.response.ok) throw refusalOf(reply.response, reply.error);
}

/** An account marked left, its sign-in disabled. */
export async function markLeft(user: UserId, caller: ProfileCaller, options: ServiceOptions = {}): Promise<void> {
  const client = clientOf(options);
  const params = { path: { user }, header: { "Owner-Key": caller.key, "Owner-Role": caller.role } };
  const reply = await sent(options, client.POST("/users/{user}/leave", { params }));

  if (!reply.response.ok) throw refusalOf(reply.response, reply.error);
}

/** A user placed in a unit. */
export async function placeUser(user: UserId, unit: number, caller: ProfileCaller, options: ServiceOptions = {}): Promise<UserUnit> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.PUT("/users/{user}/unit", { params: { path: { user }, header: { "Owner-Key": caller.key, "Owner-Role": caller.role } }, body: { unit } })
  );

  return answered(reply);
}

/** Several people moved into a unit in one act, each its head or a member; the unit as it then stands. */
export async function movePeople(unit: number, people: PersonMove[], caller: ProfileCaller, options: ServiceOptions = {}): Promise<Unit> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.POST("/units/{unit}/members", { params: { path: { unit }, header: { "Owner-Key": caller.key, "Owner-Role": caller.role } }, body: { people } })
  );

  return answered(reply);
}

/** What an invitation is made with: its unit, whether it makes the unit's head, how many hours it stands open, and
 * the person's name, empty where the maker gives none. */
export interface InviteMaking {
  unit: number;
  head: boolean;
  hours: number;
  fullName: string;
}

/** An invitation made into a unit by the login `caller` acts for. */
export async function makeInvite(making: InviteMaking, caller: ProfileCaller, options: ServiceOptions = {}): Promise<Invite> {
  const client = clientOf(options);
  const { unit, head, hours, fullName } = making;
  const body = fullName === "" ? { unit, head, hours } : { unit, head, hours, fullName };
  const reply = await sent(
    options,
    client.POST("/invites", { params: { header: { "Owner-Key": caller.key, "Owner-Role": caller.role } }, body })
  );

  return answered(reply);
}

/** The open invitations the login made, every open one for the administrator. */
export async function listInvites(caller: ProfileCaller, options: ServiceOptions = {}): Promise<Invite[]> {
  const client = clientOf(options);
  const reply = await sent(options, client.GET("/invites", { params: { header: { "Owner-Key": caller.key, "Owner-Role": caller.role } } }));

  return answered(reply).invites;
}

/** The units the login may invite into. */
export async function inviteUnits(caller: ProfileCaller, options: ServiceOptions = {}): Promise<InviteUnit[]> {
  const client = clientOf(options);
  const reply = await sent(options, client.GET("/invites/units", { params: { header: { "Owner-Key": caller.key, "Owner-Role": caller.role } } }));

  return answered(reply).units;
}

/** An invitation taken back. */
export async function dropInvite(token: string, caller: ProfileCaller, options: ServiceOptions = {}): Promise<void> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.DELETE("/invites/{token}", { params: { path: { token }, header: { "Owner-Key": caller.key, "Owner-Role": caller.role } } })
  );

  if (!reply.response.ok) throw refusalOf(reply.response, reply.error);
}

/** An invitation as its link shows it, or null where no invitation has the token. */
export async function inviteView(token: string, options: ServiceOptions = {}): Promise<InviteView | null> {
  const client = clientOf(options);
  const reply = await sent(options, client.GET("/invites/{token}", { params: { path: { token } } }));

  if (reply.response.status === 404) return null;

  return answered(reply);
}

/** What an invitation is accepted with: the login, the password and the person's name. */
export interface Acceptance {
  name: string;
  password: string;
  fullName: string;
}

/** An invitation accepted with a login, a password and the person's name. */
export async function acceptInvite(token: string, acceptance: Acceptance, options: ServiceOptions = {}): Promise<Accepted> {
  const client = clientOf(options);
  const reply = await sent(options, client.POST("/invites/{token}/accept", { params: { path: { token } }, body: acceptance }));

  return answered(reply);
}

/** Whether the invited account's machine is attached, the account enabled where it is. */
export async function proveInvite(token: string, options: ServiceOptions = {}): Promise<Proof> {
  const client = clientOf(options);
  const reply = await sent(options, client.POST("/invites/{token}/proof", { params: { path: { token } } }));

  return answered(reply);
}

/** The machine an account is bound to and whether the hub holds it. */
export async function userNode(id: UserId | number, options: ServiceOptions = {}): Promise<UserNode> {
  const client = clientOf(options);
  const reply = await sent(options, client.GET("/users/{user}/node", { params: { path: { user: userPath(id) } } }));

  return answered(reply);
}

/**
 * An account bound to another machine, the one `agent` names or a fresh name, by the administrator; `shared` binds a
 * machine several accounts share.
 */
export async function rebindNode(user: UserId, agent: string | null, shared: boolean, caller: ProfileCaller, options: ServiceOptions = {}): Promise<Rebound> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.PUT("/users/{user}/node", {
      params: { path: { user }, header: { "Owner-Key": caller.key, "Owner-Role": caller.role } },
      body: { ...(agent === null ? {} : { agent }), ...(shared ? { shared } : {}) }
    })
  );

  return answered(reply);
}

/** An account bound to no machine any more, by the administrator. */
export async function unbindNode(user: UserId, caller: ProfileCaller, options: ServiceOptions = {}): Promise<void> {
  const client = clientOf(options);
  const reply = await sent(options, client.DELETE("/users/{user}/node", { params: { path: { user }, header: { "Owner-Key": caller.key, "Owner-Role": caller.role } } }));

  if (!reply.response.ok) throw refusalOf(reply.response, reply.error);
}

/** The account's machine declared shared with other accounts, or no longer shared, by the administrator. */
export async function shareNode(user: UserId, shared: boolean, caller: ProfileCaller, options: ServiceOptions = {}): Promise<UserNode> {
  const client = clientOf(options);
  const reply = await sent(
    options,
    client.PUT("/users/{user}/node/shared", {
      params: { path: { user }, header: { "Owner-Key": caller.key, "Owner-Role": caller.role } },
      body: { shared }
    })
  );

  return answered(reply);
}

/** The account's machine as the hub holds it now, recorded as proven where it does. */
export async function proveNode(id: UserId | number, options: ServiceOptions = {}): Promise<UserNode> {
  const client = clientOf(options);
  const reply = await sent(options, client.POST("/users/{user}/node/proof", { params: { path: { user: userPath(id) } } }));

  return answered(reply);
}

/** A desktop pairing asked for the browser at `address`, with no sign-in (docs/accounts.md, 「Desktop pairing」). */
export async function askPairing(address: string, options: ServiceOptions = {}): Promise<PairingMade> {
  const client = clientOf(options);
  const reply = await sent(options, client.POST("/desktop/pairings", { params: { header: { "X-Real-IP": address } } }));

  return answered(reply);
}

/** The app's read of its pairing: null while it waits, the machine and its credential once approved, answered once. */
export async function readPairing(pairing: string, options: ServiceOptions = {}): Promise<PairingCredential | null> {
  const client = clientOf(options);
  const reply = await sent(options, client.GET("/desktop/pairings/{pairing}", { params: { path: { pairing } } }));

  if (reply.response.status === 202) return null;

  return answered(reply);
}

/** A desktop pairing as the signed-in person `key` reads it by its code. */
export async function pairingByCode(code: string, key: string, options: ServiceOptions = {}): Promise<PairingView> {
  const client = clientOf(options);
  const reply = await sent(options, client.GET("/desktop/pairings/code/{code}", { params: { path: { code }, header: { "Owner-Key": key } } }));

  return answered(reply);
}

/** A desktop pairing approved by the signed-in person `key` for their own machine. */
export async function approvePairing(code: string, key: string, options: ServiceOptions = {}): Promise<PairingApproved> {
  const client = clientOf(options);
  const reply = await sent(options, client.POST("/desktop/pairings/code/{code}/approve", { params: { path: { code }, header: { "Owner-Key": key } } }));

  return answered(reply);
}

/** A desktop pairing refused by the signed-in person `key`. */
export async function refusePairing(code: string, key: string, options: ServiceOptions = {}): Promise<void> {
  const client = clientOf(options);
  const reply = await sent(options, client.POST("/desktop/pairings/code/{code}/refuse", { params: { path: { code }, header: { "Owner-Key": key } } }));

  if (!reply.response.ok) throw refusalOf(reply.response, reply.error);
}

// A person's BMO profile (docs/accounts.md, 「A person's BMO profile」): a company's default, a person's own, the
// profile standing for a person, and who may personalise their BMO. The profile's own reads and writes go through the
// generated client; a picture's bytes are asked on the route's address, the generated client carrying no bytes.

type Wire = import("@web/server-client").components["schemas"];

/** The caller a profile is read as where the console applies it to a BMO: the administrator's role, which every
 * profile route answers. */
const APPLYING: ProfileCaller = { key: "", role: "administrator" };

function profileHeaders(caller: ProfileCaller): { "Owner-Key": string; "Owner-Role": ProfileCaller["role"] } {
  return { "Owner-Key": caller.key, "Owner-Role": caller.role };
}

// The profile as the console's screens and its apply read it, with the deployment's own name left null for the pack.
function standingOf(wire: Wire["AgentProfile"]): Omit<OwnBmoView, "hasBmo"> {
  return {
    personalize: wire.personalize,
    name: { value: wire.name.name ?? null, from: wire.name.from },
    callNames: { value: wire.callNames.callNames, from: wire.callNames.from },
    persona: { value: wire.persona.persona ?? null, from: wire.persona.from },
    picture: { from: wire.picture.from },
    own: { name: wire.own.name ?? null, callNames: wire.own.callNames, persona: wire.own.persona ?? null, picture: wire.own.picture }
  };
}

/** A picture's bytes and their type, as the service keeps them. */
export interface PictureBytes {
  bytes: Uint8Array;
  type: string;
}

// A picture route asked on its address: its bytes read back, set from bytes, or taken away. A refusal is read as every
// other route's.
async function pictureCall(path: string, caller: ProfileCaller, init: { method: "GET" | "PUT" | "DELETE"; picture?: PictureBytes }, options: ServiceOptions = {}): Promise<PictureBytes | null> {
  const address = addressOf(options);

  if (address === "") throw new AccountServiceDown("(no address)", "no address is set for the server");

  let response: Response;

  try {
    response = await fetch(`${address}${path}`, {
      method: init.method,
      headers: {
        authorization: `Bearer ${options.token ?? process.env.WEB_SERVER_TOKEN ?? ""}`,
        ...profileHeaders(caller),
        ...(init.picture === undefined ? {} : { "content-type": init.picture.type })
      },
      ...(init.picture === undefined ? {} : { body: new Blob([new Uint8Array(init.picture.bytes)], { type: init.picture.type }) })
    });
  } catch (error) {
    throw new AccountServiceDown(address, error instanceof Error ? error.message : "the call did not carry");
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as RefusalBody | undefined;

    throw refusalOf(response, body);
  }

  if (init.method !== "GET") return null;

  return { bytes: new Uint8Array(await response.arrayBuffer()), type: response.headers.get("content-type") ?? "application/octet-stream" };
}

/** A company's default for its people's BMOs. */
export async function companyBmoOf(company: number, caller: ProfileCaller, options: ServiceOptions = {}): Promise<CompanyBmoView> {
  const reply = await sent(options, clientOf(options).GET("/companies/{company}/agent", { params: { path: { company }, header: profileHeaders(caller) } }));
  const answer = answered(reply);

  return { name: answer.name ?? null, callNames: answer.callNames, picture: answer.picture };
}

/** A company's default name and call names replaced, answered as they now stand. */
export async function setCompanyBmo(company: number, ask: { name: string | null; callNames: string[] }, caller: ProfileCaller, options: ServiceOptions = {}): Promise<CompanyBmoView> {
  const reply = await sent(options, clientOf(options).PUT("/companies/{company}/agent", { params: { path: { company }, header: profileHeaders(caller) }, body: ask }));
  const answer = answered(reply);

  return { name: answer.name ?? null, callNames: answer.callNames, picture: answer.picture };
}

/** A company's default picture. */
export async function companyBmoPictureOf(company: number, caller: ProfileCaller, options: ServiceOptions = {}): Promise<PictureBytes> {
  return (await pictureCall(`/companies/${company}/agent/picture`, caller, { method: "GET" }, options))!;
}

/** A company's default picture set from its bytes. */
export async function setCompanyBmoPicture(company: number, picture: PictureBytes, caller: ProfileCaller, options: ServiceOptions = {}): Promise<void> {
  await pictureCall(`/companies/${company}/agent/picture`, caller, { method: "PUT", picture }, options);
}

/** A company's default picture taken away. */
export async function dropCompanyBmoPicture(company: number, caller: ProfileCaller, options: ServiceOptions = {}): Promise<void> {
  await pictureCall(`/companies/${company}/agent/picture`, caller, { method: "DELETE" }, options);
}

/** The profile standing for a person, read as the administrator where no caller is named. */
export async function standingBmoOf(user: UserId | number, caller: ProfileCaller = APPLYING, options: ServiceOptions = {}): Promise<Omit<OwnBmoView, "hasBmo">> {
  const reply = await sent(options, clientOf(options).GET("/users/{user}/agent", { params: { path: { user: userPath(user) }, header: profileHeaders(caller) } }));

  return standingOf(answered(reply));
}

/** A person's own text parts replaced, answered as the profile now stands. */
export async function setOwnBmo(user: UserId | number, parts: OwnBmoParts, caller: ProfileCaller, options: ServiceOptions = {}): Promise<Omit<OwnBmoView, "hasBmo">> {
  const reply = await sent(options, clientOf(options).PUT("/users/{user}/agent", { params: { path: { user: userPath(user) }, header: profileHeaders(caller) }, body: parts }));

  return standingOf(answered(reply));
}

/** The picture standing for a person, their own or their company's, read as the administrator where no caller is
 * named. */
export async function bmoPictureOf(user: UserId | number, caller: ProfileCaller = APPLYING, options: ServiceOptions = {}): Promise<PictureBytes> {
  return (await pictureCall(`/users/${encodeURIComponent(userPath(user))}/agent/picture`, caller, { method: "GET" }, options))!;
}

/** A person's own picture set from its bytes. */
export async function setOwnBmoPicture(user: UserId | number, picture: PictureBytes, caller: ProfileCaller, options: ServiceOptions = {}): Promise<void> {
  await pictureCall(`/users/${encodeURIComponent(userPath(user))}/agent/picture`, caller, { method: "PUT", picture }, options);
}

/** A person's own picture taken away. */
export async function dropOwnBmoPicture(user: UserId | number, caller: ProfileCaller, options: ServiceOptions = {}): Promise<void> {
  await pictureCall(`/users/${encodeURIComponent(userPath(user))}/agent/picture`, caller, { method: "DELETE" }, options);
}

/** Who under a unit may personalise their BMO, read as the administrator where no caller is named. */
export async function permissionTreeOf(unit: number, caller: ProfileCaller = APPLYING, options: ServiceOptions = {}): Promise<PermissionTree> {
  const reply = await sent(options, clientOf(options).GET("/units/{unit}/agent-permissions", { params: { path: { unit }, header: profileHeaders(caller) } }));
  const answer = answered(reply);

  return {
    units: answer.units.map((one) => ({ id: one.id, name: one.name, parent: one.parent ?? null, setting: one.setting, allowed: one.allowed })),
    people: answer.people.map((one) => ({ user: one.user, name: one.name, unit: one.unit, setting: one.setting, allowed: one.allowed }))
  };
}

/** The personalisation setting on a unit. */
export async function setUnitPermission(unit: number, setting: PermissionSetting, caller: ProfileCaller, options: ServiceOptions = {}): Promise<void> {
  const reply = await sent(options, clientOf(options).PUT("/units/{unit}/agent-permission", { params: { path: { unit }, header: profileHeaders(caller) }, body: { setting } }));

  if (!reply.response.ok) throw refusalOf(reply.response, reply.error);
}

/** The personalisation setting on one person. */
export async function setUserPermission(user: UserId | number, setting: PermissionSetting, caller: ProfileCaller, options: ServiceOptions = {}): Promise<void> {
  const reply = await sent(options, clientOf(options).PUT("/users/{user}/agent-permission", { params: { path: { user: userPath(user) }, header: profileHeaders(caller) }, body: { setting } }));

  if (!reply.response.ok) throw refusalOf(reply.response, reply.error);
}
