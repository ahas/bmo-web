//! The account service's OpenAPI 3.1 document (`docs/openapi.json`): every route the server exposes, in the
//! common wire format. The bodies' schemas are generated from this crate's own types; the TypeScript package is
//! generated from this document.

use std::collections::BTreeMap;

use schemars::JsonSchema;
use schemars::Schema;
use schemars::generate::{SchemaGenerator, SchemaSettings};
use serde_json::{Map, Value, json};

use crate::types::*;
use crate::wire::{SessionError, WireError};

/// Where the schemas the routes refer to stand in the document.
const SCHEMAS: &str = "/components/schemas";

const DESCRIPTION: &str = "The web console's server: the account service on sumida, which holds the users, the \
  senders linked to them, the grants they hold, the account model they stand in, the room holdings the \
  receiver asks about, the fixed lines a room says, and the secret store, which writes the files every unit \
  reads its secrets from and answers no value. Its own routes answer in the common wire format: \
  camelCase keys, times as integers of epoch milliseconds, ids as signed 64-bit integers, and every failure as \
  a non-2xx answer carrying code and error. sumida's session routes are mounted under /sumida and take the \
  session cookie instead of the bearer token; their refusals are sumida's own shape. A user's id is answered as \
  the digits of sumida's whole number, a string a caller hands on as it stands.";

/// Which refusal body a route's failures carry.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Refusal {
  /// The service's own two keys, `code` and `error`.
  Wire,
  /// sumida's session shape.
  Session,
}

/// One route as the document states it.
struct Route {
  id: &'static str,
  tag: &'static str,
  summary: &'static str,
  parameters: Vec<Value>,
  body: Option<Value>,
  answers: Vec<(u16, Option<Value>)>,
  codes: Vec<&'static str>,
  refusal: Refusal,
  security: Option<Value>,
}

fn parameter(name: &str, kind: &str, required: bool) -> Value {
  json!({
    "name": name,
    "in": "query",
    "required": required,
    "schema": { "type": kind },
  })
}

fn integer_path(name: &str) -> Value {
  json!({
    "name": name,
    "in": "path",
    "required": true,
    "schema": { "type": "integer", "format": "int64" },
  })
}

fn string_path(name: &str) -> Value {
  json!({
    "name": name,
    "in": "path",
    "required": true,
    "schema": { "type": "string" },
  })
}

/// The user of the login a call is made for, which the console hands on.
fn owner_key() -> Value {
  json!({
    "name": "Owner-Key",
    "in": "header",
    "required": true,
    "description": "The user of the login the call is made for, its id written as a decimal number.",
    "schema": { "type": "string" },
  })
}

/// The role of the login a call is made for, which the console hands on.
fn owner_role() -> Value {
  json!({
    "name": "Owner-Role",
    "in": "header",
    "required": true,
    "description": "The role of the login the call is made for; the store answers `administrator` alone, and a profile answers its holder or an administrator.",
    "schema": { "type": "string", "enum": ["administrator", "member"] },
  })
}

fn json_answer<Answer: JsonSchema>(generator: &mut SchemaGenerator) -> Option<Value> {
  Some(json!({ "application/json": { "schema": generator.subschema_for::<Answer>() } }))
}

/// The body `POST /words/render` takes: one of the fixed line's codes with its fields, and the language.
fn render_body(generator: &mut SchemaGenerator) -> Option<Value> {
  let line = json!(generator.subschema_for::<FixedLineAsk>());

  Some(json!({
    "allOf": [
      line,
      {
        "type": "object",
        "required": ["language"],
        "properties": {
          "language": {
            "type": "string",
            "description": "The pack's language, `ko`.",
          },
        },
      },
    ],
  }))
}

fn no_answer() -> Option<Value> {
  None
}

