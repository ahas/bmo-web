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
export type SendersAsk = Schemas["SendersAsk"];
export type SenderLink = Schemas["SenderLink"];
export type SenderLinks = Schemas["SenderLinks"];
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
export type ProfileAsk = Schemas["ProfileAsk"];
export type Senders = Schemas["Senders"];
export type Watching = Schemas["Watching"];
export type WatchingAsk = Schemas["WatchingAsk"];
export type CheckAnswer = Schemas["CheckAnswer"];
export type UnitRef = Schemas["UnitRef"];
export type UserUnit = Schemas["UserUnit"];
export type Unit = Schemas["UnitView"];
export type RoleRef = Schemas["RoleRef"];
export type KindRef = Schemas["KindRef"];
export type CompanyRoles = Schemas["CompanyRoles"];
export type UnitKinds = Schemas["UnitKinds"];
export type UnitLine = Schemas["UnitLine"];
export type RoleStand = Schemas["RoleStand"];
export type Appointment = Schemas["Appointment"];
export type Post = Schemas["Post"];
export type Posts = Schemas["Posts"];
export type HistoryEntry = Schemas["HistoryEntry"];
export type PersonDetail = Schemas["PersonDetail"];
export type PersonMove = Schemas["PersonMove"];
export type PeopleMove = Schemas["PeopleMove"];
export type RosterCompanies = Schemas["RosterCompanies"];
export type RosterPerson = Schemas["RosterPerson"];
export type RosterPage = Schemas["RosterPage"];
export type RosterDetail = Schemas["RosterDetail"];
export type RoomCaller = Schemas["RoomCaller"];
export type RoomCallers = Schemas["RoomCallers"];
export type UnitRow = Schemas["UnitRow"];
export type Units = Schemas["Units"];
export type Invite = Schemas["Invite"];
export type InviteUnit = Schemas["InviteUnit"];
export type InviteView = Schemas["InviteView"];
export type Accepted = Schemas["Accepted"];
export type Proof = Schemas["Proof"];
export type UserNode = Schemas["UserNode"];
export type MachineKind = Schemas["MachineKind"];
export type NodeBinding = Schemas["NodeBinding"];
export type NodeSharing = Schemas["NodeSharing"];
export type Rebound = Schemas["Rebound"];
export type PairingMade = Schemas["PairingMade"];
export type PairingCredential = Schemas["PairingCredential"];
export type PairingView = Schemas["PairingView"];
export type PairingApproved = Schemas["PairingApproved"];
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
