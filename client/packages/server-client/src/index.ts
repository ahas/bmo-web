// The web console's server API (docs/openapi.json): the types openapi-typescript generates from the document,
// and openapi-fetch's typed calls over them, each route by its path.

import createClient, { type Client } from "openapi-fetch";

import type { components, paths } from "./schema.ts";

export type { components, operations, paths } from "./schema.ts";

type Schemas = components["schemas"];

export type Health = Schemas["Health"];
export type ModelState = Schemas["ModelState"];
export type MoveAsk = Schemas["MoveAsk"];
export type Moved = Schemas["Moved"];
export type SenderUser = Schemas["SenderUser"];
export type UserView = Schemas["UserView"];
export type UserSummary = Schemas["UserSummary"];
export type UserList = Schemas["UserList"];
export type SectionRow = Schemas["SectionRow"];
export type Sections = Schemas["Sections"];
export type Person = Schemas["Person"];
export type People = Schemas["People"];
export type Member = Schemas["Member"];
export type Members = Schemas["Members"];
export type UserProfile = Schemas["UserProfile"];
export type Senders = Schemas["Senders"];
export type Watching = Schemas["Watching"];
export type WatchingAsk = Schemas["WatchingAsk"];
export type CheckAnswer = Schemas["CheckAnswer"];
export type UnitRef = Schemas["UnitRef"];
export type UserUnit = Schemas["UserUnit"];
export type Unit = Schemas["Unit"];
export type PersonMove = Schemas["PersonMove"];
export type PeopleMove = Schemas["PeopleMove"];
export type RoomCaller = Schemas["RoomCaller"];
export type RoomCallers = Schemas["RoomCallers"];
export type UnitRow = Schemas["UnitRow"];
export type Units = Schemas["Units"];
export type Invite = Schemas["Invite"];
export type InviteView = Schemas["InviteView"];
export type Accepted = Schemas["Accepted"];
export type Proof = Schemas["Proof"];
export type UserNode = Schemas["UserNode"];
export type NodeBinding = Schemas["NodeBinding"];
export type Rebound = Schemas["Rebound"];
export type GrantRow = Schemas["GrantRow"];
export type Grants = Schemas["Grants"];
export type Granted = Schemas["Granted"];
export type Revoked = Schemas["Revoked"];
export type PhoneMade = Schemas["PhoneMade"];
export type PhoneHolder = Schemas["PhoneHolder"];
export type Holdings = Schemas["Holdings"];
export type Rendered = Schemas["Rendered"];
export type Secret = Schemas["Secret"];
export type Secrets = Schemas["Secrets"];
export type SecretAsk = Schemas["SecretAsk"];
export type Session = Schemas["Session"];
export type WireError = Schemas["WireError"];
export type SessionError = Schemas["SessionError"];

export type AccountServiceClient = Client<paths>;

/**
 * The account service at `baseUrl`, sending `token` as its bearer token where one is given. Each call is a
 * route of the OpenAPI document, typed by it: `client.GET("/users/{user}", { params: { path: { user } } })`.
 * A client given no token sends no `Authorization` header, which is what sumida's own session routes need:
 * one sent there is read as a token and refused before the session cookie.
 */
export function accountServiceClient(
  baseUrl: string,
  token: string,
  fetcher?: typeof globalThis.fetch
): AccountServiceClient {
  return createClient<paths>({
    baseUrl,
    ...(token === "" ? {} : { headers: { Authorization: `Bearer ${token}` } }),
    ...(fetcher === undefined ? {} : { fetch: fetcher })
  });
}