impl Route {
  fn operation(self, wire: &Schema, session: &Schema) -> Value {
    let mut responses = Map::new();

    for (status, content) in self.answers {
      let description = match status {
        200 => "Answered.",
        201 => "Made.",
        204 => "Done; no content.",
        _ => "Answered.",
      };
      let mut answer = json!({ "description": description });
      if let Some(content) = content {
        answer["content"] = content;
      }
      responses.insert(status.to_string(), answer);
    }

    if !self.codes.is_empty() {
      let error = match self.refusal {
        Refusal::Wire => wire,
        Refusal::Session => session,
      };
      let codes = self.codes.join(", ");
      responses.insert(
        "default".to_owned(),
        json!({
          "description": format!("A refusal or failure: {codes}"),
          "content": { "application/json": { "schema": error } },
        }),
      );
    }

    let mut operation = json!({
      "operationId": self.id,
      "tags": [self.tag],
      "summary": self.summary,
      "responses": responses,
      "x-codes": self.codes,
    });
    if !self.parameters.is_empty() {
      operation["parameters"] = self.parameters.into();
    }
    if let Some(body) = self.body {
      operation["requestBody"] = json!({
        "required": true,
        "content": { "application/json": { "schema": body } },
      });
    }
    if let Some(security) = self.security {
      operation["security"] = security;
    }

    operation
  }
}

/// The document as JSON.
pub fn openapi() -> Value {
  let mut generator = SchemaSettings::draft2020_12()
    .for_serialize()
    .with(|settings| {
      settings.definitions_path = SCHEMAS.into();
      settings.meta_schema = None;
    })
    .into_generator();
  let wire: Schema = generator.subschema_for::<WireError>();
  let session: Schema = generator.subschema_for::<SessionError>();
  let mut paths: BTreeMap<String, Value> = BTreeMap::new();

  macro_rules! add {
    (
      $method:literal, $path:literal, $id:literal, $tag:literal, $summary:literal,
      params: $params:expr, body: $body:expr, answers: $answers:expr, codes: $codes:expr
    ) => {{
      add!(
        $method, $path, $id, $tag, $summary,
        params: $params, body: $body, answers: $answers, codes: $codes,
        refusal: Refusal::Wire, security: Value::Null
      )
    }};
    (
      $method:literal, $path:literal, $id:literal, $tag:literal, $summary:literal,
      params: $params:expr, body: $body:expr, answers: $answers:expr, codes: $codes:expr,
      refusal: $refusal:expr, security: $security:expr
    ) => {{
      let security = match $security {
        Value::Null => None,
        ref other => Some(other.clone()),
      };
      let route = Route {
        id: $id,
        tag: $tag,
        summary: $summary,
        parameters: $params,
        body: $body,
        answers: $answers,
        codes: $codes,
        refusal: $refusal,
        security,
      };
      let operation = route.operation(&wire, &session);
      let entry = paths.entry($path.to_owned()).or_insert_with(|| json!({}));
      entry[$method.to_lowercase()] = operation;
    }};
  }

  let bearer = || json!([{ "bearerAuth": [] }]);
  let cookie = || json!([{ "session": [] }]);
  let open = || json!([]);

  add!(
    "GET",
    "/health",
    "health",
    "Health",
    "Whether the service is up, its version, and whether the account model is in force.",
    params: vec![],
    body: None,
    answers: vec![(200, json_answer::<Health>(&mut generator))],
    codes: vec![],
    refusal: Refusal::Wire,
    security: open()
  );
  add!(
    "GET",
    "/accounts/model",
    "modelState",
    "Account model",
    "Where the account model stands, and why it is not in force where it is not.",
    params: vec![],
    body: None,
    answers: vec![(200, json_answer::<ModelState>(&mut generator))],
    codes: vec!["database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/accounts/move",
    "moveAccounts",
    "Account model",
    "Writes the account model once, in one transaction; a second call writes nothing.",
    params: vec![],
    body: Some(json!(generator.subschema_for::<MoveAsk>())),
    answers: vec![(200, json_answer::<Moved>(&mut generator))],
    codes: vec!["bad-request", "conflict", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/watching",
    "watching",
    "Watching",
    "The rooms the console has open now, which the receiver reads as it starts.",
    params: vec![],
    body: None,
    answers: vec![(200, json_answer::<Watching>(&mut generator))],
    codes: vec!["unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/watching",
    "putWatching",
    "Watching",
    "Reports the rooms the console has open now.",
    params: vec![],
    body: Some(json!(generator.subschema_for::<WatchingAsk>())),
    answers: vec![(200, json_answer::<Watching>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/senders/{sender}/user",
    "senderUser",
    "Users and senders",
    "The user a sender is linked to.",
    params: vec![integer_path("sender")],
    body: None,
    answers: vec![(200, json_answer::<SenderUser>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/users",
    "users",
    "Users and senders",
    "Every user with their name and whether they are the platform administrator, for the administrator alone.",
    params: vec![owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<UserList>(&mut generator))],
    codes: vec!["unauthorized", "forbidden", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/users/search",
    "searchPeople",
    "Users and senders",
    "The people of the reader's organisation whose name, organisation, job title or permitted contact details hold the words.",
    params: vec![parameter("q", "string", true), parameter("limit", "integer", false), owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<People>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/users/{user}/person",
    "person",
    "Users and senders",
    "One person of the reader's organisation, with the contact details only an administrator or the person themselves may see.",
    params: vec![string_path("user"), owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<Person>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/users/{user}",
    "user",
    "Users and senders",
    "One user: their name, whether they are the platform administrator, and the senders linked to them.",
    params: vec![string_path("user")],
    body: None,
    answers: vec![(200, json_answer::<UserView>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/users/{user}/senders",
    "userSenders",
    "Users and senders",
    "The sender numbers linked to a user.",
    params: vec![string_path("user")],
    body: None,
    answers: vec![(200, json_answer::<Senders>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/users/{user}/password",
    "changePassword",
    "Users and senders",
    "Changes a user's password on the strength of their current one.",
    params: vec![string_path("user")],
    body: Some(json!(generator.subschema_for::<PasswordAsk>())),
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "unauthorized", "wrong-password", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/users/{user}/name",
    "renameUser",
    "Users and senders",
    "Gives a user another name.",
    params: vec![string_path("user")],
    body: Some(json!(generator.subschema_for::<NameAsk>())),
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "unauthorized", "name-taken", "conflict", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/users/{user}/profile",
    "userProfile",
    "Users and senders",
    "A user's job title and contact details, read by the account's holder or an administrator.",
    params: vec![string_path("user"), owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<UserProfile>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/users/{user}/profile",
    "setUserProfile",
    "Users and senders",
    "Writes a user's job title and contact details whole, by the account's holder or an administrator.",
    params: vec![string_path("user"), owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<UserProfile>())),
    answers: vec![(200, json_answer::<UserProfile>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/users/{user}/sections",
    "userSections",
    "Users and senders",
    "One user's console sections, each with whether they may read and write it: their own or an administrator's.",
    params: vec![string_path("user"), owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<Sections>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/users/{user}/sections",
    "setUserSections",
    "Users and senders",
    "One user's console sections written whole, by an administrator: every write is also a read.",
    params: vec![string_path("user"), owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<Sections>())),
    answers: vec![(200, json_answer::<Sections>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/invites",
    "makeInvite",
    "Invitations",
    "An invitation made into a unit: by the administrator, or by a head for their unit or one below, never a head's.",
    params: vec![owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<InviteAsk>())),
    answers: vec![(201, json_answer::<Invite>(&mut generator))],
    codes: vec!["bad-request", "forbidden", "not-found", "no-hub", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/invites",
    "invites",
    "Invitations",
    "The open invitations the login made, or every open one for the administrator.",
    params: vec![owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<Invites>(&mut generator))],
    codes: vec!["forbidden", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/invites/units",
    "inviteUnits",
    "Invitations",
    "The units the login may invite into.",
    params: vec![owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<InviteUnits>(&mut generator))],
    codes: vec!["forbidden", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "DELETE",
    "/invites/{token}",
    "dropInvite",
    "Invitations",
    "An invitation taken back by whoever made it, or the administrator.",
    params: vec![string_path("token"), owner_key(), owner_role()],
    body: None,
    answers: vec![(204, no_answer())],
    codes: vec!["forbidden", "not-found", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/invites/{token}",
    "invite",
    "Invitations",
    "An invitation as its link shows it to a person with no account.",
    params: vec![string_path("token")],
    body: None,
    answers: vec![(200, json_answer::<InviteView>(&mut generator))],
    codes: vec!["not-found", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/invites/{token}/accept",
    "acceptInvite",
    "Invitations",
    "An invitation accepted: a disabled account in its unit, bound to its machine, with the machine's install.",
    params: vec![string_path("token")],
    body: Some(json!(generator.subschema_for::<AcceptAsk>())),
    answers: vec![(201, json_answer::<Accepted>(&mut generator))],
    codes: vec!["bad-request", "not-found", "invite-closed", "name-taken", "no-hub", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/invites/{token}/proof",
    "proveInvite",
    "Invitations",
    "Whether the invited account's machine is attached; attached, the account is enabled.",
    params: vec![string_path("token")],
    body: None,
    answers: vec![(200, json_answer::<Proof>(&mut generator))],
    codes: vec!["not-found", "invite-open", "no-hub", "upstream-failed", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/users/{user}/node",
    "userNode",
    "Invitations",
    "The machine an account is bound to, and whether the hub holds it.",
    params: vec![string_path("user")],
    body: None,
    answers: vec![(200, json_answer::<UserNode>(&mut generator))],
    codes: vec!["bad-request", "upstream-failed", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/checks/room",
    "checkRoom",
    "Checks",
    "Whether a sender holds a room relation in a room; a null sender is the room's members alone.",
    params: vec![],
    body: Some(json!(generator.subschema_for::<RoomCheckAsk>())),
    answers: vec![(200, json_answer::<CheckAnswer>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/checks/message",
    "checkMessage",
    "Checks",
    "Whether the sender of a message in a room holds a relation there.",
    params: vec![],
    body: Some(json!(generator.subschema_for::<MessageCheckAsk>())),
    answers: vec![(200, json_answer::<CheckAnswer>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "not-found", "no-such-message", "no-receiver", "upstream-failed", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/checks/object",
    "checkObject",
    "Checks",
    "Whether a user holds a relation on a worker, a repository or a tool capability.",
    params: vec![],
    body: Some(json!(generator.subschema_for::<ObjectCheckAsk>())),
    answers: vec![(200, json_answer::<CheckAnswer>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/checks/unit",
    "checkUnit",
    "Checks",
    "Whether a user heads an organisation unit, through a head grant on it or on a unit above it.",
    params: vec![],
    body: Some(json!(generator.subschema_for::<UnitCheckAsk>())),
    answers: vec![(200, json_answer::<CheckAnswer>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/users/{user}/unit",
    "userUnit",
    "Organisation units",
    "The unit a user stands in, its company, and the units from the company down to it.",
    params: vec![string_path("user")],
    body: None,
    answers: vec![(200, json_answer::<UserUnit>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/units",
    "units",
    "Organisation units",
    "Every unit, companies first and each unit after its parent, for the administrator alone.",
    params: vec![owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<Units>(&mut generator))],
    codes: vec!["unauthorized", "forbidden", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/units",
    "makeUnit",
    "Organisation units",
    "A unit made under a parent, or a new company where none is named, by the administrator.",
    params: vec![owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<NewUnit>())),
    answers: vec![(201, json_answer::<Unit>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PATCH",
    "/units/{unit}",
    "changeUnit",
    "Organisation units",
    "A unit renamed, or moved under another parent of its company, by the administrator.",
    params: vec![integer_path("unit"), owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<UnitChange>())),
    answers: vec![(200, json_answer::<Unit>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "other-company", "cycle", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/rooms/{chat}/callers",
    "roomCallers",
    "Grants",
    "A room's callers, the users granted ask on it, and whether the signed-in user may change them.",
    params: vec![integer_path("chat"), owner_key()],
    body: None,
    answers: vec![(200, json_answer::<RoomCallers>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/rooms/{chat}/callers/{user}",
    "grantRoomCaller",
    "Grants",
    "A user granted ask on a room, by the administrator, the room's leader or a head of the user's unit.",
    params: vec![integer_path("chat"), string_path("user"), owner_key()],
    body: None,
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "upstream-failed", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "DELETE",
    "/rooms/{chat}/callers/{user}",
    "revokeRoomCaller",
    "Grants",
    "A user's ask grant on a room taken away, by the administrator, the room's leader or a head of the user's unit.",
    params: vec![integer_path("chat"), string_path("user"), owner_key()],
    body: None,
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "upstream-failed", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/users/{user}/leave",
    "markLeft",
    "Organisation units",
    "An account marked left and its sign-in disabled, by the administrator or a head of the user's unit.",
    params: vec![string_path("user"), owner_key(), owner_role()],
    body: None,
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/units/{unit}/heads/{user}",
    "grantHead",
    "Organisation units",
    "A user granted head of a unit, by the administrator.",
    params: vec![integer_path("unit"), string_path("user"), owner_key(), owner_role()],
    body: None,
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "DELETE",
    "/units/{unit}/heads/{user}",
    "revokeHead",
    "Organisation units",
    "A user's head grant on a unit taken away, by the administrator.",
    params: vec![integer_path("unit"), string_path("user"), owner_key(), owner_role()],
    body: None,
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/users/{user}/unit",
    "placeUser",
    "Organisation units",
    "A user placed in a unit, by the administrator.",
    params: vec![string_path("user"), owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<UnitPlacement>())),
    answers: vec![(200, json_answer::<UserUnit>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/units/{unit}",
    "unit",
    "Organisation units",
    "One organisation unit: its parent, company and path, the units directly under it, its heads and its members.",
    params: vec![integer_path("unit")],
    body: None,
    answers: vec![(200, json_answer::<Unit>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/grants",
    "grants",
    "Grants",
    "The grants standing on a room, in the order they were written, none past its expiry.",
    params: vec![parameter("room", "integer", true)],
    body: None,
    answers: vec![(200, json_answer::<Grants>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/grants",
    "grant",
    "Grants",
    "Grants a relation on a room or an object, on the authority of the message's sender.",
    params: vec![],
    body: Some(json!(generator.subschema_for::<GrantAsk>())),
    answers: vec![(200, json_answer::<Granted>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "no-receiver", "upstream-failed", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "DELETE",
    "/grants",
    "revoke",
    "Grants",
    "Takes a grant back, on the authority of the message's sender.",
    params: vec![],
    body: Some(json!(generator.subschema_for::<RevokeAsk>())),
    answers: vec![(200, json_answer::<Revoked>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "no-receiver", "upstream-failed", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/phones",
    "makePhoneKey",
    "Phone keys",
    "Makes a new key for a user's phone, handed out once, with the hash it is kept by.",
    params: vec![],
    body: Some(json!(generator.subschema_for::<PhoneAsk>())),
    answers: vec![(200, json_answer::<PhoneMade>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/phones/adopt",
    "adoptPhone",
    "Phone keys",
    "Carries a token issued before the model onto a key of the same text.",
    params: vec![],
    body: Some(json!(generator.subschema_for::<PhoneAdoptAsk>())),
    answers: vec![(200, json_answer::<PhoneAdopted>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/phones/who",
    "phoneHolder",
    "Phone keys",
    "Whose a phone's key is, where it is a live key of a user who may sign in.",
    params: vec![],
    body: Some(json!(generator.subschema_for::<PhoneWhoAsk>())),
    answers: vec![(200, json_answer::<PhoneHolder>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "DELETE",
    "/phones/{hash}",
    "deletePhoneKey",
    "Phone keys",
    "Takes a phone's key away by its hash.",
    params: vec![string_path("hash")],
    body: None,
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/rooms/{chat}/holdings",
    "roomHoldings",
    "Rooms",
    "What a room holds of the service's, each holding it has at least one of.",
    params: vec![integer_path("chat")],
    body: None,
    answers: vec![(200, json_answer::<Holdings>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/secrets",
    "secrets",
    "Secret store",
    "Every secret the store holds, by its name, with its size and when it last changed; never a value.",
    params: vec![owner_role()],
    body: None,
    answers: vec![(200, json_answer::<Secrets>(&mut generator))],
    codes: vec!["unauthorized", "forbidden", "no-secret-store", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/secrets/{name}",
    "putSecret",
    "Secret store",
    "Writes a value under a name, atomically and with mode 600, keeping the value it replaces as <name>.previous; answers the name, its size and its time alone.",
    params: vec![string_path("name"), owner_role()],
    body: Some(json!(generator.subschema_for::<SecretAsk>())),
    answers: vec![(200, json_answer::<Secret>(&mut generator)), (201, json_answer::<Secret>(&mut generator))],
    codes: vec!["bad-request", "bad-name", "empty-value", "unauthorized", "forbidden", "secret-exists", "not-a-file", "no-secret-store", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "DELETE",
    "/secrets/{name}",
    "deleteSecret",
    "Secret store",
    "Moves a secret's file to <name>.previous.",
    params: vec![string_path("name"), owner_role()],
    body: None,
    answers: vec![(204, no_answer())],
    codes: vec!["bad-name", "unauthorized", "forbidden", "not-found", "not-a-file", "no-secret-store", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/words/render",
    "renderLine",
    "Fixed lines",
    "One fixed line, rendered in the room's language from the server's pack.",
    params: vec![],
    body: render_body(&mut generator),
    answers: vec![(200, json_answer::<Rendered>(&mut generator))],
    codes: vec!["bad-request", "not-found", "unknown-language", "unknown-code", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/sumida/auth/session",
    "signIn",
    "Sessions",
    "Signs in with a name and a password; the session cookie is in Set-Cookie and the body carries nothing.",
    params: vec![],
    body: Some(json!(generator.subschema_for::<LoginAsk>())),
    answers: vec![(200, json_answer::<Empty>(&mut generator))],
    codes: vec!["unauthorized"],
    refusal: Refusal::Session,
    security: open()
  );
  add!(
    "DELETE",
    "/sumida/auth/session",
    "signOut",
    "Sessions",
    "Ends the session this request arrives on.",
    params: vec![],
    body: None,
    answers: vec![(200, json_answer::<Empty>(&mut generator))],
    codes: vec!["unauthorized"],
    refusal: Refusal::Session,
    security: cookie()
  );
  add!(
    "GET",
    "/sumida/me",
    "me",
    "Sessions",
    "The account behind a session.",
    params: vec![],
    body: None,
    answers: vec![(200, json_answer::<Session>(&mut generator))],
    codes: vec!["unauthorized"],
    refusal: Refusal::Session,
    security: cookie()
  );

  let schemas: Map<String, Value> = generator.take_definitions(true);

  json!({
    "openapi": "3.1.0",
    "info": {
      "title": "bmo-web-server",
      "version": crate::VERSION,
      "description": DESCRIPTION,
    },
    "x-layer": "downstream",
    "x-stage": 9,
    "paths": paths,
    "components": {
      "schemas": schemas,
      "securitySchemes": {
        "bearerAuth": { "type": "http", "scheme": "bearer" },
        "session": { "type": "apiKey", "in": "cookie", "name": "bmo.sid" },
      },
    },
  })
}

/// The document as `docs/openapi.json` keeps it: pretty, ending in a line break.
pub fn openapi_json() -> String {
  let mut written = serde_json::to_string_pretty(&openapi()).expect("the document is JSON");

  written.push('\n');
  written
}
